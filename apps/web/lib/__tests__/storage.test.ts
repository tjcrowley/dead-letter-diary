import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";

// Tests for apps/web/lib/storage.ts

// Helper to create a mock IDB request that fires an error event (SecurityError)
function makePrivateModeIDB() {
  return {
    open: (_name: string, _version?: number) => {
      const req: Partial<IDBOpenDBRequest> & { onerror?: ((ev: Event) => void) | null; onsuccess?: ((ev: Event) => void) | null; onupgradeneeded?: ((ev: IDBVersionChangeEvent) => void) | null } = {
        onerror: null,
        onsuccess: null,
        onupgradeneeded: null,
      };
      // Fire onerror synchronously
      setTimeout(() => {
        if (req.onerror) {
          const event = new Event("error");
          Object.defineProperty(event, "target", { value: { error: new DOMException("", "SecurityError") } });
          req.onerror(event);
        }
      }, 0);
      return req as IDBOpenDBRequest;
    },
  };
}

// Helper to create a mock IDB that succeeds (normal mode)
function makeNormalIDB(deleteDbMock: ReturnType<typeof vi.fn>) {
  return {
    open: (_name: string, _version?: number) => {
      const req: Partial<IDBOpenDBRequest> & { onerror?: ((ev: Event) => void) | null; onsuccess?: ((ev: Event) => void) | null; onupgradeneeded?: ((ev: IDBVersionChangeEvent) => void) | null; result?: IDBDatabase } = {
        onerror: null,
        onsuccess: null,
        onupgradeneeded: null,
        result: { close: vi.fn() } as unknown as IDBDatabase,
      };
      // Fire onsuccess synchronously
      setTimeout(() => {
        if (req.onsuccess) {
          req.onsuccess(new Event("success"));
        }
      }, 0);
      return req as IDBOpenDBRequest;
    },
    deleteDatabase: deleteDbMock,
  };
}

describe("detectPrivateMode", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("returns true when indexedDB.open() fires an error event (SecurityError)", async () => {
    Object.defineProperty(globalThis, "indexedDB", {
      value: makePrivateModeIDB(),
      configurable: true,
      writable: true,
    });

    const { detectPrivateMode } = await import("../storage");
    const result = await detectPrivateMode();
    expect(result).toBe(true);
  });

  it("returns false when indexedDB.open() succeeds (normal mode)", async () => {
    const deleteDbMock = vi.fn();
    Object.defineProperty(globalThis, "indexedDB", {
      value: makeNormalIDB(deleteDbMock),
      configurable: true,
      writable: true,
    });

    const { detectPrivateMode } = await import("../storage");
    const result = await detectPrivateMode();
    expect(result).toBe(false);
  });

  it("cleans up: deletes the test database after a successful open", async () => {
    const deleteDbMock = vi.fn();
    Object.defineProperty(globalThis, "indexedDB", {
      value: makeNormalIDB(deleteDbMock),
      configurable: true,
      writable: true,
    });

    const { detectPrivateMode } = await import("../storage");
    await detectPrivateMode();
    expect(deleteDbMock).toHaveBeenCalledWith("__dld_priv_test__");
  });
});

describe("getStorageInfo", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("returns correct MB values when estimate() resolves { usage: 10485760, quota: 524288000 }", async () => {
    Object.defineProperty(navigator, "storage", {
      value: {
        estimate: vi.fn().mockResolvedValue({ usage: 10485760, quota: 524288000 }),
        persist: vi.fn().mockResolvedValue(true),
        persisted: vi.fn().mockResolvedValue(true),
      },
      configurable: true,
      writable: true,
    });

    const { getStorageInfo } = await import("../storage");
    const result = await getStorageInfo();
    expect(result).toEqual({ usedMb: 10, quotaMb: 500, percentUsed: 2 });
  });

  it("returns null when navigator.storage is undefined", async () => {
    Object.defineProperty(navigator, "storage", {
      value: undefined,
      configurable: true,
      writable: true,
    });

    const { getStorageInfo } = await import("../storage");
    const result = await getStorageInfo();
    expect(result).toBeNull();
  });

  it("returns percentUsed: 0 when quota is 0 (avoid division by zero)", async () => {
    Object.defineProperty(navigator, "storage", {
      value: {
        estimate: vi.fn().mockResolvedValue({ usage: 0, quota: 0 }),
        persist: vi.fn().mockResolvedValue(true),
        persisted: vi.fn().mockResolvedValue(true),
      },
      configurable: true,
      writable: true,
    });

    const { getStorageInfo } = await import("../storage");
    const result = await getStorageInfo();
    expect(result?.percentUsed).toBe(0);
  });
});

describe("callPersist", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("calls navigator.storage.persist() and returns its boolean result", async () => {
    const persistMock = vi.fn().mockResolvedValue(true);
    Object.defineProperty(navigator, "storage", {
      value: {
        persist: persistMock,
        estimate: vi.fn().mockResolvedValue({ usage: 0, quota: 0 }),
        persisted: vi.fn().mockResolvedValue(true),
      },
      configurable: true,
      writable: true,
    });

    const { callPersist } = await import("../storage");
    const result = await callPersist();
    expect(persistMock).toHaveBeenCalled();
    expect(result).toBe(true);
  });

  it("returns false without throwing when navigator.storage.persist is undefined", async () => {
    Object.defineProperty(navigator, "storage", {
      value: {
        estimate: vi.fn().mockResolvedValue({ usage: 0, quota: 0 }),
        persisted: vi.fn().mockResolvedValue(true),
        // persist is intentionally missing
      },
      configurable: true,
      writable: true,
    });

    const { callPersist } = await import("../storage");
    const result = await callPersist();
    expect(result).toBe(false);
  });
});
