import type { FastifyInstance, FastifyRequest, FastifyReply } from "fastify";
import { requireAuth } from "../middleware/requireAuth.js";

interface SubscribeBody {
  endpoint: string;
  expirationTime?: number | null;
  keys: {
    p256dh: string;
    auth: string;
  };
}

interface UnsubscribeBody {
  endpoint: string;
}

export default async function notificationsRoutes(fastify: FastifyInstance): Promise<void> {
  /**
   * POST /api/notifications/subscribe
   * Upserts a Web Push subscription for the authenticated user.
   * Uses ON CONFLICT on (user_id, subscription->>'endpoint') to deduplicate.
   */
  fastify.post<{ Body: SubscribeBody }>(
    "/api/notifications/subscribe",
    { preHandler: [requireAuth] },
    async (request: FastifyRequest<{ Body: SubscribeBody }>, reply: FastifyReply) => {
      const { endpoint, expirationTime, keys } = request.body;

      if (!endpoint || !keys?.p256dh || !keys?.auth) {
        return reply.status(400).send({ error: "Invalid push subscription: missing endpoint or keys" });
      }

      const subscriptionJson = JSON.stringify({ endpoint, expirationTime: expirationTime ?? null, keys });

      await fastify.pg.query(
        `INSERT INTO notifications (user_id, subscription)
         VALUES ($1, $2::jsonb)
         ON CONFLICT ((user_id), (subscription->>'endpoint'))
         DO UPDATE SET subscription = EXCLUDED.subscription, updated_at = now()`,
        [request.userId, subscriptionJson]
      );

      return reply.status(200).send({ ok: true });
    }
  );

  /**
   * DELETE /api/notifications/subscribe
   * Removes the push subscription matching the given endpoint for the authenticated user.
   */
  fastify.delete<{ Body: UnsubscribeBody }>(
    "/api/notifications/subscribe",
    { preHandler: [requireAuth] },
    async (request: FastifyRequest<{ Body: UnsubscribeBody }>, reply: FastifyReply) => {
      const { endpoint } = request.body;

      if (!endpoint) {
        return reply.status(400).send({ error: "Missing endpoint" });
      }

      await fastify.pg.query(
        `DELETE FROM notifications WHERE user_id = $1 AND subscription->>'endpoint' = $2`,
        [request.userId, endpoint]
      );

      return reply.status(204).send();
    }
  );
}
