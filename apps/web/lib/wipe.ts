/**
 * Client-side wipe ceremony utilities.
 *
 * performClientWipe() is called from:
 *  - DeadlineBanner (when server state transitions to 'wiped')
 *  - PanicEncryptButton (after server confirms panic wipe)
 *  - /wiped page (on mount, belt-and-suspenders cleanup)
 *
 * It is intentionally idempotent: repeated calls after a wipe are safe.
 */

import { db } from "./db";

/**
 * Perform the three-step local data destruction:
 *  1. Delete the Dexie IndexedDB database
 *  2. Clear all Cache Storage caches
 *  3. Expire the session cookie
 *
 * All steps are best-effort — errors are swallowed so a partially-wiped
 * state does not block the UI from navigating to /wiped.
 */
export async function performClientWipe(): Promise<void> {
  // 1. Delete Dexie database — treat rejection as success (already gone)
  try {
    await db.delete();
  } catch {
    // Already deleted or not yet created — not an error
  }

  // 2. Clear Cache Storage (guarded for SSR / contexts without caches API)
  if (typeof caches !== "undefined") {
    try {
      const keys = await caches.keys();
      await Promise.all(keys.map((k) => caches.delete(k)));
    } catch {
      // Non-critical — proceed even if cache deletion fails
    }
  }

  // 3. Expire session cookie
  document.cookie = "session=; Max-Age=0; path=/; Secure; SameSite=Strict";
}
