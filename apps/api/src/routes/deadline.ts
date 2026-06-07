import type { FastifyInstance, FastifyRequest, FastifyReply } from "fastify";
import { requireAuth } from "../middleware/requireAuth.js";
import { computeDeadlineUTC } from "../lib/deadline-engine.js";

interface DeadlineSettingsBody {
  window_hours?: number;
  word_minimum?: number;
  timezone?: string;
}

interface CheckinBody {
  entryId?: string;
}

export default async function deadlineRoutes(fastify: FastifyInstance): Promise<void> {
  /**
   * GET /api/deadline
   * Returns current deadline_state for the authenticated user.
   * 404 if no row exists (not yet configured).
   */
  fastify.get(
    "/api/deadline",
    { preHandler: [requireAuth] },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const result = await fastify.pg.query(
        `SELECT state, deadline_at, window_hours, word_minimum, grace_budget,
                grace_used_at, pending_window_hours, pending_word_minimum, pending_effective_at
         FROM deadline_state WHERE user_id = $1`,
        [request.userId]
      );

      if (result.rows.length === 0) {
        return reply.status(404).send({ error: "Deadline not configured" });
      }

      return reply.status(200).send(result.rows[0]);
    }
  );

  /**
   * POST /api/deadline/settings
   * Update deadline settings with Akrasia protection:
   * - Strengthening (higher word_minimum or shorter window_hours): immediate effect
   * - Weakening (lower word_minimum or longer window_hours): 7-day delay via pending_* columns
   * Creates a new deadline_state row with defaults if none exists.
   * Seeds notification_thresholds with defaults on first write.
   */
  fastify.post<{ Body: DeadlineSettingsBody }>(
    "/api/deadline/settings",
    { preHandler: [requireAuth] },
    async (
      request: FastifyRequest<{ Body: DeadlineSettingsBody }>,
      reply: FastifyReply
    ) => {
      const userId = request.userId;
      const { window_hours, word_minimum, timezone } = request.body;

      // Check for existing row
      const existing = await fastify.pg.query(
        "SELECT state, window_hours, word_minimum, deadline_at FROM deadline_state WHERE user_id = $1",
        [userId]
      );

      if (existing.rows.length === 0) {
        // No row — create with defaults
        // Get user timezone for deadline computation
        let tz = timezone ?? "UTC";
        if (!timezone) {
          const userResult = await fastify.pg.query(
            "SELECT timezone FROM users WHERE id = $1",
            [userId]
          );
          if (userResult.rows.length > 0) {
            tz = (userResult.rows[0] as { timezone: string }).timezone || "UTC";
          }
        }

        const initialWindowHours = window_hours ?? 24;
        const initialWordMinimum = word_minimum ?? 50;
        const deadlineAt = computeDeadlineUTC(initialWindowHours, tz);

        await fastify.pg.query(
          `INSERT INTO deadline_state (user_id, state, window_hours, word_minimum, deadline_at)
           VALUES ($1, 'active', $2, $3, $4)`,
          [userId, initialWindowHours, initialWordMinimum, deadlineAt]
        );

        // Seed default notification thresholds (ON CONFLICT DO NOTHING)
        const thresholds = [
          { hours: 24, label: "24h", urgency: "gentle" },
          { hours: 4, label: "4h", urgency: "urgent" },
          { hours: 1, label: "1h", urgency: "urgent" },
          { hours: 0.25, label: "15min", urgency: "final" },
        ];

        for (const t of thresholds) {
          await fastify.pg.query(
            `INSERT INTO notification_thresholds (user_id, hours_before, label, urgency)
             VALUES ($1, $2, $3, $4) ON CONFLICT DO NOTHING`,
            [userId, t.hours, t.label, t.urgency]
          );
        }

        return reply.status(200).send({ ok: true, created: true });
      }

      // Existing row — apply Akrasia logic
      const current = existing.rows[0] as {
        state: string;
        window_hours: number;
        word_minimum: number;
        deadline_at: Date;
      };

      const newWindowHours = window_hours ?? current.window_hours;
      const newWordMinimum = word_minimum ?? current.word_minimum;

      // Strengthening = shorter window OR higher word minimum
      const windowStrengthening = newWindowHours < current.window_hours;
      const wordMinimumStrengthening = newWordMinimum > current.word_minimum;
      const windowWeakening = newWindowHours > current.window_hours;
      const wordMinimumWeakening = newWordMinimum < current.word_minimum;

      if (windowWeakening || wordMinimumWeakening) {
        // Weakening: set pending_* with 7-day delay
        const pendingEffectiveAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);
        await fastify.pg.query(
          `UPDATE deadline_state
           SET pending_window_hours = $1, pending_word_minimum = $2,
               pending_effective_at = $3, updated_at = now()
           WHERE user_id = $4`,
          [newWindowHours, newWordMinimum, pendingEffectiveAt, userId]
        );
      } else {
        // Strengthening or no change: write immediately
        await fastify.pg.query(
          `UPDATE deadline_state
           SET window_hours = $1, word_minimum = $2, updated_at = now()
           WHERE user_id = $3`,
          [newWindowHours, newWordMinimum, userId]
        );
      }

      return reply.status(200).send({ ok: true });
    }
  );

  /**
   * POST /api/deadline/checkin
   * Validates the user's entry meets word_minimum and resets deadline_at.
   * Uses SELECT ... FOR UPDATE to prevent race with the poller.
   * Returns 409 if state != 'active'.
   */
  fastify.post<{ Body: CheckinBody }>(
    "/api/deadline/checkin",
    { preHandler: [requireAuth] },
    async (
      request: FastifyRequest<{ Body: CheckinBody }>,
      reply: FastifyReply
    ) => {
      const userId = request.userId;
      const { entryId } = request.body;

      // Use a transaction with FOR UPDATE to prevent race with poller
      const client = await fastify.pg.connect();
      try {
        await client.query("BEGIN");

        // Lock the deadline_state row
        const dsResult = await client.query(
          `SELECT state, window_hours, word_minimum, deadline_at
           FROM deadline_state WHERE user_id = $1 FOR UPDATE`,
          [userId]
        );

        if (dsResult.rows.length === 0) {
          await client.query("ROLLBACK");
          return reply.status(404).send({ error: "Deadline not configured" });
        }

        const ds = dsResult.rows[0] as {
          state: string;
          window_hours: number;
          word_minimum: number;
          deadline_at: Date;
        };

        if (ds.state !== "active") {
          await client.query("ROLLBACK");
          return reply.status(409).send({ error: "Deadline is not active", state: ds.state });
        }

        // Validate entry meets word minimum
        if (entryId) {
          const entryResult = await client.query(
            "SELECT id, word_count FROM entries WHERE id = $1 AND user_id = $2",
            [entryId, userId]
          );

          if (entryResult.rows.length === 0) {
            await client.query("ROLLBACK");
            return reply.status(404).send({ error: "Entry not found" });
          }

          const entry = entryResult.rows[0] as { id: string; word_count: number };
          if (entry.word_count < ds.word_minimum) {
            await client.query("ROLLBACK");
            return reply.status(400).send({
              error: `Entry does not meet word minimum`,
              required: ds.word_minimum,
              actual: entry.word_count,
            });
          }
        }

        // Reset deadline_at
        const userResult = await client.query(
          "SELECT timezone FROM users WHERE id = $1",
          [userId]
        );
        const tz = (userResult.rows[0] as { timezone: string } | undefined)?.timezone ?? "UTC";
        const newDeadlineAt = computeDeadlineUTC(ds.window_hours, tz);

        await client.query(
          `UPDATE deadline_state SET deadline_at = $1, updated_at = now() WHERE user_id = $2`,
          [newDeadlineAt, userId]
        );

        await client.query("COMMIT");

        return reply.status(200).send({ ok: true, deadline_at: newDeadlineAt });
      } catch (err) {
        await client.query("ROLLBACK");
        throw err;
      } finally {
        client.release();
      }
    }
  );
}
