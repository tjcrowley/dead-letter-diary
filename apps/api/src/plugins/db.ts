import fp from "fastify-plugin";
import { Pool } from "pg";
import type { FastifyInstance } from "fastify";

declare module "fastify" {
  interface FastifyInstance {
    pg: Pool;
  }
}

async function dbPlugin(fastify: FastifyInstance): Promise<void> {
  const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
  });

  fastify.decorate("pg", pool);

  fastify.addHook("onClose", async () => {
    await pool.end();
  });
}

export default fp(dbPlugin, {
  name: "db",
});
