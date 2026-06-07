import { config } from "dotenv";
config();

import Fastify from "fastify";
import dbPlugin from "./plugins/db.js";
import redisPlugin from "./plugins/redis.js";
import authPlugin from "./plugins/auth.js";
import healthRoutes from "./routes/health.js";
import authRoutes from "./routes/auth.js";
import webauthnRoutes from "./routes/webauthn.js";
import cryptoRoutes from "./routes/crypto.js";
import entriesRoutes from "./routes/entries.js";
import deadlinePollerPlugin from "./plugins/deadline-poller.js";
import deadlineRoutes from "./routes/deadline.js";
import notificationsRoutes from "./routes/notifications.js";
import { runMigrations } from "./boot/migrate.js";
import { ensureSecrets } from "./boot/secrets.js";

async function start(): Promise<void> {
  // 1. Auto-generate missing secrets (SESSION_SECRET, VAPID keys, SHARD_ENCRYPTION_KEY)
  await ensureSecrets();

  const fastify = Fastify({ logger: true });

  // 2. HTTPS-only boot check (INST-10)
  //    Caddy sets X-Forwarded-Proto when proxying. Reject plain HTTP requests
  //    for non-localhost hostnames. Localhost is exempt (dev exception).
  const siteHostname = process.env.SITE_HOSTNAME || "localhost";
  const isLocalhostDeployment =
    siteHostname === "localhost" || siteHostname === "127.0.0.1";

  if (!isLocalhostDeployment) {
    fastify.log.warn(
      `HTTPS required for non-localhost deployments. Caddy provides HTTPS automatically. SITE_HOSTNAME=${siteHostname}`
    );
  }

  fastify.addHook(
    "onRequest",
    async (request, reply) => {
      const forwardedProto = request.headers["x-forwarded-proto"];
      const host = request.headers["host"] || "";
      const isLocalHost =
        host.startsWith("localhost") ||
        host.startsWith("127.0.0.1");

      // Reject HTTP requests to non-localhost hostnames
      if (
        forwardedProto === "http" &&
        !isLocalHost &&
        !isLocalhostDeployment
      ) {
        return reply.status(403).send({ error: "HTTPS required" });
      }
    }
  );

  fastify.register(dbPlugin);
  fastify.register(redisPlugin);
  fastify.register(authPlugin);
  fastify.register(deadlinePollerPlugin);
  fastify.register(healthRoutes);
  fastify.register(authRoutes);
  fastify.register(webauthnRoutes);
  fastify.register(cryptoRoutes);
  fastify.register(entriesRoutes);
  fastify.register(deadlineRoutes);
  fastify.register(notificationsRoutes);

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
