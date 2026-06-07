/**
 * Module-level session DMK (Diary Master Key) holder.
 *
 * The DMK is set after the unlock/setup flow completes and cleared on logout.
 * This module provides a simple get/set interface — no React context needed
 * since the key is a singleton for the browser session.
 */

let _sessionDmk: CryptoKey | null = null;

/**
 * Store the unlocked DMK for the current session.
 */
export function setSessionDmk(key: CryptoKey): void {
  _sessionDmk = key;
}

/**
 * Retrieve the session DMK, or null if not yet unlocked.
 */
export function getSessionDmk(): CryptoKey | null {
  return _sessionDmk;
}

/**
 * Clear the session DMK (e.g., on logout or lock).
 */
export function clearSessionDmk(): void {
  _sessionDmk = null;
}
