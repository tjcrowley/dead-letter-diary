import type { FastifyRequest, FastifyReply } from "fastify";

declare module "fastify" {
  interface FastifyRequest {
    userId: string;
  }
}

interface SessionPayload {
  sub: string;
  sid: string;
}

/**
 * Fastify preHandler hook that verifies the session cookie JWT
 * and validates the session exists in the database.
 */
export async function requireAuth(
  request: FastifyRequest,
  reply: FastifyReply
): Promise<void> {
  try {
    const decoded = await request.jwtVerify<SessionPayload>();
    const { sub, sid } = decoded;

    // Verify session exists and is not expired
    const result = await request.server.pg.query(
      "SELECT id FROM sessions WHERE id = $1 AND user_id = $2 AND expires_at > NOW()",
      [sid, sub]
    );

    if (result.rows.length === 0) {
      return reply.status(401).send({ error: "Session expired or invalid" });
    }

    // Decorate request with userId for downstream handlers
    request.userId = sub;
  } catch {
    return reply.status(401).send({ error: "Session expired or invalid" });
  }
}
