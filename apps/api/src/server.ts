import { config } from "dotenv";
config();

import Fastify from "fastify";
import dbPlugin from "./plugins/db.js";
import healthRoutes from "./routes/health.js";
import { runMigrations } from "./boot/migrate.js";

async function start(): Promise<void> {
  const fastify = Fastify({ logger: true });

  fastify.register(dbPlugin);
  fastify.register(healthRoutes);

  const shutdown = async () => {
    try {
      await fastify.close();
    } finally {
      process.exit(0);
    }
  };

  process.on("SIGINT", shutdown);
  process.on("SIGTERM", shutdown);

  try {
    const dbUrl = process.env.DATABASE_URL;
    if (!dbUrl) {
      throw new Error("DATABASE_URL environment variable is required");
    }

    await runMigrations(dbUrl);

    await fastify.listen({
      port: Number(process.env.PORT) || 3001,
      host: "0.0.0.0",
    });
  } catch (err) {
    fastify.log.error(err);
    process.exit(1);
  }
}

start();
