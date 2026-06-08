import crypto from "crypto";
import type { FastifyInstance, FastifyRequest, FastifyReply } from "fastify";
import argon2 from "argon2";
import { requireAuth } from "../middleware/requireAuth.js";

interface PassphraseBody {
  passphrase: string;
}

/**
 * Creates a session for a user: generates token, hashes it, stores in DB,
 * signs JWT, and sets httpOnly cookie.
 */
async function createSession(
  fastify: FastifyInstance,
  reply: FastifyReply,
  userId: string
): Promise<string> {
  // Generate random session token and hash it (never store raw)
  const tokenBytes = crypto.randomBytes(32);
  const tokenHash = crypto
    .createHash("sha256")
    .update(tokenBytes)
    .digest("hex");

  // Insert session with 7-day expiry
  const sessionResult = await fastify.pg.query(
    `INSERT INTO sessions (user_id, token_hash, expires_at)
     VALUES ($1, $2, NOW() + INTERVAL '7 days')
     RETURNING id`,
    [userId, tokenHash]
  );
  const sessionId = sessionResult.rows[0].id;

  // Sign JWT with user and session IDs
  const jwt = fastify.jwt.sign(
    { sub: userId, sid: sessionId },
    { expiresIn: "7d" }
  );

  // Set httpOnly secure cookie
  reply.setCookie("session", jwt, {
    httpOnly: true,
    secure: true,
    sameSite: "strict",
    path: "/",
    maxAge: 7 * 24 * 60 * 60, // 7 days in seconds
  });

  return sessionId;
}

export default async function authRoutes(
  fastify: FastifyInstance
): Promise<void> {
  /**
   * POST /api/auth/register
   * Create single-user account with passphrase.
   */
  fastify.post<{ Body: PassphraseBody }>(
    "/api/auth/register",
    async (request, reply) => {
      const { passphrase } = request.body;

      // Validate passphrase length
      if (!passphrase || passphrase.length < 12) {
        return reply.status(400).send({
          error: "Passphrase must be at least 12 characters",
        });
      }

      // Single-user check: reject if account already exists
      const countResult = await fastify.pg.query(
        "SELECT COUNT(*) FROM users"
      );
      if (parseInt(countResult.rows[0].count, 10) > 0) {
        return reply.status(409).send({
          error: "Account already exists",
        });
      }

      // Hash passphrase with Argon2id
      const passphraseHash = await argon2.hash(passphrase, {
        type: argon2.argon2id,
        memoryCost: 65536,
        timeCost: 3,
        parallelism: 4,
      });

      // Generate HKDF salt for future key derivation
      const hkdfSalt = crypto.randomBytes(32);

      // Insert user
      const userResult = await fastify.pg.query(
        `INSERT INTO users (passphrase_hash, hkdf_salt)
         VALUES ($1, $2)
         RETURNING id`,
        [passphraseHash, hkdfSalt]
      );
      const userId = userResult.rows[0].id;

      // Create session
      await createSession(fastify, reply, userId);

      return reply.status(201).send({
        id: userId,
        hkdfSalt: Buffer.from(hkdfSalt).toString("base64url"),
      });
    }
  );

  /**
   * POST /api/auth/unlock
   * Verify passphrase and issue session for existing user.
   */
  fastify.post<{ Body: PassphraseBody }>(
    "/api/auth/unlock",
    async (request, reply) => {
      const { passphrase } = request.body;

      // Get single user
      const userResult = await fastify.pg.query(
        "SELECT id, passphrase_hash, hkdf_salt FROM users LIMIT 1"
      );

      if (userResult.rows.length === 0) {
        return reply.status(404).send({
          error: "No account found",
        });
      }

      const user = userResult.rows[0];

      // Verify passphrase
      const isValid = await argon2.verify(user.passphrase_hash, passphrase);
      if (!isValid) {
        return reply.status(401).send({
          error: "Invalid passphrase",
        });
      }

      // Create session
      await createSession(fastify, reply, user.id);

      // Return user ID and hkdf_salt as base64url for client key derivation
      const hkdfSaltBase64url = Buffer.from(user.hkdf_salt)
        .toString("base64url");

      return reply.status(200).send({
        id: user.id,
        hkdfSalt: hkdfSaltBase64url,
      });
    }
  );

  /**
   * GET /api/auth/me
   * Returns current user info. Protected by requireAuth.
   */
  fastify.get(
    "/api/auth/me",
    { preHandler: [requireAuth] },
    async (request) => {
      return { id: request.userId };
    }
  );

  /**
   * DELETE /api/auth/session
   * Logout: delete session from DB and clear cookie.
   */
  fastify.delete(
    "/api/auth/session",
    { preHandler: [requireAuth] },
    async (request, reply) => {
      // Extract session ID from JWT
      const decoded = await request.jwtVerify<{ sub: string; sid: string }>();

      // Delete session from DB
      await fastify.pg.query(
        "DELETE FROM sessions WHERE id = $1 AND user_id = $2",
        [decoded.sid, decoded.sub]
      );

      // Clear cookie
      reply.setCookie("session", "", {
        httpOnly: true,
        secure: true,
        sameSite: "strict",
        path: "/",
        maxAge: 0,
      });

      return reply.status(200).send({ ok: true });
    }
  );
}
