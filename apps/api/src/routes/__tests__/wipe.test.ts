import { describe, it, expect, afterEach, vi } from "vitest";
import { buildTestApp, createMockSession } from "../../test-helpers/index.js";
import type { FastifyInstance } from "fastify";
import type { Pool, PoolClient, QueryResult, QueryResultRow } from "pg";

// Mock sendWipeNotification so tests don't require VAPID keys or real push
vi.mock("../../lib/notification-sender.js", () => ({
  sendWipeNotification: vi.fn().mockResolvedValue(undefined),
  sendDeadlineWarning: vi.fn().mockResolvedValue(undefined),
  initVapid: vi.fn(),
  formatWarningBody: vi.fn().mockReturnValue("body"),
}));

describe("Wipe routes", () => {
  let app: FastifyInstance;

  afterEach(async () => {
    if (app) await app.close();
    vi.clearAllMocks();
  });

  /**
   * Build a mock pool that supports both pool.query() and pool.connect()
   * (which returns a client with query/release/BEGIN/COMMIT/ROLLBACK support).
   */
  function mockPoolWithConnect(
    queryFn: (text: string, values?: unknown[]) => Promise<QueryResult<QueryResultRow>>
  ): Pool {
    const client: PoolClient = {
      query: queryFn as unknown as PoolClient["query"],
      release: vi.fn(),
    } as unknown as PoolClient;

    return {
      query: queryFn,
      connect: async () => client,
      end: async () => {},
    } as unknown as Pool;
  }

  async function buildApp(
    queryFn?: (text: string, values?: unknown[]) => Promise<QueryResult<QueryResultRow>>
  ) {
    const defaultFn = async (): Promise<QueryResult<QueryResultRow>> => ({
      rows: [],
      command: "SELECT",
      rowCount: 0,
      oid: 0,
      fields: [],
    });
    const pool = mockPoolWithConnect(queryFn ?? defaultFn);
    app = await buildTestApp(pool);
    const wipeModule = await import("../wipe.js");
    app.register(wipeModule.default as unknown as Parameters<typeof app.register>[0]);
    await app.ready();
    return app;
  }

  describe("GET /api/account/epitaph", () => {
    it("returns 401 without authentication", async () => {
      await buildApp();

      const res = await app.inject({
        method: "GET",
        url: "/api/account/epitaph",
      });

      expect(res.statusCode).toBe(401);
    });

    it("returns { epitaph: null } when epitaph is not set", async () => {
      const userId = "user-epitaph-null";

      let callIdx = 0;
      const responses: QueryResult<QueryResultRow>[] = [
        // requireAuth session lookup
        { rows: [{ id: "session-1" }], command: "SELECT", rowCount: 1, oid: 0, fields: [] },
        // SELECT epitaph FROM users
        { rows: [{ epitaph: null }], command: "SELECT", rowCount: 1, oid: 0, fields: [] },
      ];

      await buildApp(async () => responses[callIdx++]);
      const token = await createMockSession(app, userId);

      const res = await app.inject({
        method: "GET",
        url: "/api/account/epitaph",
        cookies: { session: token },
      });

      expect(res.statusCode).toBe(200);
      const body = res.json();
      expect(body.epitaph).toBeNull();
    });

    it("returns { epitaph: 'some text' } when epitaph is set", async () => {
      const userId = "user-epitaph-set";

      let callIdx = 0;
      const responses: QueryResult<QueryResultRow>[] = [
        // requireAuth session lookup
        { rows: [{ id: "session-1" }], command: "SELECT", rowCount: 1, oid: 0, fields: [] },
        // SELECT epitaph FROM users
        { rows: [{ epitaph: "Here lies my secrets" }], command: "SELECT", rowCount: 1, oid: 0, fields: [] },
      ];

      await buildApp(async () => responses[callIdx++]);
      const token = await createMockSession(app, userId);

      const res = await app.inject({
        method: "GET",
        url: "/api/account/epitaph",
        cookies: { session: token },
      });

      expect(res.statusCode).toBe(200);
      const body = res.json();
      expect(body.epitaph).toBe("Here lies my secrets");
    });
  });

  describe("POST /api/account/epitaph", () => {
    it("returns 401 without authentication", async () => {
      await buildApp();

      const res = await app.inject({
        method: "POST",
        url: "/api/account/epitaph",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ epitaph: "test" }),
      });

      expect(res.statusCode).toBe(401);
    });

    it("sets epitaph when null; returns 200 { ok: true }", async () => {
      const userId = "user-set-epitaph";

      let callIdx = 0;
      const responses: QueryResult<QueryResultRow>[] = [
        // requireAuth session lookup
        { rows: [{ id: "session-1" }], command: "SELECT", rowCount: 1, oid: 0, fields: [] },
        // UPDATE users SET epitaph WHERE epitaph IS NULL — 1 row updated
        { rows: [], command: "UPDATE", rowCount: 1, oid: 0, fields: [] },
      ];

      await buildApp(async () => responses[callIdx++]);
      const token = await createMockSession(app, userId);

      const res = await app.inject({
        method: "POST",
        url: "/api/account/epitaph",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ epitaph: "Here lies my secrets" }),
        cookies: { session: token },
      });

      expect(res.statusCode).toBe(200);
      const body = res.json();
      expect(body.ok).toBe(true);
    });

    it("returns 409 when epitaph already set (immutability enforcement)", async () => {
      const userId = "user-epitaph-exists";

      let callIdx = 0;
      const responses: QueryResult<QueryResultRow>[] = [
        // requireAuth session lookup
        { rows: [{ id: "session-1" }], command: "SELECT", rowCount: 1, oid: 0, fields: [] },
        // UPDATE users SET epitaph WHERE epitaph IS NULL — 0 rows updated (already set)
        { rows: [], command: "UPDATE", rowCount: 0, oid: 0, fields: [] },
      ];

      await buildApp(async () => responses[callIdx++]);
      const token = await createMockSession(app, userId);

      const res = await app.inject({
        method: "POST",
        url: "/api/account/epitaph",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ epitaph: "Trying to overwrite" }),
        cookies: { session: token },
      });

      expect(res.statusCode).toBe(409);
      const body = res.json();
      expect(body.error).toBe("Epitaph already set");
    });

    it("returns 400 when epitaph body is empty or missing", async () => {
      const userId = "user-bad-epitaph";

      // Always return a valid session so auth passes; validation happens after auth
      const authRow = { rows: [{ id: "session-1" }], command: "SELECT", rowCount: 1, oid: 0, fields: [] } as QueryResult<QueryResultRow>;
      await buildApp(async () => authRow);
      const token = await createMockSession(app, userId);

      // Empty string
      const res1 = await app.inject({
        method: "POST",
        url: "/api/account/epitaph",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ epitaph: "" }),
        cookies: { session: token },
      });
      expect(res1.statusCode).toBe(400);

      // Epitaph exceeds 500 chars
      const longEpitaph = "x".repeat(501);
      const res2 = await app.inject({
        method: "POST",
        url: "/api/account/epitaph",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ epitaph: longEpitaph }),
        cookies: { session: token },
      });
      expect(res2.statusCode).toBe(400);
    });
  });

  describe("POST /api/wipe/panic", () => {
    it("returns 401 without authentication", async () => {
      await buildApp();

      const res = await app.inject({
        method: "POST",
        url: "/api/wipe/panic",
      });

      expect(res.statusCode).toBe(401);
    });

    it("returns 200 and ok:true when state is active (happy path)", async () => {
      const userId = "user-panic-123";
      const sqlCalls: { text: string; values?: unknown[] }[] = [];

      let callIdx = 0;
      const responses: QueryResult<QueryResultRow>[] = [
        // requireAuth session lookup
        { rows: [{ id: "session-1" }], command: "SELECT", rowCount: 1, oid: 0, fields: [] },
        // BEGIN
        { rows: [], command: "BEGIN", rowCount: 0, oid: 0, fields: [] },
        // SELECT deadline_state FOR UPDATE — active
        { rows: [{ state: "active" }], command: "SELECT", rowCount: 1, oid: 0, fields: [] },
        // INSERT wipe_log with reason='panic'
        { rows: [], command: "INSERT", rowCount: 1, oid: 0, fields: [] },
        // DELETE server_shards
        { rows: [], command: "DELETE", rowCount: 1, oid: 0, fields: [] },
        // UPDATE deadline_state SET state='wiped'
        { rows: [], command: "UPDATE", rowCount: 1, oid: 0, fields: [] },
        // COMMIT
        { rows: [], command: "COMMIT", rowCount: 0, oid: 0, fields: [] },
      ];

      await buildApp(async (text, values) => {
        sqlCalls.push({ text, values });
        return responses[callIdx++];
      });

      const token = await createMockSession(app, userId);

      const res = await app.inject({
        method: "POST",
        url: "/api/wipe/panic",
        cookies: { session: token },
      });

      expect(res.statusCode).toBe(200);
      const body = res.json();
      expect(body.ok).toBe(true);

      // Verify shard was deleted
      const hasShardDelete = sqlCalls.some(
        (c) => c.text.includes("DELETE") && c.text.includes("server_shards")
      );
      expect(hasShardDelete).toBe(true);

      // Verify wipe_log inserted with reason='panic'
      const hasWipeLogInsert = sqlCalls.some(
        (c) => c.text.includes("INSERT") && c.text.includes("wipe_log") && c.text.includes("panic")
      );
      expect(hasWipeLogInsert).toBe(true);

      // Verify deadline_state updated to 'wiped'
      const hasWipedUpdate = sqlCalls.some(
        (c) => c.text.includes("UPDATE") && c.text.includes("wiped")
      );
      expect(hasWipedUpdate).toBe(true);

      // Verify FOR UPDATE lock was used
      const hasForUpdate = sqlCalls.some((c) => c.text.includes("FOR UPDATE"));
      expect(hasForUpdate).toBe(true);
    });

    it("calls sendWipeNotification after COMMIT (outside transaction)", async () => {
      const userId = "user-panic-notif";
      const { sendWipeNotification } = await import("../../lib/notification-sender.js");
      const sendWipeSpy = vi.mocked(sendWipeNotification);
      sendWipeSpy.mockClear();

      let callIdx = 0;
      const responses: QueryResult<QueryResultRow>[] = [
        { rows: [{ id: "session-1" }], command: "SELECT", rowCount: 1, oid: 0, fields: [] },
        { rows: [], command: "BEGIN", rowCount: 0, oid: 0, fields: [] },
        { rows: [{ state: "active" }], command: "SELECT", rowCount: 1, oid: 0, fields: [] },
        { rows: [], command: "INSERT", rowCount: 1, oid: 0, fields: [] },
        { rows: [], command: "DELETE", rowCount: 1, oid: 0, fields: [] },
        { rows: [], command: "UPDATE", rowCount: 1, oid: 0, fields: [] },
        { rows: [], command: "COMMIT", rowCount: 0, oid: 0, fields: [] },
      ];

      await buildApp(async () => responses[callIdx++]);
      const token = await createMockSession(app, userId);

      await app.inject({
        method: "POST",
        url: "/api/wipe/panic",
        cookies: { session: token },
      });

      expect(sendWipeSpy).toHaveBeenCalledOnce();
    });

    it("returns 409 when state is pending_wipe", async () => {
      const userId = "user-pending-wipe";

      let callIdx = 0;
      const responses: QueryResult<QueryResultRow>[] = [
        // requireAuth session lookup
        { rows: [{ id: "session-1" }], command: "SELECT", rowCount: 1, oid: 0, fields: [] },
        // BEGIN
        { rows: [], command: "BEGIN", rowCount: 0, oid: 0, fields: [] },
        // SELECT deadline_state FOR UPDATE — pending_wipe (not active)
        { rows: [{ state: "pending_wipe" }], command: "SELECT", rowCount: 1, oid: 0, fields: [] },
        // ROLLBACK
        { rows: [], command: "ROLLBACK", rowCount: 0, oid: 0, fields: [] },
      ];

      await buildApp(async () => responses[callIdx++]);
      const token = await createMockSession(app, userId);

      const res = await app.inject({
        method: "POST",
        url: "/api/wipe/panic",
        cookies: { session: token },
      });

      expect(res.statusCode).toBe(409);
      const body = res.json();
      expect(body.error).toBeDefined();
    });

    it("returns 409 when no deadline_state row exists", async () => {
      const userId = "user-no-state";

      let callIdx = 0;
      const responses: QueryResult<QueryResultRow>[] = [
        // requireAuth session lookup
        { rows: [{ id: "session-1" }], command: "SELECT", rowCount: 1, oid: 0, fields: [] },
        // BEGIN
        { rows: [], command: "BEGIN", rowCount: 0, oid: 0, fields: [] },
        // SELECT deadline_state FOR UPDATE — no row
        { rows: [], command: "SELECT", rowCount: 0, oid: 0, fields: [] },
        // ROLLBACK
        { rows: [], command: "ROLLBACK", rowCount: 0, oid: 0, fields: [] },
      ];

      await buildApp(async () => responses[callIdx++]);
      const token = await createMockSession(app, userId);

      const res = await app.inject({
        method: "POST",
        url: "/api/wipe/panic",
        cookies: { session: token },
      });

      expect(res.statusCode).toBe(409);
      const body = res.json();
      expect(body.error).toBeDefined();
    });

    it("returns 409 when state is wiped", async () => {
      const userId = "user-already-wiped";

      let callIdx = 0;
      const responses: QueryResult<QueryResultRow>[] = [
        { rows: [{ id: "session-1" }], command: "SELECT", rowCount: 1, oid: 0, fields: [] },
        { rows: [], command: "BEGIN", rowCount: 0, oid: 0, fields: [] },
        { rows: [{ state: "wiped" }], command: "SELECT", rowCount: 1, oid: 0, fields: [] },
        { rows: [], command: "ROLLBACK", rowCount: 0, oid: 0, fields: [] },
      ];

      await buildApp(async () => responses[callIdx++]);
      const token = await createMockSession(app, userId);

      const res = await app.inject({
        method: "POST",
        url: "/api/wipe/panic",
        cookies: { session: token },
      });

      expect(res.statusCode).toBe(409);
    });

    it("rolls back transaction and returns 500 on DB error mid-wipe", async () => {
      const userId = "user-db-error";
      const rollbackCalls: string[] = [];

      let callIdx = 0;
      const responses: Array<QueryResult<QueryResultRow> | Error> = [
        // requireAuth session lookup
        { rows: [{ id: "session-1" }], command: "SELECT", rowCount: 1, oid: 0, fields: [] },
        // BEGIN
        { rows: [], command: "BEGIN", rowCount: 0, oid: 0, fields: [] },
        // SELECT deadline_state FOR UPDATE — active
        { rows: [{ state: "active" }], command: "SELECT", rowCount: 1, oid: 0, fields: [] },
        // INSERT wipe_log — throws error
        new Error("DB connection lost"),
      ];

      await buildApp(async (text, values) => {
        const item = responses[callIdx++];
        if (item instanceof Error) throw item;
        // Track ROLLBACK calls
        if (text === "ROLLBACK") rollbackCalls.push(text);
        return item as QueryResult<QueryResultRow>;
      });

      const token = await createMockSession(app, userId);

      const res = await app.inject({
        method: "POST",
        url: "/api/wipe/panic",
        cookies: { session: token },
      });

      expect(res.statusCode).toBe(500);
    });
  });
});
