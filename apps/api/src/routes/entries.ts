import type { FastifyInstance, FastifyRequest, FastifyReply } from "fastify";
import { requireAuth } from "../middleware/requireAuth.js";

interface EntryBody {
  ciphertext: string; // base64url encoded
  iv: string; // base64url encoded
  aad: string; // base64url encoded JSON: { entryId, userId, wordCount }
}

interface AadPayload {
  entryId: string;
  userId: string;
  wordCount: number;
}

interface EntryParams {
  id: string;
}

const DEFAULT_WORD_MINIMUM = 50;

export default async function entriesRoutes(
  fastify: FastifyInstance
): Promise<void> {
  /**
   * POST /api/entries
   * Stores an encrypted diary entry.
   * Server cannot decrypt (no DMK) but verifies word count from AAD,
   * which is cryptographically bound to ciphertext by AES-GCM.
   */
  fastify.post<{ Body: EntryBody }>(
    "/api/entries",
    { preHandler: [requireAuth] },
    async (request: FastifyRequest<{ Body: EntryBody }>, reply: FastifyReply) => {
      const { ciphertext, iv, aad } = request.body;

      // Parse AAD to extract metadata
      let aadPayload: AadPayload;
      try {
        const aadJson = Buffer.from(aad, "base64url").toString("utf-8");
        aadPayload = JSON.parse(aadJson) as AadPayload;
      } catch {
        return reply.status(400).send({ error: "Invalid AAD format" });
      }

      const { entryId, userId, wordCount } = aadPayload;

      // Verify AAD userId matches authenticated user (prevent spoofing)
      if (userId !== request.userId) {
        return reply.status(403).send({ error: "AAD userId mismatch" });
      }

      // Query user's word_minimum from deadline_state
      const deadlineResult = await fastify.pg.query(
        "SELECT word_minimum FROM deadline_state WHERE user_id = $1",
        [request.userId]
      );

      const wordMinimum =
        deadlineResult.rows.length > 0
          ? (deadlineResult.rows[0].word_minimum as number)
          : DEFAULT_WORD_MINIMUM;

      // Reject entries below minimum word count
      if (wordCount < wordMinimum) {
        return reply.status(400).send({
          error: "Word count below minimum",
          required: wordMinimum,
          actual: wordCount,
        });
      }

      // Store encrypted entry
      const ciphertextBuf = Buffer.from(ciphertext, "base64url");
      const ivBuf = Buffer.from(iv, "base64url");
      const aadBuf = Buffer.from(aad, "base64url");

      await fastify.pg.query(
        `INSERT INTO entries (id, user_id, ciphertext, iv, aad, word_count)
         VALUES ($1, $2, $3, $4, $5, $6)`,
        [entryId, request.userId, ciphertextBuf, ivBuf, aadBuf, wordCount]
      );

      return reply.status(201).send({ id: entryId });
    }
  );

  /**
   * GET /api/entries
   * Returns a list of the authenticated user's diary entries (metadata only).
   * Ciphertext is intentionally excluded — no unnecessary bandwidth, and
   * the server doesn't need to expose ciphertext for listing purposes.
   */
  fastify.get(
    "/api/entries",
    { preHandler: [requireAuth] },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const result = await fastify.pg.query<{
        id: string;
        word_count: number;
        created_at: Date;
      }>(
        `SELECT id, word_count, created_at
         FROM entries
         WHERE user_id = $1
         ORDER BY created_at DESC
         LIMIT 100`,
        [request.userId]
      );

      return reply.send({
        entries: result.rows.map((row) => ({
          id: row.id,
          word_count: row.word_count,
          created_at: row.created_at,
        })),
      });
    }
  );

  /**
   * GET /api/entries/:id
   * Returns the encrypted payload for a single diary entry.
   * The user_id guard (AND user_id = $2) is critical — prevents one user
   * from reading another user's ciphertext.
   * Client decrypts in-browser using the session DMK (server never sees plaintext).
   */
  fastify.get<{ Params: EntryParams }>(
    "/api/entries/:id",
    { preHandler: [requireAuth] },
    async (request: FastifyRequest<{ Params: EntryParams }>, reply: FastifyReply) => {
      const { id } = request.params;

      const result = await fastify.pg.query<{
        id: string;
        ciphertext: Buffer;
        iv: Buffer;
        aad: Buffer;
        word_count: number;
        created_at: Date;
      }>(
        `SELECT id, ciphertext, iv, aad, word_count, created_at
         FROM entries
         WHERE id = $1 AND user_id = $2`,
        [id, request.userId]
      );

      if (result.rows.length === 0) {
        return reply.status(404).send({ error: "Entry not found" });
      }

      const row = result.rows[0];

      return reply.send({
        id: row.id,
        ciphertext: Buffer.from(row.ciphertext).toString("base64url"),
        iv: Buffer.from(row.iv).toString("base64url"),
        aad: Buffer.from(row.aad).toString("base64url"),
        word_count: row.word_count,
        created_at: row.created_at,
      });
    }
  );

  /**
   * GET /api/entries/streak
   * Computes the current consecutive-day streak for the authenticated user.
   * A streak is consecutive calendar days (in user's timezone) with at least one entry.
   * Returns { streak: number, last_entry_date: string | null }
   */
  fastify.get(
    "/api/entries/streak",
    { preHandler: [requireAuth] },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const userId = request.userId;

      // Get user's timezone for date grouping
      const userResult = await fastify.pg.query(
        "SELECT timezone FROM users WHERE id = $1",
        [userId]
      );
      const timezone =
        userResult.rows.length > 0
          ? ((userResult.rows[0] as { timezone: string }).timezone ?? "UTC")
          : "UTC";

      // Query entry dates grouped by calendar day in user's timezone, most recent first
      const result = await fastify.pg.query(
        `SELECT DATE(e.created_at AT TIME ZONE u.timezone) AS entry_date
         FROM entries e
         JOIN users u ON u.id = e.user_id
         WHERE e.user_id = $1
         GROUP BY DATE(e.created_at AT TIME ZONE u.timezone)
         ORDER BY entry_date DESC`,
        [userId]
      );

      if (result.rows.length === 0) {
        return reply.status(200).send({ streak: 0, last_entry_date: null });
      }

      const rows = result.rows as { entry_date: Date }[];
      const lastEntryDate = rows[0].entry_date;

      // Convert a Date to an integer "epoch day" for comparison
      function toEpochDay(d: Date): number {
        return Math.floor(d.getTime() / (24 * 60 * 60 * 1000));
      }

      const nowUTC = new Date();
      const todayEpochDay = toEpochDay(nowUTC);
      const lastEntryEpochDay = toEpochDay(new Date(lastEntryDate));

      // Streak must start today or yesterday (allow for mid-day)
      if (todayEpochDay - lastEntryEpochDay > 1) {
        return reply.status(200).send({
          streak: 0,
          last_entry_date: new Date(lastEntryDate).toISOString().split("T")[0],
        });
      }

      // Walk backwards through consecutive days
      let streak = 1;
      for (let i = 1; i < rows.length; i++) {
        const prevDay = toEpochDay(new Date(rows[i - 1].entry_date));
        const currDay = toEpochDay(new Date(rows[i].entry_date));
        if (prevDay - currDay === 1) {
          streak++;
        } else {
          break;
        }
      }

      const lastEntryDateStr = new Date(lastEntryDate).toISOString().split("T")[0];
      return reply.status(200).send({
        streak,
        last_entry_date: lastEntryDateStr,
      });
    }
  );
}
