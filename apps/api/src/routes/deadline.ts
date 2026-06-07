import type { FastifyInstance, FastifyRequest, FastifyReply } from "fastify";
import { requireAuth } from "../middleware/requireAuth.js";
import { computeDeadlineUTC } from "../lib/deadline-engine.js";
import { DateTime } from "luxon";

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
          { minutes: 24 * 60, tone: "gentle" },
          { minutes: 4 * 60,  tone: "urgent" },
          { minutes: 1 * 60,  tone: "urgent" },
          { minutes: 15,      tone: "final"  },
        ];

        for (const t of thresholds) {
          await fastify.pg.query(
            `INSERT INTO notification_thresholds (user_id, threshold_minutes, tone)
             VALUES ($1, $2, $3) ON CONFLICT DO NOTHING`,
            [userId, t.minutes, t.tone]
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

      // Handle each axis independently — stronger applies immediately, weaker goes pending
      if (windowStrengthening || wordMinimumStrengthening) {
        // Immediate update for strengthening axes
        const immediateWindowHours = windowStrengthening ? newWindowHours : current.window_hours;
        const immediateWordMinimum = wordMinimumStrengthening ? newWordMinimum : current.word_minimum;
        await fastify.pg.query(
          `UPDATE deadline_state
           SET window_hours = $1, word_minimum = $2, updated_at = now()
           WHERE user_id = $3`,
          [immediateWindowHours, immediateWordMinimum, userId]
        );
      }

      if (windowWeakening || wordMinimumWeakening) {
        // Weakening: set pending_* with 7-day delay
        const pendingEffectiveAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);
        const pendingWindowHours = windowWeakening ? newWindowHours : null;
        const pendingWordMinimum = wordMinimumWeakening ? newWordMinimum : null;
        await fastify.pg.query(
          `UPDATE deadline_state
           SET pending_window_hours = $1, pending_word_minimum = $2,
               pending_effective_at = $3, updated_at = now()
           WHERE user_id = $4`,
          [pendingWindowHours, pendingWordMinimum, pendingEffectiveAt, userId]
        );
      }

      if (!windowStrengthening && !wordMinimumStrengthening && !windowWeakening && !wordMinimumWeakening) {
        // No change — write immediately as a no-op
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
   * POST /api/deadline/grace
   * Invokes a grace day: extends deadline_at by 24 hours.
   * Uses SELECT ... FOR UPDATE to prevent race with the poller (DMS-07).
   * Grace budget is weekly (resets after 7 days from last use).
   * Returns 409 if state != 'active'.
   * Returns 429 if budget exhausted for this week.
   */
  fastify.post(
    "/api/deadline/grace",
    { preHandler: [requireAuth] },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const userId = request.userId;

      const client = await fastify.pg.connect();
      try {
        await client.query("BEGIN");

        // Lock the deadline_state row
        const dsResult = await client.query(
          `SELECT state, deadline_at, grace_budget, grace_used_at
           FROM deadline_state WHERE user_id = $1 FOR UPDATE`,
          [userId]
        );

        if (dsResult.rows.length === 0) {
          await client.query("ROLLBACK");
          return reply.status(404).send({ error: "Deadline not configured" });
        }

        const ds = dsResult.rows[0] as {
          state: string;
          deadline_at: Date;
          grace_budget: number;
          grace_used_at: Date | null;
        };

        if (ds.state !== "active") {
          await client.query("ROLLBACK");
          return reply.status(409).send({ error: "Cannot invoke grace day on inactive deadline", state: ds.state });
        }

        // Compute effective budget with 7-day reset
        const now = DateTime.utc();
        const lastGrace = ds.grace_used_at
          ? DateTime.fromJSDate(ds.grace_used_at, { zone: "utc" })
          : null;
        const budgetReset = !lastGrace || now.diff(lastGrace, "days").days >= 7;
        const effectiveBudget = budgetReset ? 1 : ds.grace_budget;

        if (effectiveBudget < 1) {
          await client.query("ROLLBACK");
          return reply.status(429).send({ error: "Grace budget exhausted for this week" });
        }

        // Extend deadline by 24h, record grace use
        await client.query(
          `UPDATE deadline_state
           SET deadline_at = deadline_at + INTERVAL '24 hours',
               grace_used_at = now(),
               grace_budget = 0,
               updated_at = now()
           WHERE user_id = $1`,
          [userId]
        );

        // Compute new deadline for response
        const newDeadlineAt = new Date(ds.deadline_at.getTime() + 24 * 60 * 60 * 1000);

        await client.query("COMMIT");

        return reply.status(200).send({
          new_deadline_at: newDeadlineAt,
          grace_budget: 0,
          message: "Grace day applied. Deadline extended by 24 hours.",
        });
      } catch (err) {
        await client.query("ROLLBACK");
        throw err;
      } finally {
        client.release();
      }
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
