import Fastify, { type FastifyInstance } from "fastify";
import fp from "fastify-plugin";
import type { Pool, QueryResult, QueryResultRow } from "pg";

/**
 * Creates a mock pg Pool whose .query() resolves to a configurable result.
 * Override queryFn to control per-test behavior.
 */
export function mockPool(
  queryFn?: (text: string, values?: unknown[]) => Promise<QueryResult<QueryResultRow>>
): Pool {
  const defaultQuery = async (): Promise<QueryResult<QueryResultRow>> => ({
    rows: [],
    command: "SELECT",
    rowCount: 0,
    oid: 0,
    fields: [],
  });

  const pool = {
    query: queryFn ?? defaultQuery,
    end: async () => {},
  } as unknown as Pool;

  return pool;
}

/**
 * Builds a Fastify test app with mock DB and auth plugins registered.
 * Returns the app instance (not listening — use fastify.inject()).
 */
export async function buildTestApp(
  pool?: Pool
): Promise<FastifyInstance> {
  const app = Fastify({ logger: false });

  const pgPool = pool ?? mockPool();

  // Register mock db plugin
  app.register(
    fp(
      async (fastify) => {
        fastify.decorate("pg", pgPool);
      },
      { name: "db" }
    )
  );

  // Dynamically import auth plugin to pick up its decorations
  const { default: authPlugin } = await import("../plugins/auth.js");
  app.register(authPlugin);

  // Don't call app.ready() — let tests register routes first.
  // Tests should use app.inject() which auto-readies, or call app.ready() manually.
  return app;
}

/**
 * Creates a signed JWT session cookie value for testing authenticated routes.
 * Must be called after the app is ready (jwt plugin registered).
 */
export async function createMockSession(
  app: FastifyInstance,
  userId: string,
  sessionId?: string
): Promise<string> {
  const sid = sessionId ?? "test-session-id";
  const token = app.jwt.sign({ sub: userId, sid }, { expiresIn: "7d" });
  return token;
}
