import { describe, it, expect, afterEach, vi } from "vitest";
import { buildTestApp, mockPool, createMockSession } from "../../test-helpers/index.js";
import type { FastifyInstance } from "fastify";
import type { QueryResult, QueryResultRow } from "pg";
import crypto from "node:crypto";

// Set SHARD_ENCRYPTION_KEY env before importing crypto routes
const TEST_SHARD_KEY = crypto.randomBytes(32).toString("hex");
process.env.SHARD_ENCRYPTION_KEY = TEST_SHARD_KEY;

describe("Crypto routes", () => {
  let app: FastifyInstance;

  afterEach(async () => {
    if (app) await app.close();
  });

  // Helper: encrypt a shard the same way the server does for DB storage
  function encryptShardForDb(shardBuf: Buffer): Buffer {
    const key = Buffer.from(TEST_SHARD_KEY, "hex");
    const iv = crypto.randomBytes(12);
    const cipher = crypto.createCipheriv("aes-256-gcm", key, iv);
    const ciphertext = Buffer.concat([cipher.update(shardBuf), cipher.final()]);
    const authTag = cipher.getAuthTag();
    // Format: iv(12) + authTag(16) + ciphertext
    return Buffer.concat([iv, authTag, ciphertext]);
  }

  describe("GET /api/crypto/shard", () => {
    it("returns 401 without authentication", async () => {
      const pool = mockPool(async () => ({
        rows: [{ id: "session-1" }],
        command: "SELECT",
        rowCount: 1,
        oid: 0,
        fields: [],
      }));

      app = await buildTestApp(pool);
      const cryptoModule = await import("../crypto.js");
      app.register(cryptoModule.default as unknown as Parameters<typeof app.register>[0]);

      const res = await app.inject({
        method: "GET",
        url: "/api/crypto/shard",
      });

      expect(res.statusCode).toBe(401);
    });

    it("returns 404 when no shard exists", async () => {
      const userId = "user-123";
      const queryResults: QueryResult<QueryResultRow>[] = [
        // requireAuth: session lookup
        { rows: [{ id: "session-1" }], command: "SELECT", rowCount: 1, oid: 0, fields: [] },
        // SELECT shard → empty
        { rows: [], command: "SELECT", rowCount: 0, oid: 0, fields: [] },
      ];
      let callIdx = 0;
      const pool = mockPool(async () => queryResults[callIdx++]);

      app = await buildTestApp(pool);
      const cryptoModule = await import("../crypto.js");
      app.register(cryptoModule.default as unknown as Parameters<typeof app.register>[0]);
      await app.ready();

      const token = await createMockSession(app, userId);

      const res = await app.inject({
        method: "GET",
        url: "/api/crypto/shard",
        cookies: { session: token },
      });

      expect(res.statusCode).toBe(404);
    });

    it("returns 200 with decrypted shard as base64url", async () => {
      const userId = "user-123";
      const rawShard = crypto.randomBytes(32);
      const encryptedShard = encryptShardForDb(rawShard);
      const hkdfSalt = crypto.randomBytes(32);

      const queryResults: QueryResult<QueryResultRow>[] = [
        // requireAuth: session lookup
        { rows: [{ id: "session-1" }], command: "SELECT", rowCount: 1, oid: 0, fields: [] },
        // SELECT shard
        { rows: [{ shard: encryptedShard }], command: "SELECT", rowCount: 1, oid: 0, fields: [] },
        // SELECT hkdf_salt from users
        { rows: [{ hkdf_salt: hkdfSalt }], command: "SELECT", rowCount: 1, oid: 0, fields: [] },
      ];
      let callIdx = 0;
      const pool = mockPool(async () => queryResults[callIdx++]);

      app = await buildTestApp(pool);
      const cryptoModule = await import("../crypto.js");
      app.register(cryptoModule.default as unknown as Parameters<typeof app.register>[0]);
      await app.ready();

      const token = await createMockSession(app, userId);

      const res = await app.inject({
        method: "GET",
        url: "/api/crypto/shard",
        cookies: { session: token },
      });

      expect(res.statusCode).toBe(200);
      const body = res.json();
      expect(body.shard).toBe(rawShard.toString("base64url"));
      expect(body.hkdfSalt).toBe(hkdfSalt.toString("base64url"));
    });
  });

  describe("POST /api/crypto/shard", () => {
    it("stores a new server shard encrypted at rest", async () => {
      const userId = "user-123";
      const rawShard = crypto.randomBytes(32);

      const queryResults: QueryResult<QueryResultRow>[] = [
        // requireAuth: session lookup
        { rows: [{ id: "session-1" }], command: "SELECT", rowCount: 1, oid: 0, fields: [] },
        // INSERT into server_shards
        { rows: [{ id: "shard-1" }], command: "INSERT", rowCount: 1, oid: 0, fields: [] },
      ];
      let callIdx = 0;
      const insertCalls: unknown[][] = [];
      const pool = mockPool(async (text: string, values?: unknown[]) => {
        if (text.includes("INSERT")) {
          insertCalls.push(values ?? []);
        }
        return queryResults[callIdx++];
      });

      app = await buildTestApp(pool);
      const cryptoModule = await import("../crypto.js");
      app.register(cryptoModule.default as unknown as Parameters<typeof app.register>[0]);
      await app.ready();

      const token = await createMockSession(app, userId);

      const res = await app.inject({
        method: "POST",
        url: "/api/crypto/shard",
        cookies: { session: token },
        payload: { shard: rawShard.toString("base64url") },
      });

      expect(res.statusCode).toBe(201);
      // Verify the stored shard is encrypted (not raw)
      expect(insertCalls.length).toBe(1);
      const storedShard = insertCalls[0][1] as Buffer;
      // Encrypted shard should be longer than raw (iv + authTag + ciphertext)
      expect(storedShard.length).toBeGreaterThan(rawShard.length);
    });
  });

  describe("POST /api/crypto/key-wrap", () => {
    it("stores wrapped DMK with wrap metadata", async () => {
      const userId = "user-123";

      const queryResults: QueryResult<QueryResultRow>[] = [
        // requireAuth: session lookup
        { rows: [{ id: "session-1" }], command: "SELECT", rowCount: 1, oid: 0, fields: [] },
        // INSERT into key_wraps
        { rows: [{ id: "wrap-1" }], command: "INSERT", rowCount: 1, oid: 0, fields: [] },
      ];
      let callIdx = 0;
      const pool = mockPool(async () => queryResults[callIdx++]);

      app = await buildTestApp(pool);
      const cryptoModule = await import("../crypto.js");
      app.register(cryptoModule.default as unknown as Parameters<typeof app.register>[0]);
      await app.ready();

      const token = await createMockSession(app, userId);

      const res = await app.inject({
        method: "POST",
        url: "/api/crypto/key-wrap",
        cookies: { session: token },
        payload: {
          wrappedDmk: Buffer.from("wrapped-dmk-data").toString("base64url"),
          wrapIv: Buffer.from("wrap-iv-12by").toString("base64url"),
          wrapType: "passphrase",
        },
      });

      expect(res.statusCode).toBe(201);
    });
  });

  describe("GET /api/crypto/key-wrap", () => {
    it("returns all key wraps for authenticated user", async () => {
      const userId = "user-123";
      const wrappedDmk = Buffer.from("wrapped-dmk-data");
      const wrapIv = Buffer.from("wrap-iv-12by");

      const queryResults: QueryResult<QueryResultRow>[] = [
        // requireAuth: session lookup
        { rows: [{ id: "session-1" }], command: "SELECT", rowCount: 1, oid: 0, fields: [] },
        // SELECT key_wraps
        {
          rows: [
            {
              wrapped_dmk: wrappedDmk,
              wrap_iv: wrapIv,
              wrap_type: "passphrase",
              credential_id: null,
            },
            {
              wrapped_dmk: wrappedDmk,
              wrap_iv: wrapIv,
              wrap_type: "webauthn_prf",
              credential_id: "cred-abc",
            },
          ],
          command: "SELECT",
          rowCount: 2,
          oid: 0,
          fields: [],
        },
      ];
      let callIdx = 0;
      const pool = mockPool(async () => queryResults[callIdx++]);

      app = await buildTestApp(pool);
      const cryptoModule = await import("../crypto.js");
      app.register(cryptoModule.default as unknown as Parameters<typeof app.register>[0]);
      await app.ready();

      const token = await createMockSession(app, userId);

      const res = await app.inject({
        method: "GET",
        url: "/api/crypto/key-wrap",
        cookies: { session: token },
      });

      expect(res.statusCode).toBe(200);
      const body = res.json();
      expect(body.wraps).toHaveLength(2);
      expect(body.wraps[0].wrapType).toBe("passphrase");
      expect(body.wraps[0].credentialId).toBeNull();
      expect(body.wraps[1].wrapType).toBe("webauthn_prf");
      expect(body.wraps[1].credentialId).toBe("cred-abc");
      // Values should be base64url encoded
      expect(body.wraps[0].wrappedDmk).toBe(wrappedDmk.toString("base64url"));
      expect(body.wraps[0].wrapIv).toBe(wrapIv.toString("base64url"));
    });
  });
});
