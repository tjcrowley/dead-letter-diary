import crypto from "node:crypto";
import type { FastifyInstance, FastifyRequest, FastifyReply } from "fastify";
import { requireAuth } from "../middleware/requireAuth.js";

interface ShardBody {
  shard: string; // base64url encoded
}

interface KeyWrapBody {
  wrappedDmk: string; // base64url encoded
  wrapIv: string; // base64url encoded
  wrapType: "webauthn_prf" | "passphrase";
  credentialId?: string;
}

/**
 * Encrypt a shard at rest using AES-256-GCM with SHARD_ENCRYPTION_KEY.
 * Output format: iv(12) + authTag(16) + ciphertext
 */
function encryptShard(shardBuf: Buffer): Buffer {
  const key = Buffer.from(process.env.SHARD_ENCRYPTION_KEY!, "hex");
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv("aes-256-gcm", key, iv);
  const ciphertext = Buffer.concat([cipher.update(shardBuf), cipher.final()]);
  const authTag = cipher.getAuthTag();
  return Buffer.concat([iv, authTag, ciphertext]);
}

/**
 * Decrypt a shard at rest. Input format: iv(12) + authTag(16) + ciphertext
 */
function decryptShard(encryptedBuf: Buffer): Buffer {
  const key = Buffer.from(process.env.SHARD_ENCRYPTION_KEY!, "hex");
  const iv = encryptedBuf.subarray(0, 12);
  const authTag = encryptedBuf.subarray(12, 28);
  const ciphertext = encryptedBuf.subarray(28);
  const decipher = crypto.createDecipheriv("aes-256-gcm", key, iv);
  decipher.setAuthTag(authTag);
  return Buffer.concat([decipher.update(ciphertext), decipher.final()]);
}

export default async function cryptoRoutes(
  fastify: FastifyInstance
): Promise<void> {
  /**
   * GET /api/crypto/shard
   * Returns the user's decrypted server shard as base64url.
   * Also returns hkdfSalt for client-side key derivation.
   */
  // TODO: Phase 5 will add deadline_state.state === 'active' check (good standing gate)
  fastify.get(
    "/api/crypto/shard",
    { preHandler: [requireAuth] },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const shardResult = await fastify.pg.query(
        "SELECT shard FROM server_shards WHERE user_id = $1",
        [request.userId]
      );

      if (shardResult.rows.length === 0) {
        return reply.status(404).send({ error: "No shard found" });
      }

      const encryptedShard = shardResult.rows[0].shard as Buffer;
      const decryptedShard = decryptShard(encryptedShard);

      // Get HKDF salt from users table
      const userResult = await fastify.pg.query(
        "SELECT hkdf_salt FROM users WHERE id = $1",
        [request.userId]
      );

      const hkdfSalt = userResult.rows[0].hkdf_salt as Buffer;

      return reply.status(200).send({
        shard: decryptedShard.toString("base64url"),
        hkdfSalt: hkdfSalt.toString("base64url"),
      });
    }
  );

  /**
   * POST /api/crypto/shard
   * Stores a new server shard, encrypted at rest.
   * Used during key ceremony at account creation.
   */
  fastify.post<{ Body: ShardBody }>(
    "/api/crypto/shard",
    { preHandler: [requireAuth] },
    async (request: FastifyRequest<{ Body: ShardBody }>, reply: FastifyReply) => {
      const { shard } = request.body;
      const shardBuf = Buffer.from(shard, "base64url");

      const existing = await fastify.pg.query(
        "SELECT shard FROM server_shards WHERE user_id = $1",
        [request.userId]
      );

      if (existing.rows.length > 0) {
        const existingDecrypted = decryptShard(existing.rows[0].shard as Buffer);
        if (
          shardBuf.length === existingDecrypted.length &&
          crypto.timingSafeEqual(shardBuf, existingDecrypted)
        ) {
          return reply.status(200).send({ ok: true, existing: true });
        }
        return reply.status(409).send({ error: "Shard already exists for this user" });
      }

      const encryptedShard = encryptShard(shardBuf);
      await fastify.pg.query(
        "INSERT INTO server_shards (user_id, shard) VALUES ($1, $2) RETURNING id",
        [request.userId, encryptedShard]
      );

      return reply.status(201).send({ ok: true });
    }
  );

  /**
   * POST /api/crypto/key-wrap
   * Stores a wrapped DMK + wrap IV + wrap_type.
   * Multiple wraps per user (one per auth method).
   */
  fastify.post<{ Body: KeyWrapBody }>(
    "/api/crypto/key-wrap",
    { preHandler: [requireAuth] },
    async (request: FastifyRequest<{ Body: KeyWrapBody }>, reply: FastifyReply) => {
      const { wrappedDmk, wrapIv, wrapType, credentialId } = request.body;

      const wrappedDmkBuf = Buffer.from(wrappedDmk, "base64url");
      const wrapIvBuf = Buffer.from(wrapIv, "base64url");

      await fastify.pg.query(
        `INSERT INTO key_wraps (user_id, wrapped_dmk, wrap_iv, wrap_type, credential_id)
         VALUES ($1, $2, $3, $4, $5) RETURNING id`,
        [request.userId, wrappedDmkBuf, wrapIvBuf, wrapType, credentialId ?? null]
      );

      return reply.status(201).send({ ok: true });
    }
  );

  /**
   * GET /api/crypto/key-wrap
   * Returns all key wraps for the authenticated user.
   */
  fastify.get(
    "/api/crypto/key-wrap",
    { preHandler: [requireAuth] },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const result = await fastify.pg.query(
        "SELECT wrapped_dmk, wrap_iv, wrap_type, credential_id FROM key_wraps WHERE user_id = $1",
        [request.userId]
      );

      const wraps = result.rows.map((row) => ({
        wrappedDmk: (row.wrapped_dmk as Buffer).toString("base64url"),
        wrapIv: (row.wrap_iv as Buffer).toString("base64url"),
        wrapType: row.wrap_type as string,
        credentialId: (row.credential_id as string | null) ?? null,
      }));

      return reply.status(200).send({ wraps });
    }
  );
}
