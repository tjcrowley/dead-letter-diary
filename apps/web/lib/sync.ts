/**
 * Sync queue (outbox pattern) for Dead Letter Diary.
 *
 * Entries written while offline accumulate in the outbox table and are
 * flushed to the server when connectivity returns (online event + optional
 * Background Sync API on Chromium).
 */

import { db } from "./db";
import type { DraftEntry, OutboxEntry } from "./db";

// Re-export so callers can import OutboxEntry from either db or sync
export type { OutboxEntry } from "./db";

export type SyncStatus =
  | { state: "synced" }
  | { state: "saving" }
  | { state: "offline"; pendingCount: number };

// ---------------------------------------------------------------------------
// Queue
// ---------------------------------------------------------------------------

/**
 * Add a draft entry to the outbox for server sync.
 * Call this after a successful local encrypt+save.
 */
export async function queueForSync(entry: DraftEntry): Promise<void> {
  const outboxEntry: OutboxEntry = {
    id: entry.id,
    ciphertext: entry.ciphertext,
    iv: entry.iv,
    aad: entry.aad,
    wordCount: entry.wordCount,
    queuedAt: Date.now(),
    attempts: 0,
  };
  await db.outbox.put(outboxEntry);
}

// ---------------------------------------------------------------------------
// Flush
// ---------------------------------------------------------------------------

/**
 * Attempt to submit all pending outbox entries to the server.
 *
 * Processes entries in queuedAt order. On success, deletes the entry.
 * On failure, increments attempts and keeps the entry for next retry.
 * Continues processing remaining entries even if one fails.
 */
export async function flushOutbox(
  submitFn: (entry: OutboxEntry) => Promise<void>
): Promise<void> {
  const entries = await db.outbox.orderBy("queuedAt").toArray();

  for (const entry of entries) {
    try {
      await submitFn(entry);
      await db.outbox.delete(entry.id);
    } catch {
      await db.outbox.update(entry.id, { attempts: entry.attempts + 1 });
    }
  }
}

// ---------------------------------------------------------------------------
// Status
// ---------------------------------------------------------------------------

/**
 * Compute the current sync status.
 *
 * @param isSaving - true when a local save is actively in progress
 */
export async function getSyncStatus(isSaving: boolean): Promise<SyncStatus> {
  if (isSaving) {
    return { state: "saving" };
  }

  const pendingCount = await db.outbox.count();

  if (!navigator.onLine && pendingCount > 0) {
    return { state: "offline", pendingCount };
  }

  if (pendingCount > 0) {
    return { state: "saving" };
  }

  return { state: "synced" };
}

// ---------------------------------------------------------------------------
// Online event listener
// ---------------------------------------------------------------------------

/**
 * Register a listener that flushes the outbox when connectivity returns.
 * Also registers a Background Sync tag on Chromium for background retry.
 *
 * @returns Cleanup function — call on component unmount.
 */
export function registerSyncListener(
  submitFn: (entry: OutboxEntry) => Promise<void>
): () => void {
  const handler = () => {
    flushOutbox(submitFn).catch(() => {
      // Flush errors are non-fatal; entries remain for next retry
    });
  };

  window.addEventListener("online", handler);

  // Background Sync API (Chromium only) — non-fatal if unsupported
  if (
    typeof ServiceWorkerRegistration !== "undefined" &&
    "sync" in ServiceWorkerRegistration.prototype
  ) {
    navigator.serviceWorker.ready
      .then((reg) => {
        // Type assertion needed: BackgroundSyncRegistration not in all TS defs
        const bgSync = (reg as unknown as { sync: { register: (tag: string) => Promise<void> } }).sync;
        return bgSync.register("outbox-flush");
      })
      .catch(() => {
        // Background Sync registration failed — not fatal
      });
  }

  return () => {
    window.removeEventListener("online", handler);
  };
}
