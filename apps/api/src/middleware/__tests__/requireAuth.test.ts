import { describe, it, expect, afterEach } from "vitest";
import { buildTestApp, mockPool, createMockSession } from "../../test-helpers/index.js";
import { requireAuth } from "../requireAuth.js";
import type { FastifyInstance } from "fastify";

describe("requireAuth middleware", () => {
  let app: FastifyInstance;

  afterEach(async () => {
    if (app) await app.close();
  });

  it("rejects request with no session cookie (401)", async () => {
    app = await buildTestApp();

    app.get("/test-protected", { preHandler: [requireAuth] }, async (req) => {
      return { userId: req.userId };
    });

    const res = await app.inject({
      method: "GET",
      url: "/test-protected",
    });

    expect(res.statusCode).toBe(401);
    expect(res.json().error).toBe("Session expired or invalid");
  });

  it("rejects request with expired session (401)", async () => {
    // Pool returns empty result (session not found / expired)
    const pool = mockPool(async () => ({
      rows: [],
      command: "SELECT",
      rowCount: 0,
      oid: 0,
      fields: [],
    }));

    app = await buildTestApp(pool);

    app.get("/test-protected", { preHandler: [requireAuth] }, async (req) => {
      return { userId: req.userId };
    });

    const token = await createMockSession(app, "user-123", "session-456");

    const res = await app.inject({
      method: "GET",
      url: "/test-protected",
      cookies: { session: token },
    });

    expect(res.statusCode).toBe(401);
    expect(res.json().error).toBe("Session expired or invalid");
  });

  it("allows request with valid session cookie", async () => {
    const userId = "user-abc-123";
    const sessionId = "session-xyz-789";

    // Pool returns matching session
    const pool = mockPool(async () => ({
      rows: [{ id: sessionId }],
      command: "SELECT",
      rowCount: 1,
      oid: 0,
      fields: [],
    }));

    app = await buildTestApp(pool);

    app.get("/test-protected", { preHandler: [requireAuth] }, async (req) => {
      return { userId: req.userId };
    });

    const token = await createMockSession(app, userId, sessionId);

    const res = await app.inject({
      method: "GET",
      url: "/test-protected",
      cookies: { session: token },
    });

    expect(res.statusCode).toBe(200);
    expect(res.json().userId).toBe(userId);
  });
});
