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
}
