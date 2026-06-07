import fp from "fastify-plugin";
import fastifyCookie from "@fastify/cookie";
import fastifyJwt from "@fastify/jwt";
import type { FastifyInstance } from "fastify";

async function authPlugin(fastify: FastifyInstance): Promise<void> {
  // Register cookie support (no signing — JWT handles integrity)
  await fastify.register(fastifyCookie);

  // Register JWT with session cookie extraction
  await fastify.register(fastifyJwt, {
    secret: process.env.SESSION_SECRET || "dev-secret-change-me",
    cookie: {
      cookieName: "session",
      signed: false,
    },
  });
}

export default fp(authPlugin, {
  name: "auth",
  dependencies: ["db"],
});
