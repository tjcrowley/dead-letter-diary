import { describe, it, expect, afterEach, vi, beforeEach } from "vitest";
import { buildTestApp, mockPool, createMockSession } from "../../test-helpers/index.js";
import type { FastifyInstance } from "fastify";
import type { QueryResult, QueryResultRow } from "pg";

// In-memory mock Redis for challenge storage
const redisStore = new Map<string, string>();

vi.mock("ioredis", () => {
  return {
    default: class MockRedis {
      async set(key: string, value: string, _mode: string, _ttl: number): Promise<string> {
        redisStore.set(key, value);
        return "OK";
      }
      async get(key: string): Promise<string | null> {
        return redisStore.get(key) ?? null;
      }
      async del(key: string): Promise<number> {
        redisStore.delete(key);
        return 1;
      }
      async quit(): Promise<string> {
        return "OK";
      }
    },
  };
});

// Mock @simplewebauthn/server
const mockGenerateRegistrationOptions = vi.fn();
const mockVerifyRegistrationResponse = vi.fn();
const mockGenerateAuthenticationOptions = vi.fn();
const mockVerifyAuthenticationResponse = vi.fn();

vi.mock("@simplewebauthn/server", () => ({
  generateRegistrationOptions: mockGenerateRegistrationOptions,
  verifyRegistrationResponse: mockVerifyRegistrationResponse,
  generateAuthenticationOptions: mockGenerateAuthenticationOptions,
  verifyAuthenticationResponse: mockVerifyAuthenticationResponse,
}));

// Helper to build app with redis mock + webauthn routes
async function buildWebAuthnApp(
  queryFn?: (text: string, values?: unknown[]) => Promise<QueryResult<QueryResultRow>>
): Promise<FastifyInstance> {
  const pool = queryFn ? mockPool(queryFn) : mockPool();
  const app = await buildTestApp(pool);

  // Register mock redis plugin
  const fp = (await import("fastify-plugin")).default;
  const ioredisModule = await import("ioredis");
  const MockRedis = ioredisModule.default as unknown as new () => Record<string, unknown>;
  const mockRedisClient = new MockRedis();
  app.register(
    fp(
      async (fastify) => {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        fastify.decorate("redis", mockRedisClient as any);
      },
      { name: "redis" }
    )
  );

  // Register webauthn routes
  const webauthnModule = await import("../webauthn.js");
  app.register(webauthnModule.default as unknown as Parameters<typeof app.register>[0]);

  return app;
}

const TEST_USER_ID = "user-test-123";
const TEST_SESSION_ID = "session-test-456";
const TEST_CHALLENGE = "test-challenge-base64url";
const TEST_CREDENTIAL_ID = "cred-abc-123";
const TEST_PUBLIC_KEY = Buffer.from("test-public-key");

describe("POST /api/webauthn/register-options", () => {
  let app: FastifyInstance;

  beforeEach(() => {
    redisStore.clear();
    vi.clearAllMocks();
  });

  afterEach(async () => {
    if (app) await app.close();
  });

  it("returns registration options with rpName, rpID, userVerification required", async () => {
    const queryResults: QueryResult<QueryResultRow>[] = [
      // requireAuth: SELECT sessions
      { rows: [{ id: TEST_SESSION_ID }], command: "SELECT", rowCount: 1, oid: 0, fields: [] },
      // SELECT existing credentials
      { rows: [], command: "SELECT", rowCount: 0, oid: 0, fields: [] },
    ];
    let callIdx = 0;
    app = await buildWebAuthnApp(async () => queryResults[callIdx++]);

    const expectedOptions = {
      challenge: TEST_CHALLENGE,
      rp: { name: "Dead Letter Diary", id: "localhost" },
      user: { id: TEST_USER_ID, name: TEST_USER_ID },
      authenticatorSelection: { userVerification: "required" },
    };
    mockGenerateRegistrationOptions.mockResolvedValue(expectedOptions);

    await app.ready();
    const sessionJwt = await createMockSession(app, TEST_USER_ID, TEST_SESSION_ID);

    const res = await app.inject({
      method: "POST",
      url: "/api/webauthn/register-options",
      cookies: { session: sessionJwt },
    });

    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.rp.name).toBe("Dead Letter Diary");
    expect(body.authenticatorSelection.userVerification).toBe("required");
    expect(body.challenge).toBeDefined();

    // Verify challenge was stored in redis
    const storedChallenge = redisStore.get(`webauthn:challenge:${TEST_USER_ID}`);
    expect(storedChallenge).toBe(TEST_CHALLENGE);
  });
});

describe("POST /api/webauthn/register-verify", () => {
  let app: FastifyInstance;

  beforeEach(() => {
    redisStore.clear();
    vi.clearAllMocks();
  });

  afterEach(async () => {
    if (app) await app.close();
  });

  it("stores credential with prf_capable flag on valid attestation", async () => {
    let insertedCredential: unknown[] | null = null;

    const queryResults: QueryResult<QueryResultRow>[] = [
      // requireAuth: SELECT sessions
      { rows: [{ id: TEST_SESSION_ID }], command: "SELECT", rowCount: 1, oid: 0, fields: [] },
      // INSERT INTO webauthn_credentials
      { rows: [], command: "INSERT", rowCount: 1, oid: 0, fields: [] },
    ];
    let callIdx = 0;
    app = await buildWebAuthnApp(async (text: string, values?: unknown[]) => {
      const result = queryResults[callIdx++];
      if (text.includes("INSERT INTO webauthn_credentials")) {
        insertedCredential = values ?? null;
      }
      return result;
    });

    // Pre-seed challenge in redis
    redisStore.set(`webauthn:challenge:${TEST_USER_ID}`, TEST_CHALLENGE);

    mockVerifyRegistrationResponse.mockResolvedValue({
      verified: true,
      registrationInfo: {
        credential: {
          id: TEST_CREDENTIAL_ID,
          publicKey: TEST_PUBLIC_KEY,
          counter: 0,
        },
      },
    });

    await app.ready();
    const sessionJwt = await createMockSession(app, TEST_USER_ID, TEST_SESSION_ID);

    const res = await app.inject({
      method: "POST",
      url: "/api/webauthn/register-verify",
      cookies: { session: sessionJwt },
      payload: {
        attestation: { id: TEST_CREDENTIAL_ID, response: {} },
        prfEnabled: true,
      },
    });

    expect(res.statusCode).toBe(201);
    const body = res.json();
    expect(body.credentialId).toBe(TEST_CREDENTIAL_ID);
    expect(body.prfCapable).toBe(true);

    // Verify credential was inserted with prf_capable = true
    expect(insertedCredential).not.toBeNull();
    expect(insertedCredential![5]).toBe(true); // prf_capable is 6th param
  });

  it("rejects invalid attestation response with 400", async () => {
    const queryResults: QueryResult<QueryResultRow>[] = [
      // requireAuth: SELECT sessions
      { rows: [{ id: TEST_SESSION_ID }], command: "SELECT", rowCount: 1, oid: 0, fields: [] },
    ];
    let callIdx = 0;
    app = await buildWebAuthnApp(async () => queryResults[callIdx++]);

    // Pre-seed challenge
    redisStore.set(`webauthn:challenge:${TEST_USER_ID}`, TEST_CHALLENGE);

    mockVerifyRegistrationResponse.mockResolvedValue({
      verified: false,
    });

    await app.ready();
    const sessionJwt = await createMockSession(app, TEST_USER_ID, TEST_SESSION_ID);

    const res = await app.inject({
      method: "POST",
      url: "/api/webauthn/register-verify",
      cookies: { session: sessionJwt },
      payload: {
        attestation: { id: "bad-cred", response: {} },
        prfEnabled: false,
      },
    });

    expect(res.statusCode).toBe(400);
    expect(res.json().error).toContain("verification failed");
  });
});

describe("POST /api/webauthn/auth-options", () => {
  let app: FastifyInstance;

  beforeEach(() => {
    redisStore.clear();
    vi.clearAllMocks();
  });

  afterEach(async () => {
    if (app) await app.close();
  });

  it("returns auth options with allowCredentials from stored credentials", async () => {
    const queryResults: QueryResult<QueryResultRow>[] = [
      // SELECT user
      { rows: [{ id: TEST_USER_ID, hkdf_salt: Buffer.from("test-salt") }], command: "SELECT", rowCount: 1, oid: 0, fields: [] },
      // SELECT credentials
      { rows: [{ id: TEST_CREDENTIAL_ID, transports: ["internal"] }], command: "SELECT", rowCount: 1, oid: 0, fields: [] },
    ];
    let callIdx = 0;
    app = await buildWebAuthnApp(async () => queryResults[callIdx++]);

    const expectedOptions = {
      challenge: TEST_CHALLENGE,
      allowCredentials: [{ id: TEST_CREDENTIAL_ID, transports: ["internal"] }],
      userVerification: "required",
    };
    mockGenerateAuthenticationOptions.mockResolvedValue(expectedOptions);

    const res = await app.inject({
      method: "POST",
      url: "/api/webauthn/auth-options",
    });

    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.challenge).toBeDefined();
    expect(body.allowCredentials).toHaveLength(1);
    expect(body.hkdfSalt).toBeDefined(); // base64url salt returned
  });
});

describe("POST /api/webauthn/auth-verify", () => {
  let app: FastifyInstance;

  beforeEach(() => {
    redisStore.clear();
    vi.clearAllMocks();
  });

  afterEach(async () => {
    if (app) await app.close();
  });

  it("verifies assertion, updates counter, and issues session cookie", async () => {
    let counterUpdated = false;
    let sessionInserted = false;

    const queryResults: QueryResult<QueryResultRow>[] = [
      // SELECT user
      { rows: [{ id: TEST_USER_ID, hkdf_salt: Buffer.from("test-salt") }], command: "SELECT", rowCount: 1, oid: 0, fields: [] },
      // SELECT credential
      { rows: [{ id: TEST_CREDENTIAL_ID, public_key: TEST_PUBLIC_KEY, counter: 0, transports: ["internal"] }], command: "SELECT", rowCount: 1, oid: 0, fields: [] },
      // UPDATE counter
      { rows: [], command: "UPDATE", rowCount: 1, oid: 0, fields: [] },
      // INSERT session
      { rows: [{ id: TEST_SESSION_ID }], command: "INSERT", rowCount: 1, oid: 0, fields: [] },
    ];
    let callIdx = 0;
    app = await buildWebAuthnApp(async (text: string) => {
      const result = queryResults[callIdx++];
      if (text.includes("UPDATE webauthn_credentials")) counterUpdated = true;
      if (text.includes("INSERT INTO sessions")) sessionInserted = true;
      return result;
    });

    // Pre-seed challenge
    redisStore.set(`webauthn:challenge:auth:${TEST_USER_ID}`, TEST_CHALLENGE);

    mockVerifyAuthenticationResponse.mockResolvedValue({
      verified: true,
      authenticationInfo: {
        userVerified: true,
        newCounter: 1,
        credentialID: TEST_CREDENTIAL_ID,
      },
    });

    const res = await app.inject({
      method: "POST",
      url: "/api/webauthn/auth-verify",
      payload: {
        response: {
          id: TEST_CREDENTIAL_ID,
          rawId: TEST_CREDENTIAL_ID,
          response: { authenticatorData: "", clientDataJSON: "", signature: "" },
          type: "public-key",
        },
      },
    });

    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.id).toBe(TEST_USER_ID);

    // Verify counter was updated
    expect(counterUpdated).toBe(true);

    // Verify session was created
    expect(sessionInserted).toBe(true);

    // Verify session cookie is set
    const cookies = res.cookies;
    const sessionCookie = cookies.find((c: { name: string }) => c.name === "session");
    expect(sessionCookie).toBeDefined();
    expect(sessionCookie!.httpOnly).toBe(true);
  });

  it("rejects UV=false assertion with 403 (AUTH-07)", async () => {
    const queryResults: QueryResult<QueryResultRow>[] = [
      // SELECT user
      { rows: [{ id: TEST_USER_ID, hkdf_salt: Buffer.from("test-salt") }], command: "SELECT", rowCount: 1, oid: 0, fields: [] },
      // SELECT credential
      { rows: [{ id: TEST_CREDENTIAL_ID, public_key: TEST_PUBLIC_KEY, counter: 0, transports: ["internal"] }], command: "SELECT", rowCount: 1, oid: 0, fields: [] },
    ];
    let callIdx = 0;
    app = await buildWebAuthnApp(async () => queryResults[callIdx++]);

    // Pre-seed challenge
    redisStore.set(`webauthn:challenge:auth:${TEST_USER_ID}`, TEST_CHALLENGE);

    mockVerifyAuthenticationResponse.mockResolvedValue({
      verified: true,
      authenticationInfo: {
        userVerified: false,
        newCounter: 1,
        credentialID: TEST_CREDENTIAL_ID,
      },
    });

    const res = await app.inject({
      method: "POST",
      url: "/api/webauthn/auth-verify",
      payload: {
        response: {
          id: TEST_CREDENTIAL_ID,
          rawId: TEST_CREDENTIAL_ID,
          response: { authenticatorData: "", clientDataJSON: "", signature: "" },
          type: "public-key",
        },
      },
    });

    expect(res.statusCode).toBe(403);
    expect(res.json().error).toContain("Biometric confirmation required");
  });

  it("rejects replayed challenge with 400", async () => {
    const queryResults: QueryResult<QueryResultRow>[] = [
      // SELECT user
      { rows: [{ id: TEST_USER_ID, hkdf_salt: Buffer.from("test-salt") }], command: "SELECT", rowCount: 1, oid: 0, fields: [] },
    ];
    let callIdx = 0;
    app = await buildWebAuthnApp(async () => queryResults[callIdx++]);

    // Do NOT pre-seed challenge (simulates already-used or expired)

    const res = await app.inject({
      method: "POST",
      url: "/api/webauthn/auth-verify",
      payload: {
        response: {
          id: TEST_CREDENTIAL_ID,
          rawId: TEST_CREDENTIAL_ID,
          response: { authenticatorData: "", clientDataJSON: "", signature: "" },
          type: "public-key",
        },
      },
    });

    expect(res.statusCode).toBe(400);
    expect(res.json().error).toContain("Challenge expired");
  });
});
