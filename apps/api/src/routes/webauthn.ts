import crypto from "crypto";
import type { FastifyInstance, FastifyRequest, FastifyReply } from "fastify";
import {
  generateRegistrationOptions,
  verifyRegistrationResponse,
  generateAuthenticationOptions,
  verifyAuthenticationResponse,
} from "@simplewebauthn/server";
import { requireAuth } from "../middleware/requireAuth.js";

interface RegisterVerifyBody {
  attestation: Record<string, unknown>;
  prfEnabled: boolean;
}

interface AuthVerifyBody {
  response: Record<string, unknown> & { id: string };
}

const RP_ID = process.env.WEBAUTHN_RP_ID || "localhost";
const RP_NAME = "Dead Letter Diary";
const CHALLENGE_TTL = 60; // seconds

export default async function webauthnRoutes(
  fastify: FastifyInstance
): Promise<void> {
  /**
   * POST /api/webauthn/register-options
   * Generate WebAuthn registration options. Requires authenticated session.
   */
  fastify.post(
    "/api/webauthn/register-options",
    { preHandler: [requireAuth] },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const userId = request.userId;

      // Get existing credentials to exclude
      const existingCreds = await fastify.pg.query(
        "SELECT id, transports FROM webauthn_credentials WHERE user_id = $1",
        [userId]
      );

      const options = await generateRegistrationOptions({
        rpName: RP_NAME,
        rpID: RP_ID,
        userName: userId,
        attestationType: "none",
        excludeCredentials: existingCreds.rows.map((c) => ({
          id: c.id,
          transports: c.transports,
        })),
        authenticatorSelection: {
          residentKey: "required",
          userVerification: "required",
          authenticatorAttachment: "platform",
        },
      });

      // Store challenge in Redis with 60s TTL
      await fastify.redis.set(
        `webauthn:challenge:${userId}`,
        options.challenge,
        "EX",
        CHALLENGE_TTL
      );

      return reply.send(options);
    }
  );

  /**
   * POST /api/webauthn/register-verify
   * Verify WebAuthn registration attestation. Requires authenticated session.
   */
  fastify.post<{ Body: RegisterVerifyBody }>(
    "/api/webauthn/register-verify",
    { preHandler: [requireAuth] },
    async (request, reply) => {
      const userId = request.userId;

      // Get and delete challenge (single-use)
      const storedChallenge = await fastify.redis.get(
        `webauthn:challenge:${userId}`
      );
      await fastify.redis.del(`webauthn:challenge:${userId}`);

      if (!storedChallenge) {
        return reply
          .status(400)
          .send({ error: "Challenge expired or already used" });
      }

      const expectedOrigin = RP_ID === "localhost"
        ? "http://localhost"
        : `https://${RP_ID}`;

      const verification = await verifyRegistrationResponse({
        response: request.body.attestation as unknown as Parameters<typeof verifyRegistrationResponse>[0]["response"],
        expectedChallenge: storedChallenge,
        expectedOrigin,
        expectedRPID: RP_ID,
      });

      if (!verification.verified || !verification.registrationInfo) {
        return reply
          .status(400)
          .send({ error: "Registration verification failed" });
      }

      const { credential } = verification.registrationInfo;
      const prfCapable = request.body.prfEnabled === true;

      // Store credential
      await fastify.pg.query(
        `INSERT INTO webauthn_credentials (id, user_id, public_key, counter, transports, prf_capable)
         VALUES ($1, $2, $3, $4, $5, $6)`,
        [
          credential.id,
          userId,
          Buffer.from(credential.publicKey),
          credential.counter,
          request.body.attestation.transports ?? [],
          prfCapable,
        ]
      );

      return reply.status(201).send({
        credentialId: credential.id,
        prfCapable,
      });
    }
  );

  /**
   * POST /api/webauthn/auth-options
   * Generate WebAuthn authentication options. Public (no auth required).
   */
  fastify.post(
    "/api/webauthn/auth-options",
    async (_request: FastifyRequest, reply: FastifyReply) => {
      // Get single user
      const userResult = await fastify.pg.query(
        "SELECT id, hkdf_salt FROM users LIMIT 1"
      );
      if (userResult.rows.length === 0) {
        return reply.status(404).send({ error: "No account found" });
      }
      const user = userResult.rows[0];

      // Get stored credentials
      const credResult = await fastify.pg.query(
        "SELECT id, transports FROM webauthn_credentials WHERE user_id = $1",
        [user.id]
      );
      if (credResult.rows.length === 0) {
        return reply
          .status(404)
          .send({ error: "No credentials registered" });
      }

      const options = await generateAuthenticationOptions({
        rpID: RP_ID,
        allowCredentials: credResult.rows.map((c) => ({
          id: c.id,
          transports: c.transports,
        })),
        userVerification: "required",
      });

      // Store challenge in Redis
      await fastify.redis.set(
        `webauthn:challenge:auth:${user.id}`,
        options.challenge,
        "EX",
        CHALLENGE_TTL
      );

      // Return options + hkdf_salt for PRF eval
      const hkdfSalt = Buffer.from(user.hkdf_salt).toString("base64url");

      return reply.send({ ...options, hkdfSalt });
    }
  );

  /**
   * POST /api/webauthn/auth-verify
   * Verify WebAuthn authentication assertion. Public (no auth required).
   */
  fastify.post<{ Body: AuthVerifyBody }>(
    "/api/webauthn/auth-verify",
    async (request, reply) => {
      // Get single user
      const userResult = await fastify.pg.query(
        "SELECT id, hkdf_salt FROM users LIMIT 1"
      );
      if (userResult.rows.length === 0) {
        return reply.status(404).send({ error: "No account found" });
      }
      const user = userResult.rows[0];

      // Get and delete challenge (single-use)
      const storedChallenge = await fastify.redis.get(
        `webauthn:challenge:auth:${user.id}`
      );
      await fastify.redis.del(`webauthn:challenge:auth:${user.id}`);

      if (!storedChallenge) {
        return reply
          .status(400)
          .send({ error: "Challenge expired or already used" });
      }

      // Find credential
      const credResult = await fastify.pg.query(
        `SELECT id, public_key, counter, transports
         FROM webauthn_credentials
         WHERE id = $1 AND user_id = $2`,
        [request.body.response.id, user.id]
      );
      if (credResult.rows.length === 0) {
        return reply.status(404).send({ error: "Credential not found" });
      }
      const cred = credResult.rows[0];

      const expectedOrigin = RP_ID === "localhost"
        ? "http://localhost"
        : `https://${RP_ID}`;

      const verification = await verifyAuthenticationResponse({
        response: request.body.response as unknown as Parameters<typeof verifyAuthenticationResponse>[0]["response"],
        expectedChallenge: storedChallenge,
        expectedOrigin,
        expectedRPID: RP_ID,
        credential: {
          id: cred.id,
          publicKey: cred.public_key,
          counter: Number(cred.counter),
          transports: cred.transports,
        },
      });

      if (!verification.verified) {
        return reply
          .status(400)
          .send({ error: "Authentication verification failed" });
      }

      // AUTH-07: Reject if biometric confirmation not provided
      if (!verification.authenticationInfo.userVerified) {
        return reply
          .status(403)
          .send({ error: "Biometric confirmation required (UV flag not set)" });
      }

      // Update counter
      await fastify.pg.query(
        "UPDATE webauthn_credentials SET counter = $1 WHERE id = $2",
        [verification.authenticationInfo.newCounter, cred.id]
      );

      // Create session (same pattern as auth.ts)
      const tokenBytes = crypto.randomBytes(32);
      const tokenHash = crypto
        .createHash("sha256")
        .update(tokenBytes)
        .digest("hex");

      const sessionResult = await fastify.pg.query(
        `INSERT INTO sessions (user_id, token_hash, expires_at)
         VALUES ($1, $2, NOW() + INTERVAL '7 days')
         RETURNING id`,
        [user.id, tokenHash]
      );
      const sessionId = sessionResult.rows[0].id;

      const jwt = fastify.jwt.sign(
        { sub: user.id, sid: sessionId },
        { expiresIn: "7d" }
      );

      reply.setCookie("session", jwt, {
        httpOnly: true,
        secure: true,
        sameSite: "strict",
        path: "/",
        maxAge: 7 * 24 * 60 * 60,
      });

      return reply.status(200).send({ id: user.id });
    }
  );
}
