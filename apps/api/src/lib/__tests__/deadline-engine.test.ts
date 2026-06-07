import { describe, it, expect, vi, beforeEach } from "vitest";
import type { Pool, PoolClient, QueryResult, QueryResultRow } from "pg";
import type { FastifyBaseLogger } from "fastify";

/**
 * Stateful mock transaction client.
 * Tracks all SQL calls and simulates BEGIN/COMMIT/ROLLBACK.
 */
function createMockClient(
  queryFn: (text: string, values?: unknown[]) => Promise<QueryResult<QueryResultRow>>
): PoolClient & { sqlCalls: { text: string; values?: unknown[] }[] } {
  const sqlCalls: { text: string; values?: unknown[] }[] = [];
  const client = {
    sqlCalls,
    query: async (text: string, values?: unknown[]) => {
      sqlCalls.push({ text, values });
      return queryFn(text, values);
    },
    release: vi.fn(),
  } as unknown as PoolClient & { sqlCalls: { text: string; values?: unknown[] }[] };
  return client;
}

/**
 * Creates a mock Pool that returns a controllable mock client.
 */
function createMockPool(
  queryFn: (text: string, values?: unknown[]) => Promise<QueryResult<QueryResultRow>>
): Pool & { client: ReturnType<typeof createMockClient> } {
  const client = createMockClient(queryFn);
  const pool = {
    connect: async () => client,
    query: queryFn,
    end: async () => {},
  } as unknown as Pool & { client: ReturnType<typeof createMockClient> };
  (pool as unknown as { client: typeof client }).client = client;
  return pool as Pool & { client: ReturnType<typeof createMockClient> };
}

function mockLogger(): FastifyBaseLogger {
  return {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
    trace: vi.fn(),
    fatal: vi.fn(),
    child: vi.fn(),
    level: "info",
    silent: vi.fn(),
  } as unknown as FastifyBaseLogger;
}

describe("deadline-engine", () => {
  describe("computeDeadlineUTC", () => {
    it("returns a Date object for valid timezone", async () => {
      const { computeDeadlineUTC } = await import("../deadline-engine.js");
      const result = computeDeadlineUTC(24, "America/New_York");
      expect(result).toBeInstanceOf(Date);
    });

    it("returns a date approximately windowHours in the future", async () => {
      const { computeDeadlineUTC } = await import("../deadline-engine.js");
      const before = Date.now();
      const result = computeDeadlineUTC(24, "America/New_York");
      const after = Date.now();

      const expectedMs = 24 * 60 * 60 * 1000;
      const actualMs = result.getTime() - before;
      // Allow a small delta for execution time (5 seconds)
      expect(actualMs).toBeGreaterThanOrEqual(expectedMs - 5000);
      expect(actualMs).toBeLessThanOrEqual(expectedMs + 5000);
    });

    it("handles UTC timezone without error", async () => {
      const { computeDeadlineUTC } = await import("../deadline-engine.js");
      const result = computeDeadlineUTC(1, "UTC");
      expect(result).toBeInstanceOf(Date);
    });
  });

  describe("initiateWipe", () => {
    it("inserts wipe_log row and sets state=pending_wipe when state is active", async () => {
      const { initiateWipe } = await import("../deadline-engine.js");
      const userId = "user-abc";

      const responses: QueryResult<QueryResultRow>[] = [
        // BEGIN
        { rows: [], command: "BEGIN", rowCount: 0, oid: 0, fields: [] },
        // SELECT deadline_state FOR UPDATE
        { rows: [{ state: "active" }], command: "SELECT", rowCount: 1, oid: 0, fields: [] },
        // INSERT wipe_log
        { rows: [{ id: "wipe-1" }], command: "INSERT", rowCount: 1, oid: 0, fields: [] },
        // UPDATE deadline_state
        { rows: [], command: "UPDATE", rowCount: 1, oid: 0, fields: [] },
        // COMMIT
        { rows: [], command: "COMMIT", rowCount: 0, oid: 0, fields: [] },
      ];
      let idx = 0;
      const pool = createMockPool(async () => responses[idx++]);

      await initiateWipe(pool.client, userId);

      const calls = pool.client.sqlCalls;
      const hasSqlForUpdate = calls.some((c) => c.text.includes("FOR UPDATE"));
      const hasWipeLogInsert = calls.some(
        (c) => c.text.includes("INSERT") && c.text.includes("wipe_log")
      );
      const hasStateUpdate = calls.some(
        (c) => c.text.includes("UPDATE") && c.text.includes("pending_wipe")
      );

      expect(hasSqlForUpdate).toBe(true);
      expect(hasWipeLogInsert).toBe(true);
      expect(hasStateUpdate).toBe(true);
    });

    it("is a no-op when state is already pending_wipe", async () => {
      const { initiateWipe } = await import("../deadline-engine.js");
      const userId = "user-abc";

      const responses: QueryResult<QueryResultRow>[] = [
        // BEGIN
        { rows: [], command: "BEGIN", rowCount: 0, oid: 0, fields: [] },
        // SELECT deadline_state FOR UPDATE — already pending_wipe
        { rows: [{ state: "pending_wipe" }], command: "SELECT", rowCount: 1, oid: 0, fields: [] },
        // ROLLBACK or COMMIT without further writes
        { rows: [], command: "ROLLBACK", rowCount: 0, oid: 0, fields: [] },
      ];
      let idx = 0;
      const pool = createMockPool(async () => responses[idx++]);

      await initiateWipe(pool.client, userId);

      const calls = pool.client.sqlCalls;
      const hasWipeLogInsert = calls.some(
        (c) => c.text.includes("INSERT") && c.text.includes("wipe_log")
      );
      expect(hasWipeLogInsert).toBe(false);
    });

    it("is a no-op when state is wiped", async () => {
      const { initiateWipe } = await import("../deadline-engine.js");
      const userId = "user-abc";

      const responses: QueryResult<QueryResultRow>[] = [
        { rows: [], command: "BEGIN", rowCount: 0, oid: 0, fields: [] },
        { rows: [{ state: "wiped" }], command: "SELECT", rowCount: 1, oid: 0, fields: [] },
        { rows: [], command: "ROLLBACK", rowCount: 0, oid: 0, fields: [] },
      ];
      let idx = 0;
      const pool = createMockPool(async () => responses[idx++]);

      await initiateWipe(pool.client, userId);

      const calls = pool.client.sqlCalls;
      const hasWipeLogInsert = calls.some(
        (c) => c.text.includes("INSERT") && c.text.includes("wipe_log")
      );
      expect(hasWipeLogInsert).toBe(false);
    });
  });

  describe("confirmWipe", () => {
    it("deletes shard and sets state=wiped when wipe_log is older than 60s", async () => {
      const { confirmWipe } = await import("../deadline-engine.js");
      const userId = "user-abc";
      const oldInitiatedAt = new Date(Date.now() - 120_000); // 2 minutes ago

      const responses: QueryResult<QueryResultRow>[] = [
        // BEGIN
        { rows: [], command: "BEGIN", rowCount: 0, oid: 0, fields: [] },
        // SELECT deadline_state FOR UPDATE
        { rows: [{ state: "pending_wipe" }], command: "SELECT", rowCount: 1, oid: 0, fields: [] },
        // SELECT wipe_log
        {
          rows: [{ id: "wipe-1", initiated_at: oldInitiatedAt }],
          command: "SELECT",
          rowCount: 1,
          oid: 0,
          fields: [],
        },
        // UPDATE wipe_log SET shard_deleted=true, confirmed_at=now()
        { rows: [], command: "UPDATE", rowCount: 1, oid: 0, fields: [] },
        // DELETE FROM server_shards
        { rows: [], command: "DELETE", rowCount: 1, oid: 0, fields: [] },
        // UPDATE deadline_state SET state='wiped'
        { rows: [], command: "UPDATE", rowCount: 1, oid: 0, fields: [] },
        // COMMIT
        { rows: [], command: "COMMIT", rowCount: 0, oid: 0, fields: [] },
      ];
      let idx = 0;
      const pool = createMockPool(async () => responses[idx++]);

      await confirmWipe(pool.client, userId);

      const calls = pool.client.sqlCalls;
      const hasShardDelete = calls.some(
        (c) => c.text.includes("DELETE") && c.text.includes("server_shards")
      );
      const hasWipedState = calls.some(
        (c) => c.text.includes("UPDATE") && c.text.includes("wiped")
      );
      expect(hasShardDelete).toBe(true);
      expect(hasWipedState).toBe(true);
    });

    it("does not delete shard when wipe_log is too recent (< 60s)", async () => {
      const { confirmWipe } = await import("../deadline-engine.js");
      const userId = "user-abc";
      const recentInitiatedAt = new Date(Date.now() - 10_000); // 10 seconds ago

      const responses: QueryResult<QueryResultRow>[] = [
        // BEGIN
        { rows: [], command: "BEGIN", rowCount: 0, oid: 0, fields: [] },
        // SELECT deadline_state FOR UPDATE
        { rows: [{ state: "pending_wipe" }], command: "SELECT", rowCount: 1, oid: 0, fields: [] },
        // SELECT wipe_log — too recent
        {
          rows: [{ id: "wipe-1", initiated_at: recentInitiatedAt }],
          command: "SELECT",
          rowCount: 1,
          oid: 0,
          fields: [],
        },
        // COMMIT or ROLLBACK without writes
        { rows: [], command: "COMMIT", rowCount: 0, oid: 0, fields: [] },
      ];
      let idx = 0;
      const pool = createMockPool(async () => responses[idx++]);

      await confirmWipe(pool.client, userId);

      const calls = pool.client.sqlCalls;
      const hasShardDelete = calls.some(
        (c) => c.text.includes("DELETE") && c.text.includes("server_shards")
      );
      expect(hasShardDelete).toBe(false);
    });
  });

  describe("checkDeadlines", () => {
    it("promotes pending Akrasia fields when pending_effective_at <= now", async () => {
      const { checkDeadlines } = await import("../deadline-engine.js");

      const now = new Date();
      const pastEffectiveAt = new Date(now.getTime() - 60_000); // 1 minute ago

      const calls: { text: string; values?: unknown[] }[] = [];

      // Pool.query is used directly for SELECT queries in checkDeadlines
      // Pool.connect is used for transactional wipe operations
      const pool = {
        connect: async () => {
          // Should not be called in this test (no overdue deadlines)
          return createMockClient(async () => ({
            rows: [],
            command: "SELECT",
            rowCount: 0,
            oid: 0,
            fields: [],
          }));
        },
        query: async (text: string, values?: unknown[]) => {
          calls.push({ text, values });
          // Return empty for active overdue rows
          if (text.includes("active") && text.includes("deadline_at")) {
            return { rows: [], command: "SELECT", rowCount: 0, oid: 0, fields: [] };
          }
          // Return empty for pending_wipe settle window
          if (text.includes("pending_wipe")) {
            return { rows: [], command: "SELECT", rowCount: 0, oid: 0, fields: [] };
          }
          // Return a pending Akrasia row
          if (text.includes("pending_effective_at") && text.includes("SELECT")) {
            return {
              rows: [
                {
                  user_id: "user-xyz",
                  pending_window_hours: 12,
                  pending_word_minimum: 100,
                },
              ],
              command: "SELECT",
              rowCount: 1,
              oid: 0,
              fields: [],
            };
          }
          // UPDATE for Akrasia promotion
          return { rows: [], command: "UPDATE", rowCount: 1, oid: 0, fields: [] };
        },
        end: async () => {},
      } as unknown as Pool;

      const log = mockLogger();
      await checkDeadlines(pool, log);

      // Should have issued an UPDATE to promote pending fields
      const hasAkrasiaUpdate = calls.some(
        (c) => c.text.includes("UPDATE") && c.text.includes("window_hours")
      );
      expect(hasAkrasiaUpdate).toBe(true);
    });
  });
});
