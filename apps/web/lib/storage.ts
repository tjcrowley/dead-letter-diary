/**
 * Storage utilities: persistence, incognito detection, quota monitoring.
 *
 * IMPORTANT — incognito detection limitations:
 * Chrome 2024+ reports a predictable artificial quota in all modes.
 * DO NOT use quota thresholds to detect private mode.
 * Only SecurityError on indexedDB.open() is a reliable signal.
 * Even SecurityError is not universal — some private modes allow IDB.
 * The goal is to refuse where we CAN detect it, not to be exhaustive.
 */

const PRIV_TEST_DB = "__dld_priv_test__";

export async function detectPrivateMode(): Promise<boolean> {
  return new Promise<boolean>((resolve) => {
    try {
      const req = indexedDB.open(PRIV_TEST_DB, 1);
      req.onerror = (_event) => {
        // SecurityError in some private mode implementations
        resolve(true);
      };
      req.onsuccess = () => {
        req.result.close();
        // Clean up test database
        indexedDB.deleteDatabase(PRIV_TEST_DB);
        resolve(false);
      };
      req.onupgradeneeded = () => {
        // Version upgrade fires before onsuccess — this is normal
      };
    } catch {
      // synchronous throw also indicates private mode in some environments
      resolve(true);
    }
  });
}

export async function callPersist(): Promise<boolean> {
  if (!navigator?.storage?.persist) return false;
  try {
    return await navigator.storage.persist();
  } catch {
    return false;
  }
}

export async function getStorageInfo(): Promise<{
  usedMb: number;
  quotaMb: number;
  percentUsed: number;
} | null> {
  if (!navigator?.storage?.estimate) return null;
  try {
    const { usage = 0, quota = 0 } = await navigator.storage.estimate();
    return {
      usedMb: Math.round(usage / 1024 / 1024),
      quotaMb: Math.round(quota / 1024 / 1024),
      percentUsed: quota > 0 ? Math.round((usage / quota) * 100) : 0,
    };
  } catch {
    return null;
  }
}
