import { describe, it, expect, afterEach } from "vitest";
import { buildTestApp, mockPool, createMockSession } from "../../test-helpers/index.js";
import type { FastifyInstance } from "fastify";
import type { QueryResult, QueryResultRow } from "pg";

const testSubscription = {
  endpoint: "https://push.example.com/test-endpoint",
  expirationTime: null,
  keys: {
    p256dh: "BNcRdreALRFXTkOOUHK1EtK2wtaz5Ry4YfYCA_0QTpQtUbVlTiHmkduosyHdXpSku5em3dZVd7gBPZ_3ZRDDLs=",
    auth: "tBHItJI5svbpez7KI4CCXg==",
  },
};

describe("Notification routes", () => {
  let app: FastifyInstance;

  afterEach(async () => {
    if (app) await app.close();
  });

  describe("POST /api/notifications/subscribe", () => {
    it("returns 401 without authentication", async () => {
      const pool = mockPool();
      app = await buildTestApp(pool);
      const notificationsModule = await import("../notifications.js");
      app.register(notificationsModule.default as unknown as Parameters<typeof app.register>[0]);

      const res = await app.inject({
        method: "POST",
        url: "/api/notifications/subscribe",
        payload: testSubscription,
      });

      expect(res.statusCode).toBe(401);
    });

    it("upserts subscription row with ON CONFLICT clause", async () => {
      const userId = "user-123";
      const insertSqls: string[] = [];

      const queryResults: QueryResult<QueryResultRow>[] = [
        // requireAuth: session lookup
        { rows: [{ id: "session-1" }], command: "SELECT", rowCount: 1, oid: 0, fields: [] },
        // upsert
        { rows: [], command: "INSERT", rowCount: 1, oid: 0, fields: [] },
      ];
      let callIdx = 0;
      const pool = mockPool(async (text: string) => {
        if (text.toUpperCase().includes("INSERT") || text.toUpperCase().includes("ON CONFLICT")) {
          insertSqls.push(text);
        }
        return queryResults[callIdx++];
      });

      app = await buildTestApp(pool);
      const notificationsModule = await import("../notifications.js");
      app.register(notificationsModule.default as unknown as Parameters<typeof app.register>[0]);
      await app.ready();

      const token = await createMockSession(app, userId);

      const res = await app.inject({
        method: "POST",
        url: "/api/notifications/subscribe",
        cookies: { session: token },
        payload: testSubscription,
      });

      expect(res.statusCode).toBe(200);
      // Verify the SQL includes ON CONFLICT
      expect(insertSqls.some((sql) => sql.toUpperCase().includes("ON CONFLICT"))).toBe(true);
    });

    it("returns 400 when subscription body is missing endpoint", async () => {
      const userId = "user-123";

      const queryResults: QueryResult<QueryResultRow>[] = [
        // requireAuth: session lookup
        { rows: [{ id: "session-1" }], command: "SELECT", rowCount: 1, oid: 0, fields: [] },
      ];
      let callIdx = 0;
      const pool = mockPool(async () => queryResults[callIdx++]);

      app = await buildTestApp(pool);
      const notificationsModule = await import("../notifications.js");
      app.register(notificationsModule.default as unknown as Parameters<typeof app.register>[0]);
      await app.ready();

      const token = await createMockSession(app, userId);

      const res = await app.inject({
        method: "POST",
        url: "/api/notifications/subscribe",
        cookies: { session: token },
        payload: { keys: { p256dh: "abc", auth: "def" } }, // missing endpoint
      });

      expect(res.statusCode).toBe(400);
    });
  });

  describe("DELETE /api/notifications/subscribe", () => {
    it("returns 401 without authentication", async () => {
      const pool = mockPool();
      app = await buildTestApp(pool);
      const notificationsModule = await import("../notifications.js");
      app.register(notificationsModule.default as unknown as Parameters<typeof app.register>[0]);

      const res = await app.inject({
        method: "DELETE",
        url: "/api/notifications/subscribe",
        payload: { endpoint: testSubscription.endpoint },
      });

      expect(res.statusCode).toBe(401);
    });

    it("deletes the subscription row for the user and endpoint", async () => {
      const userId = "user-123";
      const deleteSqls: { text: string; values: unknown[] }[] = [];

      const queryResults: QueryResult<QueryResultRow>[] = [
        // requireAuth: session lookup
        { rows: [{ id: "session-1" }], command: "SELECT", rowCount: 1, oid: 0, fields: [] },
        // delete
        { rows: [], command: "DELETE", rowCount: 1, oid: 0, fields: [] },
      ];
      let callIdx = 0;
      const pool = mockPool(async (text: string, values?: unknown[]) => {
        if (text.toUpperCase().startsWith("DELETE")) {
          deleteSqls.push({ text, values: values ?? [] });
        }
        return queryResults[callIdx++];
      });

      app = await buildTestApp(pool);
      const notificationsModule = await import("../notifications.js");
      app.register(notificationsModule.default as unknown as Parameters<typeof app.register>[0]);
      await app.ready();

      const token = await createMockSession(app, userId);

      const res = await app.inject({
        method: "DELETE",
        url: "/api/notifications/subscribe",
        cookies: { session: token },
        payload: { endpoint: testSubscription.endpoint },
      });

      expect(res.statusCode).toBe(204);
      expect(deleteSqls.length).toBe(1);
      // userId should be in the query values
      expect(deleteSqls[0].values).toContain(userId);
    });
  });
});
