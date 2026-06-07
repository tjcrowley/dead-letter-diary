import { describe, it, expect, afterEach } from "vitest";
import { buildTestApp, mockPool, createMockSession } from "../../test-helpers/index.js";
import type { FastifyInstance } from "fastify";
import type { QueryResult, QueryResultRow } from "pg";

describe("Entries routes", () => {
  let app: FastifyInstance;

  afterEach(async () => {
    if (app) await app.close();
  });

  // Helper: build a valid AAD payload
  function buildAad(entryId: string, userId: string, wordCount: number): string {
    const aadObj = { entryId, userId, wordCount };
    return Buffer.from(JSON.stringify(aadObj), "utf-8").toString("base64url");
  }

  describe("POST /api/entries", () => {
    it("returns 401 without authentication", async () => {
      const pool = mockPool(async () => ({
        rows: [{ id: "session-1" }],
        command: "SELECT",
        rowCount: 1,
        oid: 0,
        fields: [],
      }));

      app = await buildTestApp(pool);
      const entriesModule = await import("../entries.js");
      app.register(entriesModule.default as unknown as Parameters<typeof app.register>[0]);

      const res = await app.inject({
        method: "POST",
        url: "/api/entries",
        payload: {
          ciphertext: "dGVzdA",
          iv: "dGVzdA",
          aad: buildAad("entry-1", "user-123", 100),
        },
      });

      expect(res.statusCode).toBe(401);
    });

    it("returns 201 with entry id when word count meets minimum", async () => {
      const userId = "user-123";
      const entryId = "entry-abc";

      const queryResults: QueryResult<QueryResultRow>[] = [
        // requireAuth: session lookup
        { rows: [{ id: "session-1" }], command: "SELECT", rowCount: 1, oid: 0, fields: [] },
        // SELECT word_minimum from deadline_state
        { rows: [{ word_minimum: 50 }], command: "SELECT", rowCount: 1, oid: 0, fields: [] },
        // INSERT into entries
        { rows: [{ id: entryId }], command: "INSERT", rowCount: 1, oid: 0, fields: [] },
      ];
      let callIdx = 0;
      const pool = mockPool(async () => queryResults[callIdx++]);

      app = await buildTestApp(pool);
      const entriesModule = await import("../entries.js");
      app.register(entriesModule.default as unknown as Parameters<typeof app.register>[0]);
      await app.ready();

      const token = await createMockSession(app, userId);

      const res = await app.inject({
        method: "POST",
        url: "/api/entries",
        cookies: { session: token },
        payload: {
          ciphertext: Buffer.from("encrypted-content").toString("base64url"),
          iv: Buffer.from("random-iv-12").toString("base64url"),
          aad: buildAad(entryId, userId, 100),
        },
      });

      expect(res.statusCode).toBe(201);
      expect(res.json().id).toBe(entryId);
    });

    it("returns 400 when word count is below minimum", async () => {
      const userId = "user-123";

      const queryResults: QueryResult<QueryResultRow>[] = [
        // requireAuth: session lookup
        { rows: [{ id: "session-1" }], command: "SELECT", rowCount: 1, oid: 0, fields: [] },
        // SELECT word_minimum from deadline_state
        { rows: [{ word_minimum: 50 }], command: "SELECT", rowCount: 1, oid: 0, fields: [] },
      ];
      let callIdx = 0;
      const pool = mockPool(async () => queryResults[callIdx++]);

      app = await buildTestApp(pool);
      const entriesModule = await import("../entries.js");
      app.register(entriesModule.default as unknown as Parameters<typeof app.register>[0]);
      await app.ready();

      const token = await createMockSession(app, userId);

      const res = await app.inject({
        method: "POST",
        url: "/api/entries",
        cookies: { session: token },
        payload: {
          ciphertext: Buffer.from("encrypted-content").toString("base64url"),
          iv: Buffer.from("random-iv-12").toString("base64url"),
          aad: buildAad("entry-1", userId, 30),
        },
      });

      expect(res.statusCode).toBe(400);
      const body = res.json();
      expect(body.error).toContain("Word count below minimum");
      expect(body.required).toBe(50);
      expect(body.actual).toBe(30);
    });

    it("stores all fields in DB (ciphertext, iv, aad, word_count)", async () => {
      const userId = "user-123";
      const entryId = "entry-xyz";
      const ciphertextB64 = Buffer.from("encrypted-content").toString("base64url");
      const ivB64 = Buffer.from("random-iv-12").toString("base64url");
      const aadB64 = buildAad(entryId, userId, 75);

      const insertCalls: { text: string; values: unknown[] }[] = [];
      const queryResults: QueryResult<QueryResultRow>[] = [
        // requireAuth: session lookup
        { rows: [{ id: "session-1" }], command: "SELECT", rowCount: 1, oid: 0, fields: [] },
        // SELECT word_minimum — no deadline_state row, should default to 50
        { rows: [], command: "SELECT", rowCount: 0, oid: 0, fields: [] },
        // INSERT into entries
        { rows: [{ id: entryId }], command: "INSERT", rowCount: 1, oid: 0, fields: [] },
      ];
      let callIdx = 0;
      const pool = mockPool(async (text: string, values?: unknown[]) => {
        if (text.includes("INSERT")) {
          insertCalls.push({ text, values: values ?? [] });
        }
        return queryResults[callIdx++];
      });

      app = await buildTestApp(pool);
      const entriesModule = await import("../entries.js");
      app.register(entriesModule.default as unknown as Parameters<typeof app.register>[0]);
      await app.ready();

      const token = await createMockSession(app, userId);

      const res = await app.inject({
        method: "POST",
        url: "/api/entries",
        cookies: { session: token },
        payload: {
          ciphertext: ciphertextB64,
          iv: ivB64,
          aad: aadB64,
        },
      });

      expect(res.statusCode).toBe(201);
      expect(insertCalls.length).toBe(1);
      const insertValues = insertCalls[0].values;
      // Should have: id, user_id, ciphertext, iv, aad, word_count
      expect(insertValues[0]).toBe(entryId); // entryId from AAD
      expect(insertValues[1]).toBe(userId);
      expect(insertValues[5]).toBe(75); // word_count
    });

    it("returns 403 when AAD userId does not match authenticated user", async () => {
      const userId = "user-123";
      const spoofedUserId = "user-hacker";

      const queryResults: QueryResult<QueryResultRow>[] = [
        // requireAuth: session lookup
        { rows: [{ id: "session-1" }], command: "SELECT", rowCount: 1, oid: 0, fields: [] },
      ];
      let callIdx = 0;
      const pool = mockPool(async () => queryResults[callIdx++]);

      app = await buildTestApp(pool);
      const entriesModule = await import("../entries.js");
      app.register(entriesModule.default as unknown as Parameters<typeof app.register>[0]);
      await app.ready();

      const token = await createMockSession(app, userId);

      const res = await app.inject({
        method: "POST",
        url: "/api/entries",
        cookies: { session: token },
        payload: {
          ciphertext: Buffer.from("data").toString("base64url"),
          iv: Buffer.from("random-iv-12").toString("base64url"),
          aad: buildAad("entry-1", spoofedUserId, 100),
        },
      });

      expect(res.statusCode).toBe(403);
    });
  });
});
