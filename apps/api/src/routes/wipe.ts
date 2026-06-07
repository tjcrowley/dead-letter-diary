import type { FastifyInstance, FastifyRequest, FastifyReply } from "fastify";
import fp from "fastify-plugin";
import { requireAuth } from "../middleware/requireAuth.js";
import { sendWipeNotification } from "../lib/notification-sender.js";

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
async function wipeRoutes(fastify: FastifyInstance): Promise<void> {
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
