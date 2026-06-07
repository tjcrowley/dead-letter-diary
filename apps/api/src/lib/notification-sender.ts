import webpush from "web-push";
import type { WebPushError } from "web-push";
import type { Pool } from "pg";
import type { FastifyBaseLogger } from "fastify";

export type NotificationTone = "gentle" | "urgent" | "final";

export interface PushSubscriptionData {
  endpoint: string;
  expirationTime?: number | null;
  keys: {
    p256dh: string;
    auth: string;
  };
}

/**
 * Call once at server startup (from deadline-poller plugin's onReady hook).
 * Configures web-push with VAPID credentials from environment variables.
 * No-op if VAPID_PUBLIC_KEY or VAPID_PRIVATE_KEY are not set (e.g., in test/dev environments
 * before keys are generated).
 */
export function initVapid(): void {
  const contact = process.env.VAPID_CONTACT_EMAIL ?? "admin@localhost";
  const publicKey = process.env.VAPID_PUBLIC_KEY ?? "";
  const privateKey = process.env.VAPID_PRIVATE_KEY ?? "";

  if (!publicKey || !privateKey) {
    // Keys not yet generated (first run or test environment) — skip VAPID setup
    return;
  }

  webpush.setVapidDetails(`mailto:${contact}`, publicKey, privateKey);
}

/**
 * Build the notification body text based on tone and minutes remaining.
 * Exported for testability.
 */
export function formatWarningBody(minutesRemaining: number, tone: NotificationTone): string {
  if (tone === "gentle") {
    if (minutesRemaining >= 60) {
      const hours = Math.round(minutesRemaining / 60);
      return `Your diary is waiting. ${hours} hours remaining.`;
    }
    return `Your diary is waiting. ${minutesRemaining} minutes remaining.`;
  }

  if (tone === "urgent") {
    return `Write now. ${minutesRemaining} minutes remaining.`;
  }

  // final
  return "Last chance — write now or your diary is destroyed.";
}

/**
 * Send a Web Push notification for a deadline warning.
 * Uses urgency 'normal' for gentle tone; 'high' for urgent/final (NOTIF-06).
 * TTL is set to minutesRemaining * 60 seconds.
 * Throws WebPushError on send failure — caller handles 410/404 for stale subscription cleanup.
 */
export async function sendDeadlineWarning(
  subscription: PushSubscriptionData,
  minutesRemaining: number,
  tone: NotificationTone
): Promise<void> {
  const urgency = tone === "gentle" ? "normal" : "high";
  const TTL = minutesRemaining * 60;

  const title = "Dead Letter Diary";
  const body = formatWarningBody(minutesRemaining, tone);

  const payload = JSON.stringify({
    title,
    body,
    data: {
      type: "deadline-warning",
      minutesRemaining,
    },
  });

  await webpush.sendNotification(
    subscription as webpush.PushSubscription,
    payload,
    { urgency, TTL }
  );
}

/**
 * Send a Web Push notification when the user's diary has been permanently wiped.
 * Fetches the user's push subscription from the notifications table.
 * Non-fatal: push failures are logged as warn (wipe is already complete regardless).
 * Always deletes the subscription row after the attempt — it is no longer needed.
 *
 * @param pool  - pg Pool for DB access
 * @param userId - UUID of the wiped user
 * @param log   - Fastify logger
 */
export async function sendWipeNotification(
  pool: Pool,
  userId: string,
  log: FastifyBaseLogger
): Promise<void> {
  // 1. Fetch subscription
  const result = await pool.query(
    "SELECT subscription FROM notifications WHERE user_id = $1 LIMIT 1",
    [userId]
  );

  if (result.rows.length === 0) {
    // No subscription — nothing to send
    return;
  }

  const subscription = (result.rows[0] as { subscription: unknown }).subscription;

  // 2. Build wipe payload
  const payload = JSON.stringify({
    type: "wipe",
    title: "Dead Letter Diary",
    body: "Your diary has been permanently destroyed.",
  });

  // 3. Send push — non-fatal on error
  try {
    await webpush.sendNotification(
      subscription as webpush.PushSubscription,
      payload,
      { urgency: "high", TTL: 0 }
    );
  } catch (err) {
    log.warn({ userId, err }, "wipe-notification: push failed (non-fatal)");
  }

  // 4. Delete subscription row — it is no longer needed (wipe is permanent)
  await pool.query("DELETE FROM notifications WHERE user_id = $1", [userId]);
}

// Re-export WebPushError type for callers that need to check statusCode
export type { WebPushError };
