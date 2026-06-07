import type { FastifyInstance, FastifyRequest, FastifyReply } from "fastify";
import fp from "fastify-plugin";
import { requireAuth } from "../middleware/requireAuth.js";
import { sendWipeNotification } from "../lib/notification-sender.js";

interface EpitaphBody {
  epitaph: string;
}

/**
 * Wipe routes: POST /api/wipe/panic, GET /api/account/epitaph, POST /api/account/epitaph
 */
async function wipeRoutes(fastify: FastifyInstance): Promise<void> {
  /**
   * GET /api/account/epitaph
   *
   * Returns the authenticated user's epitaph (or null if not yet set).
   * Response: 200 { epitaph: string | null }
   */
  fastify.get(
    "/api/account/epitaph",
    { preHandler: [requireAuth] },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const userId = request.userId;

      const result = await fastify.pg.query(
        "SELECT epitaph FROM users WHERE id = $1",
        [userId]
      );

      const epitaph = result.rows.length > 0
        ? (result.rows[0] as { epitaph: string | null }).epitaph
        : null;

      return reply.status(200).send({ epitaph });
    }
  );

  /**
   * POST /api/account/epitaph
   *
   * Sets the epitaph for the authenticated user. Immutable — 409 if already set.
   * Body: { epitaph: string } — must be 1–500 chars.
   *
   * Success (200): { ok: true }
   * Error (400):   epitaph missing, empty, or exceeds 500 chars
   * Error (409):   epitaph already set (AND epitaph IS NULL guard enforced in SQL)
   */
  fastify.post<{ Body: EpitaphBody }>(
    "/api/account/epitaph",
    { preHandler: [requireAuth] },
    async (request: FastifyRequest<{ Body: EpitaphBody }>, reply: FastifyReply) => {
      const userId = request.userId;
      const { epitaph } = request.body ?? {};

      if (typeof epitaph !== "string" || epitaph.length === 0 || epitaph.length > 500) {
        return reply.status(400).send({ error: "Epitaph must be a non-empty string of at most 500 characters" });
      }

      const result = await fastify.pg.query(
        "UPDATE users SET epitaph = $2, updated_at = now() WHERE id = $1 AND epitaph IS NULL",
        [userId, epitaph]
      );

      if ((result.rowCount ?? 0) === 0) {
        return reply.status(409).send({ error: "Epitaph already set" });
      }

      return reply.status(200).send({ ok: true });
    }
  );

  /**
   * POST /api/wipe/panic
   *
   * Immediate on-demand wipe for authenticated user.
   * No 60s settle window — panic is instant.
   *
   * Success (200): state was 'active'; shard deleted; state set to 'wiped'; push sent.
   * Error (409):   state is not 'active' (pending_wipe, wiped) or no row exists.
   * Error (500):   unexpected DB error (transaction rolled back).
   */
  fastify.post(
    "/api/wipe/panic",
    { preHandler: [requireAuth] },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const userId = request.userId;

      const client = await fastify.pg.connect();
      try {
        await client.query("BEGIN");

        // Lock deadline_state row to prevent concurrent check-ins seeing stale state
        const dsResult = await client.query(
          "SELECT state FROM deadline_state WHERE user_id = $1 FOR UPDATE",
          [userId]
        );

        if (dsResult.rows.length === 0 || (dsResult.rows[0] as { state: string }).state !== "active") {
          await client.query("ROLLBACK");
          return reply.status(409).send({ error: "Not in active state" });
        }

        // Insert wipe_log immediately with shard_deleted=true and confirmed_at=now()
        // (panic wipe: no settle window, both timestamps set together)
        await client.query(
          `INSERT INTO wipe_log (user_id, reason, initiated_at, shard_deleted, confirmed_at)
           VALUES ($1, 'panic', now(), true, now())`,
          [userId]
        );

        // Delete server shard immediately (no settle window for panic)
        await client.query(
          "DELETE FROM server_shards WHERE user_id = $1",
          [userId]
        );

        // Mark state as wiped
        await client.query(
          "UPDATE deadline_state SET state = 'wiped', updated_at = now() WHERE user_id = $1",
          [userId]
        );

        await client.query("COMMIT");
      } catch (err) {
        await client.query("ROLLBACK");
        throw err;
      } finally {
        client.release();
      }

      // Send wipe notification AFTER COMMIT — push is best-effort and should not hold locks
      await sendWipeNotification(fastify.pg, userId, fastify.log);

      return reply.status(200).send({ ok: true });
    }
  );
}

export default fp(wipeRoutes, { name: "wipe-routes" });
