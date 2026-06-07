import { describe, it, expect, afterEach, vi } from "vitest";
import { buildTestApp, mockPool } from "../../test-helpers/index.js";
import type { FastifyInstance } from "fastify";
import type { QueryResult, QueryResultRow } from "pg";

// Mock argon2 to avoid native binary issues in test
vi.mock("argon2", () => ({
  default: {
    hash: vi.fn(async (pass: string) => `$argon2id$v=19$m=65536,t=3,p=4$salt$${Buffer.from(pass).toString("base64")}`),
    verify: vi.fn(async (hash: string, pass: string) => {
      // Simple mock: check if the base64 of pass is in the hash
      return hash.includes(Buffer.from(pass).toString("base64"));
    }),
    argon2id: 2,
  },
  hash: vi.fn(async (pass: string) => `$argon2id$v=19$m=65536,t=3,p=4$salt$${Buffer.from(pass).toString("base64")}`),
  verify: vi.fn(async (hash: string, pass: string) => {
    return hash.includes(Buffer.from(pass).toString("base64"));
  }),
  argon2id: 2,
}));

describe("POST /api/auth/register", () => {
  let app: FastifyInstance;

  afterEach(async () => {
    if (app) await app.close();
  });

  it("creates user with argon2id hash and returns 201 with session cookie", async () => {
    const queryResults: QueryResult<QueryResultRow>[] = [
      // SELECT COUNT(*) FROM users → no existing users
      { rows: [{ count: "0" }], command: "SELECT", rowCount: 1, oid: 0, fields: [] },
      // INSERT INTO users → returns new user id
      { rows: [{ id: "user-new-123" }], command: "INSERT", rowCount: 1, oid: 0, fields: [] },
      // INSERT INTO sessions → returns session id
      { rows: [{ id: "session-new-456" }], command: "INSERT", rowCount: 1, oid: 0, fields: [] },
    ];
    let callIdx = 0;
    const pool = mockPool(async () => queryResults[callIdx++]);

    app = await buildTestApp(pool);
    const { default: authRoutes } = await import("../auth.js");
    app.register(authRoutes);

    const res = await app.inject({
      method: "POST",
      url: "/api/auth/register",
      payload: { passphrase: "my-secret-passphrase-12chars" },
    });

    expect(res.statusCode).toBe(201);
    const body = res.json();
    expect(body.id).toBe("user-new-123");

    // Verify session cookie is set
    const cookies = res.cookies;
    const sessionCookie = cookies.find((c: { name: string }) => c.name === "session");
    expect(sessionCookie).toBeDefined();
    expect(sessionCookie!.httpOnly).toBe(true);
    expect(sessionCookie!.sameSite).toBe("Strict");
  });

  it("rejects if account already exists (409)", async () => {
    const pool = mockPool(async () => ({
      rows: [{ count: "1" }],
      command: "SELECT",
      rowCount: 1,
      oid: 0,
      fields: [],
    }));

    app = await buildTestApp(pool);
    const { default: authRoutes } = await import("../auth.js");
    app.register(authRoutes);

    const res = await app.inject({
      method: "POST",
      url: "/api/auth/register",
      payload: { passphrase: "my-secret-passphrase-12chars" },
    });

    expect(res.statusCode).toBe(409);
    expect(res.json().error).toContain("Account already exists");
  });

  it("rejects passphrase shorter than 12 chars (400)", async () => {
    app = await buildTestApp();
    const { default: authRoutes } = await import("../auth.js");
    app.register(authRoutes);

    const res = await app.inject({
      method: "POST",
      url: "/api/auth/register",
      payload: { passphrase: "short" },
    });

    expect(res.statusCode).toBe(400);
    expect(res.json().error).toContain("12 characters");
  });
});

describe("POST /api/auth/unlock", () => {
  let app: FastifyInstance;

  afterEach(async () => {
    if (app) await app.close();
  });

  it("returns 200 with session cookie on correct passphrase", async () => {
    const passphrase = "my-secret-passphrase-12chars";
    const storedHash = `$argon2id$v=19$m=65536,t=3,p=4$salt$${Buffer.from(passphrase).toString("base64")}`;
    const hkdfSalt = Buffer.from("a]b".repeat(10) + "ab");

    const queryResults: QueryResult<QueryResultRow>[] = [
      // SELECT user
      { rows: [{ id: "user-123", passphrase_hash: storedHash, hkdf_salt: hkdfSalt }], command: "SELECT", rowCount: 1, oid: 0, fields: [] },
      // INSERT session
      { rows: [{ id: "session-789" }], command: "INSERT", rowCount: 1, oid: 0, fields: [] },
    ];
    let callIdx = 0;
    const pool = mockPool(async () => queryResults[callIdx++]);

    app = await buildTestApp(pool);
    const { default: authRoutes } = await import("../auth.js");
    app.register(authRoutes);

    const res = await app.inject({
      method: "POST",
      url: "/api/auth/unlock",
      payload: { passphrase },
    });

    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.id).toBe("user-123");
    expect(body.hkdfSalt).toBeDefined();

    const cookies = res.cookies;
    const sessionCookie = cookies.find((c: { name: string }) => c.name === "session");
    expect(sessionCookie).toBeDefined();
  });

  it("rejects invalid passphrase (401)", async () => {
    const storedHash = `$argon2id$v=19$m=65536,t=3,p=4$salt$${Buffer.from("correct-passphrase").toString("base64")}`;

    const pool = mockPool(async () => ({
      rows: [{ id: "user-123", passphrase_hash: storedHash, hkdf_salt: Buffer.from("salt") }],
      command: "SELECT",
      rowCount: 1,
      oid: 0,
      fields: [],
    }));

    app = await buildTestApp(pool);
    const { default: authRoutes } = await import("../auth.js");
    app.register(authRoutes);

    const res = await app.inject({
      method: "POST",
      url: "/api/auth/unlock",
      payload: { passphrase: "wrong-passphrase" },
    });

    expect(res.statusCode).toBe(401);
    expect(res.json().error).toContain("Invalid passphrase");
  });

  it("rejects if no account exists (404)", async () => {
    const pool = mockPool(async () => ({
      rows: [],
      command: "SELECT",
      rowCount: 0,
      oid: 0,
      fields: [],
    }));

    app = await buildTestApp(pool);
    const { default: authRoutes } = await import("../auth.js");
    app.register(authRoutes);

    const res = await app.inject({
      method: "POST",
      url: "/api/auth/unlock",
      payload: { passphrase: "doesnt-matter-12" },
    });

    expect(res.statusCode).toBe(404);
    expect(res.json().error).toContain("No account");
  });
});
