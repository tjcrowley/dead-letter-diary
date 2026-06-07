import { DateTime } from "luxon";
import type { Pool, PoolClient } from "pg";
import type { FastifyBaseLogger } from "fastify";

/**
 * Compute a deadline timestamp in UTC from the user's IANA timezone.
 * Uses Luxon so DST transitions don't shift the deadline by 1h.
 */
export function computeDeadlineUTC(windowHours: number, ianaTimezone: string): Date {
  return DateTime.now()
    .setZone(ianaTimezone)
    .plus({ hours: windowHours })
    .toUTC()
    .toJSDate();
}

/**
 * Initiate a wipe for a user: insert wipe_log row and set state='pending_wipe'.
 * Idempotent — no-op if state is already 'pending_wipe' or 'wiped'.
 * Uses FOR UPDATE lock to prevent race with check-in route.
 */
export async function initiateWipe(client: PoolClient, userId: string): Promise<void> {
  await client.query("BEGIN");
  try {
    const result = await client.query(
      "SELECT state FROM deadline_state WHERE user_id = $1 FOR UPDATE",
      [userId]
    );

    if (result.rows.length === 0) {
      await client.query("ROLLBACK");
      return;
    }

    const { state } = result.rows[0] as { state: string };
    if (state !== "active") {
      // Already pending_wipe or wiped — idempotent no-op
      await client.query("ROLLBACK");
      return;
    }

    await client.query(
      `INSERT INTO wipe_log (user_id, reason, initiated_at)
       VALUES ($1, 'deadline', now())`,
      [userId]
    );

    await client.query(
      `UPDATE deadline_state
       SET state = 'pending_wipe', updated_at = now()
       WHERE user_id = $1`,
      [userId]
    );

    await client.query("COMMIT");
  } catch (err) {
    await client.query("ROLLBACK");
    throw err;
  }
}

/**
 * Confirm a wipe: set shard_deleted=true, delete the server shard, set state='wiped'.
 * Two-phase: wipe_log.shard_deleted is set BEFORE DELETE — crash-safe (DMS-08).
 * Only runs if wipe_log.initiated_at is at least 60s old (settle window).
 */
export async function confirmWipe(client: PoolClient, userId: string): Promise<void> {
  await client.query("BEGIN");
  try {
    const dsResult = await client.query(
      "SELECT state FROM deadline_state WHERE user_id = $1 FOR UPDATE",
      [userId]
    );

    if (dsResult.rows.length === 0) {
      await client.query("COMMIT");
      return;
    }

    const { state } = dsResult.rows[0] as { state: string };
    if (state !== "pending_wipe") {
      await client.query("COMMIT");
      return;
    }

    // Find the most recent unconfirmed wipe_log entry
    const logResult = await client.query(
      `SELECT id, initiated_at FROM wipe_log
       WHERE user_id = $1 AND confirmed_at IS NULL
       ORDER BY initiated_at DESC LIMIT 1`,
      [userId]
    );

    if (logResult.rows.length === 0) {
      await client.query("COMMIT");
      return;
    }

    const { id: wipeLogId, initiated_at: initiatedAt } = logResult.rows[0] as {
      id: string;
      initiated_at: Date;
    };

    const ageMs = Date.now() - new Date(initiatedAt).getTime();
    if (ageMs < 60_000) {
      // Settle window not elapsed — no-op
      await client.query("COMMIT");
      return;
    }

    // Two-phase wipe: mark shard_deleted BEFORE deleting (crash safety)
    await client.query(
      `UPDATE wipe_log
       SET shard_deleted = true, confirmed_at = now()
       WHERE id = $1`,
      [wipeLogId]
    );

    await client.query("DELETE FROM server_shards WHERE user_id = $1", [userId]);

    await client.query(
      `UPDATE deadline_state
       SET state = 'wiped', updated_at = now()
       WHERE user_id = $1`,
      [userId]
    );

    await client.query("COMMIT");
  } catch (err) {
    await client.query("ROLLBACK");
    throw err;
  }
}

/**
 * Main poller function. Called every 60s by the deadline-poller plugin.
 * Transitions overdue active rows → pending_wipe, and settled pending_wipe rows → wiped.
 * Also promotes Akrasia pending setting changes and stubs notification threshold logic.
 */
export async function checkDeadlines(pool: Pool, log: FastifyBaseLogger): Promise<void> {
  try {
    // 1. Transition active rows past deadline → pending_wipe
    const overdueActive = await pool.query(
      `SELECT user_id FROM deadline_state
       WHERE state = 'active' AND deadline_at <= now()`
    );

    for (const row of overdueActive.rows) {
      const { user_id: userId } = row as { user_id: string };
      const client = await pool.connect();
      try {
        await initiateWipe(client, userId);
        log.info({ userId }, "deadline-engine: initiated wipe for overdue user");
      } catch (err) {
        log.error({ userId, err }, "deadline-engine: error initiating wipe");
      } finally {
        client.release();
      }
    }

    // 2. Transition pending_wipe rows past settle window → wiped
    const pendingWipe = await pool.query(
      `SELECT ds.user_id FROM deadline_state ds
       JOIN wipe_log wl ON wl.user_id = ds.user_id AND wl.confirmed_at IS NULL
       WHERE ds.state = 'pending_wipe'
         AND wl.initiated_at <= now() - INTERVAL '60 seconds'`
    );

    for (const row of pendingWipe.rows) {
      const { user_id: userId } = row as { user_id: string };
      const client = await pool.connect();
      try {
        await confirmWipe(client, userId);
        log.info({ userId }, "deadline-engine: confirmed wipe for settled pending_wipe user");
      } catch (err) {
        log.error({ userId, err }, "deadline-engine: error confirming wipe");
      } finally {
        client.release();
      }
    }

    // 3. Promote Akrasia pending setting changes where pending_effective_at <= now
    const akrasiaRows = await pool.query(
      `SELECT user_id, pending_window_hours, pending_word_minimum
       FROM deadline_state
       WHERE pending_effective_at IS NOT NULL AND pending_effective_at <= now()`
    );

    for (const row of akrasiaRows.rows) {
      const { user_id: userId, pending_window_hours, pending_word_minimum } = row as {
        user_id: string;
        pending_window_hours: number;
        pending_word_minimum: number;
      };
      try {
        await pool.query(
          `UPDATE deadline_state
           SET window_hours = $1, word_minimum = $2,
               pending_window_hours = NULL, pending_word_minimum = NULL,
               pending_effective_at = NULL, updated_at = now()
           WHERE user_id = $3`,
          [pending_window_hours, pending_word_minimum, userId]
        );
        log.info({ userId }, "deadline-engine: promoted Akrasia pending changes");
      } catch (err) {
        log.error({ userId, err }, "deadline-engine: error promoting Akrasia fields");
      }
    }

    // 4. Stub notification threshold logic — Plan 02 wires the real sender
    log.info("deadline-engine: notification threshold check (stub — Plan 02 implementation)");
  } catch (err) {
    log.error({ err }, "deadline-engine: unhandled error in checkDeadlines");
    throw err;
  }
}
