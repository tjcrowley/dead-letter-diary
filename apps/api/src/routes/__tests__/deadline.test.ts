import { describe, it, expect, afterEach, vi } from "vitest";
import { buildTestApp, mockPool, createMockSession } from "../../test-helpers/index.js";
import type { FastifyInstance } from "fastify";
import type { Pool, PoolClient, QueryResult, QueryResultRow } from "pg";

describe("Deadline routes", () => {
  let app: FastifyInstance;

  afterEach(async () => {
    if (app) await app.close();
  });

  /**
   * Build a mock pool that supports both pool.query() and pool.connect()
   * (which returns a client with query/release/BEGIN/COMMIT/ROLLBACK support).
   * All queries route through the same queryFn so tests can track every SQL call.
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

  async function buildApp(queryFn?: (text: string, values?: unknown[]) => Promise<QueryResult<QueryResultRow>>) {
    const pool = queryFn ? mockPoolWithConnect(queryFn) : mockPool();
    app = await buildTestApp(pool);
    const deadlineModule = await import("../deadline.js");
    app.register(deadlineModule.default as unknown as Parameters<typeof app.register>[0]);
    await app.ready();
    return app;
  }

  describe("GET /api/deadline", () => {
    it("returns 401 without authentication", async () => {
      await buildApp(async () => ({
        rows: [],
        command: "SELECT",
        rowCount: 0,
        oid: 0,
        fields: [],
      }));

      const res = await app.inject({
        method: "GET",
        url: "/api/deadline",
      });

      expect(res.statusCode).toBe(401);
    });

    it("returns 404 when no deadline_state row exists for user", async () => {
      let callIdx = 0;
      const responses: QueryResult<QueryResultRow>[] = [
        // requireAuth session lookup
        { rows: [{ id: "session-1" }], command: "SELECT", rowCount: 1, oid: 0, fields: [] },
        // SELECT from deadline_state — no row
        { rows: [], command: "SELECT", rowCount: 0, oid: 0, fields: [] },
      ];

      await buildApp(async () => responses[callIdx++]);
      const token = await createMockSession(app, "user-123");

      const res = await app.inject({
        method: "GET",
        url: "/api/deadline",
        cookies: { session: token },
      });

      expect(res.statusCode).toBe(404);
    });

    it("returns deadline_state fields when row exists", async () => {
      const userId = "user-123";
      const deadline_at = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString();

      let callIdx = 0;
      const responses: QueryResult<QueryResultRow>[] = [
        // requireAuth session lookup
        { rows: [{ id: "session-1" }], command: "SELECT", rowCount: 1, oid: 0, fields: [] },
        // SELECT deadline_state
        {
          rows: [{
            state: "active",
            deadline_at,
            window_hours: 24,
            word_minimum: 50,
            grace_budget: 1,
            grace_used_at: null,
            pending_window_hours: null,
            pending_word_minimum: null,
            pending_effective_at: null,
          }],
          command: "SELECT",
          rowCount: 1,
          oid: 0,
          fields: [],
        },
      ];

      await buildApp(async () => responses[callIdx++]);
      const token = await createMockSession(app, userId);

      const res = await app.inject({
        method: "GET",
        url: "/api/deadline",
        cookies: { session: token },
      });

      expect(res.statusCode).toBe(200);
      const body = res.json();
      expect(body.state).toBe("active");
      expect(body.window_hours).toBe(24);
      expect(body.word_minimum).toBe(50);
    });
  });

  describe("POST /api/deadline/settings", () => {
    it("returns 401 without authentication", async () => {
      await buildApp(async () => ({
        rows: [],
        command: "SELECT",
        rowCount: 0,
        oid: 0,
        fields: [],
      }));

      const res = await app.inject({
        method: "POST",
        url: "/api/deadline/settings",
        payload: { window_hours: 24, word_minimum: 50 },
      });

      expect(res.statusCode).toBe(401);
    });

    it("creates a new deadline_state row with defaults when none exists", async () => {
      const userId = "user-123";
      const insertCalls: string[] = [];

      let callIdx = 0;
      const responses: QueryResult<QueryResultRow>[] = [
        // requireAuth session lookup
        { rows: [{ id: "session-1" }], command: "SELECT", rowCount: 1, oid: 0, fields: [] },
        // SELECT existing deadline_state — no row
        { rows: [], command: "SELECT", rowCount: 0, oid: 0, fields: [] },
        // SELECT users.timezone for computeDeadlineUTC
        { rows: [{ timezone: "UTC" }], command: "SELECT", rowCount: 1, oid: 0, fields: [] },
        // INSERT deadline_state
        { rows: [{ id: "ds-1" }], command: "INSERT", rowCount: 1, oid: 0, fields: [] },
        // INSERT notification_thresholds (ON CONFLICT DO NOTHING)
        { rows: [], command: "INSERT", rowCount: 0, oid: 0, fields: [] },
        { rows: [], command: "INSERT", rowCount: 0, oid: 0, fields: [] },
        { rows: [], command: "INSERT", rowCount: 0, oid: 0, fields: [] },
        { rows: [], command: "INSERT", rowCount: 0, oid: 0, fields: [] },
      ];

      await buildApp(async (text, values) => {
        if (text.includes("INSERT") && text.includes("deadline_state")) {
          insertCalls.push(text);
        }
        return responses[callIdx++];
      });

      const token = await createMockSession(app, userId);

      const res = await app.inject({
        method: "POST",
        url: "/api/deadline/settings",
        cookies: { session: token },
        payload: { window_hours: 24, word_minimum: 50, timezone: "UTC" },
      });

      expect(res.statusCode).toBe(200);
      expect(insertCalls.length).toBeGreaterThan(0);
    });

    it("writes pending fields (Akrasia weakening) when weakening window_hours", async () => {
      const userId = "user-123";
      const updateCalls: { text: string; values?: unknown[] }[] = [];

      let callIdx = 0;
      const responses: QueryResult<QueryResultRow>[] = [
        // requireAuth session lookup
        { rows: [{ id: "session-1" }], command: "SELECT", rowCount: 1, oid: 0, fields: [] },
        // SELECT existing deadline_state — has row with window_hours=12 (strict)
        {
          rows: [{
            state: "active",
            window_hours: 12,
            word_minimum: 100,
            deadline_at: new Date(Date.now() + 12 * 3600 * 1000),
          }],
          command: "SELECT",
          rowCount: 1,
          oid: 0,
          fields: [],
        },
        // UPDATE deadline_state with pending fields
        { rows: [], command: "UPDATE", rowCount: 1, oid: 0, fields: [] },
      ];

      await buildApp(async (text, values) => {
        if (text.includes("UPDATE")) {
          updateCalls.push({ text, values });
        }
        return responses[callIdx++];
      });

      const token = await createMockSession(app, userId);

      // Weakening: requesting longer window (48h > 12h)
      const res = await app.inject({
        method: "POST",
        url: "/api/deadline/settings",
        cookies: { session: token },
        payload: { window_hours: 48 }, // weaker than current 12h
      });

      expect(res.statusCode).toBe(200);
      // Should have written pending_ columns, not immediate
      const akrasiaUpdate = updateCalls.find(
        (c) => c.text.includes("pending_window_hours") || c.text.includes("pending_effective_at")
      );
      expect(akrasiaUpdate).toBeDefined();
    });

    it("writes immediately (no Akrasia delay) when strengthening word_minimum", async () => {
      const userId = "user-123";
      const updateCalls: { text: string; values?: unknown[] }[] = [];

      let callIdx = 0;
      const responses: QueryResult<QueryResultRow>[] = [
        // requireAuth session lookup
        { rows: [{ id: "session-1" }], command: "SELECT", rowCount: 1, oid: 0, fields: [] },
        // SELECT existing deadline_state — has word_minimum=50
        {
          rows: [{
            state: "active",
            window_hours: 24,
            word_minimum: 50,
            deadline_at: new Date(Date.now() + 24 * 3600 * 1000),
          }],
          command: "SELECT",
          rowCount: 1,
          oid: 0,
          fields: [],
        },
        // UPDATE deadline_state immediately
        { rows: [], command: "UPDATE", rowCount: 1, oid: 0, fields: [] },
      ];

      await buildApp(async (text, values) => {
        if (text.includes("UPDATE")) {
          updateCalls.push({ text, values });
        }
        return responses[callIdx++];
      });

      const token = await createMockSession(app, userId);

      // Strengthening: higher word_minimum (100 > 50)
      const res = await app.inject({
        method: "POST",
        url: "/api/deadline/settings",
        cookies: { session: token },
        payload: { word_minimum: 100 }, // stronger than current 50
      });

      expect(res.statusCode).toBe(200);
      // Should have written directly to word_minimum, not pending_word_minimum
      const immediateUpdate = updateCalls.find(
        (c) => c.text.includes("word_minimum") && !c.text.includes("pending_word_minimum")
      );
      expect(immediateUpdate).toBeDefined();
    });
  });

  describe("POST /api/deadline/checkin", () => {
    it("returns 409 when deadline_state is pending_wipe", async () => {
      const userId = "user-123";

      let callIdx = 0;
      const responses: QueryResult<QueryResultRow>[] = [
        // requireAuth session lookup
        { rows: [{ id: "session-1" }], command: "SELECT", rowCount: 1, oid: 0, fields: [] },
        // BEGIN (transaction)
        { rows: [], command: "BEGIN", rowCount: 0, oid: 0, fields: [] },
        // SELECT deadline_state FOR UPDATE — state is pending_wipe
        {
          rows: [{ state: "pending_wipe", window_hours: 24, word_minimum: 50, deadline_at: new Date() }],
          command: "SELECT",
          rowCount: 1,
          oid: 0,
          fields: [],
        },
        // ROLLBACK
        { rows: [], command: "ROLLBACK", rowCount: 0, oid: 0, fields: [] },
      ];

      await buildApp(async () => responses[callIdx++]);
      const token = await createMockSession(app, userId);

      const res = await app.inject({
        method: "POST",
        url: "/api/deadline/checkin",
        cookies: { session: token },
        payload: { entryId: "entry-123" },
      });

      expect(res.statusCode).toBe(409);
    });

    it("uses FOR UPDATE lock on deadline_state during check-in", async () => {
      const userId = "user-123";
      const sqlCalls: string[] = [];

      let callIdx = 0;
      const responses: QueryResult<QueryResultRow>[] = [
        // requireAuth session lookup
        { rows: [{ id: "session-1" }], command: "SELECT", rowCount: 1, oid: 0, fields: [] },
        // BEGIN
        { rows: [], command: "BEGIN", rowCount: 0, oid: 0, fields: [] },
        // SELECT deadline_state FOR UPDATE — active
        {
          rows: [{
            state: "active",
            window_hours: 24,
            word_minimum: 50,
            deadline_at: new Date(Date.now() + 24 * 3600 * 1000),
          }],
          command: "SELECT",
          rowCount: 1,
          oid: 0,
          fields: [],
        },
        // SELECT entry to validate word count
        {
          rows: [{ id: "entry-123", word_count: 75 }],
          command: "SELECT",
          rowCount: 1,
          oid: 0,
          fields: [],
        },
        // SELECT users.timezone
        { rows: [{ timezone: "UTC" }], command: "SELECT", rowCount: 1, oid: 0, fields: [] },
        // UPDATE deadline_state deadline_at
        { rows: [], command: "UPDATE", rowCount: 1, oid: 0, fields: [] },
        // COMMIT
        { rows: [], command: "COMMIT", rowCount: 0, oid: 0, fields: [] },
      ];

      await buildApp(async (text) => {
        sqlCalls.push(text);
        return responses[callIdx++];
      });
      const token = await createMockSession(app, userId);

      const res = await app.inject({
        method: "POST",
        url: "/api/deadline/checkin",
        cookies: { session: token },
        payload: { entryId: "entry-123" },
      });

      expect(res.statusCode).toBe(200);
      const hasForUpdate = sqlCalls.some((sql) => sql.includes("FOR UPDATE"));
      expect(hasForUpdate).toBe(true);
    });
  });
});
