import type { FastifyInstance } from "fastify";

export default async function healthRoutes(
  fastify: FastifyInstance
): Promise<void> {
  fastify.get("/api/health", async (request, reply) => {
    try {
      await fastify.pg.query("SELECT 1");
      return reply.send({
        status: "healthy",
        timestamp: new Date().toISOString(),
      });
    } catch (err) {
      fastify.log.error(err, "Database connectivity check failed");
      return reply.status(503).send({
        status: "unhealthy",
        database: "unreachable",
      });
    }
  });
}
