import type { FastifyInstance, FastifyRequest, FastifyReply } from "fastify";
import { requireAuth } from "../middleware/requireAuth.js";

interface PatchSettingsBody {
  diary_name?: string;
  timezone?: string;
}

interface ThresholdInput {
  threshold_minutes: number;
  tone: "gentle" | "urgent" | "final";
}

interface PatchThresholdsBody {
  thresholds: ThresholdInput[];
}

const VALID_TONES = new Set(["gentle", "urgent", "final"]);

export default async function settingsRoutes(
  fastify: FastifyInstance
): Promise<void> {
  /**
   * GET /api/settings
   * Returns diary_name and timezone for the authenticated user.
   */
  fastify.get(
    "/api/settings",
    { preHandler: [requireAuth] },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const result = await fastify.pg.query(
        "SELECT diary_name, timezone FROM users WHERE id = $1",
        [request.userId]
      );

      if (result.rows.length === 0) {
        return reply.status(404).send({ error: "User not found" });
      }

      const row = result.rows[0] as { diary_name: string | null; timezone: string };
      return reply.status(200).send({
        diary_name: row.diary_name ?? null,
        timezone: row.timezone,
      });
    }
  );

  /**
   * PATCH /api/settings
   * Update diary_name and/or timezone for the authenticated user.
   * Body: { diary_name?: string, timezone?: string }
   */
  fastify.patch<{ Body: PatchSettingsBody }>(
    "/api/settings",
    { preHandler: [requireAuth] },
    async (
      request: FastifyRequest<{ Body: PatchSettingsBody }>,
      reply: FastifyReply
    ) => {
      const { diary_name, timezone } = request.body;

      if (diary_name !== undefined && diary_name !== null) {
        if (typeof diary_name !== "string" || diary_name.length > 80) {
          return reply
            .status(400)
            .send({ error: "diary_name must be a string of at most 80 characters" });
        }
      }

      if (timezone !== undefined && timezone !== null) {
        if (typeof timezone !== "string" || timezone.trim().length === 0) {
          return reply
            .status(400)
            .send({ error: "timezone must be a non-empty string" });
        }
      }

      // Build dynamic SET clause
      const updates: string[] = [];
      const values: unknown[] = [];
      let paramIndex = 1;

      if (diary_name !== undefined) {
        updates.push(`diary_name = $${paramIndex++}`);
        values.push(diary_name);
      }
      if (timezone !== undefined) {
        updates.push(`timezone = $${paramIndex++}`);
        values.push(timezone);
      }

      if (updates.length === 0) {
        return reply.status(400).send({ error: "No fields to update" });
      }

      updates.push(`updated_at = now()`);
      values.push(request.userId);

      await fastify.pg.query(
        `UPDATE users SET ${updates.join(", ")} WHERE id = $${paramIndex}`,
        values
      );

      return reply.status(200).send({ ok: true });
    }
  );

  /**
   * GET /api/settings/thresholds
   * Returns notification thresholds for the authenticated user.
   */
  fastify.get(
    "/api/settings/thresholds",
    { preHandler: [requireAuth] },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const result = await fastify.pg.query(
        `SELECT id, threshold_minutes, tone
         FROM notification_thresholds
         WHERE user_id = $1
         ORDER BY threshold_minutes DESC`,
        [request.userId]
      );

      return reply.status(200).send(result.rows);
    }
  );

  /**
   * PATCH /api/settings/thresholds
   * Replace all notification thresholds for the authenticated user.
   * Body: { thresholds: Array<{ threshold_minutes: number, tone: 'gentle'|'urgent'|'final' }> }
   */
  fastify.patch<{ Body: PatchThresholdsBody }>(
    "/api/settings/thresholds",
    { preHandler: [requireAuth] },
    async (
      request: FastifyRequest<{ Body: PatchThresholdsBody }>,
      reply: FastifyReply
    ) => {
      const { thresholds } = request.body;

      if (!Array.isArray(thresholds)) {
        return reply.status(400).send({ error: "thresholds must be an array" });
      }
      if (thresholds.length < 1) {
        return reply
          .status(400)
          .send({ error: "At least 1 threshold is required" });
      }
      if (thresholds.length > 10) {
        return reply
          .status(400)
          .send({ error: "Maximum 10 thresholds allowed" });
      }

      for (const t of thresholds) {
        if (
          typeof t.threshold_minutes !== "number" ||
          !Number.isInteger(t.threshold_minutes) ||
          t.threshold_minutes <= 0
        ) {
          return reply.status(400).send({
            error: "Each threshold_minutes must be a positive integer",
          });
        }
        if (!VALID_TONES.has(t.tone)) {
          return reply.status(400).send({
            error: `tone must be one of: gentle, urgent, final`,
          });
        }
      }

      const client = await fastify.pg.connect();
      try {
        await client.query("BEGIN");

        // Delete existing thresholds for user
        await client.query(
          "DELETE FROM notification_thresholds WHERE user_id = $1",
          [request.userId]
        );

        // Insert new thresholds
        for (const t of thresholds) {
          await client.query(
            `INSERT INTO notification_thresholds (user_id, threshold_minutes, tone)
             VALUES ($1, $2, $3)`,
            [request.userId, t.threshold_minutes, t.tone]
          );
        }

        await client.query("COMMIT");
      } catch (err) {
        await client.query("ROLLBACK");
        throw err;
      } finally {
        client.release();
      }

      return reply.status(200).send({ ok: true });
    }
  );
}
