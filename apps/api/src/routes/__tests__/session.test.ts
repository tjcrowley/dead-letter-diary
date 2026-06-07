import { describe, it, expect, afterEach, vi } from "vitest";
import { buildTestApp, mockPool, createMockSession } from "../../test-helpers/index.js";
import type { FastifyInstance } from "fastify";
import type { QueryResult, QueryResultRow } from "pg";

// Mock argon2
vi.mock("argon2", () => ({
  default: {
    hash: vi.fn(async (pass: string) => `$argon2id$mock$${pass}`),
    verify: vi.fn(async () => true),
    argon2id: 2,
  },
  hash: vi.fn(async (pass: string) => `$argon2id$mock$${pass}`),
  verify: vi.fn(async () => true),
  argon2id: 2,
}));

describe("GET /api/auth/me", () => {
  let app: FastifyInstance;

  afterEach(async () => {
    if (app) await app.close();
  });

  it("returns user info with valid session cookie (200)", async () => {
    const userId = "user-me-123";
    const sessionId = "session-me-456";

    const pool = mockPool(async () => ({
      rows: [{ id: sessionId }],
      command: "SELECT",
      rowCount: 1,
      oid: 0,
      fields: [],
    }));

    app = await buildTestApp(pool);
    const { default: authRoutes } = await import("../auth.js");
    app.register(authRoutes);

    // Need to await ready before creating mock session
    await app.ready();
    const token = await createMockSession(app, userId, sessionId);

    const res = await app.inject({
      method: "GET",
      url: "/api/auth/me",
      cookies: { session: token },
    });

    expect(res.statusCode).toBe(200);
    expect(res.json().id).toBe(userId);
  });

  it("returns 401 without session cookie", async () => {
    app = await buildTestApp();
    const { default: authRoutes } = await import("../auth.js");
    app.register(authRoutes);

    const res = await app.inject({
      method: "GET",
      url: "/api/auth/me",
    });

    expect(res.statusCode).toBe(401);
  });
});

describe("DELETE /api/auth/session", () => {
  let app: FastifyInstance;

  afterEach(async () => {
    if (app) await app.close();
  });

  it("logs out by clearing session cookie and deleting session row", async () => {
    const userId = "user-logout-123";
    const sessionId = "session-logout-456";
    const deletedCalls: string[] = [];

    const queryResults: QueryResult<QueryResultRow>[] = [
      // requireAuth SELECT session
      { rows: [{ id: sessionId }], command: "SELECT", rowCount: 1, oid: 0, fields: [] },
      // DELETE session
      { rows: [], command: "DELETE", rowCount: 1, oid: 0, fields: [] },
    ];
    let callIdx = 0;
    const pool = mockPool(async (text: string) => {
      if (text.includes("DELETE")) {
        deletedCalls.push(text);
      }
      return queryResults[callIdx++];
    });

    app = await buildTestApp(pool);
    const { default: authRoutes } = await import("../auth.js");
    app.register(authRoutes);

    await app.ready();
    const token = await createMockSession(app, userId, sessionId);

    const res = await app.inject({
      method: "DELETE",
      url: "/api/auth/session",
      cookies: { session: token },
    });

    expect(res.statusCode).toBe(200);
    expect(deletedCalls.length).toBe(1);
    expect(deletedCalls[0]).toContain("DELETE");

    // Verify cookie is cleared
    const cookies = res.cookies;
    const sessionCookie = cookies.find((c: { name: string }) => c.name === "session");
    expect(sessionCookie).toBeDefined();
    // Cookie should be cleared (empty value or past expiry)
    expect(sessionCookie!.value).toBe("");
  });
});
