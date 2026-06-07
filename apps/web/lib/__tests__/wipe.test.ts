/**
 * Tests for performClientWipe() utility.
 * Covers: IDB deletion, Cache Storage clearing, session cookie clearing,
 * and error resilience (already-deleted DB should not throw).
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

// Mock db module — we only need db.delete
vi.mock("../db", () => ({
  db: { delete: vi.fn() },
}));

describe("performClientWipe", () => {
  let mockCachesKeys: ReturnType<typeof vi.fn>;
  let mockCachesDelete: ReturnType<typeof vi.fn>;
  let cookieSetter: string | undefined;

  beforeEach(() => {
    // Reset module mocks between tests
    vi.resetModules();

    // Mock caches global
    mockCachesDelete = vi.fn().mockResolvedValue(true);
    mockCachesKeys = vi.fn().mockResolvedValue(["cache-v1", "cache-v2"]);
    vi.stubGlobal("caches", {
      keys: mockCachesKeys,
      delete: mockCachesDelete,
    });

    // Mock document.cookie setter
    cookieSetter = undefined;
    Object.defineProperty(document, "cookie", {
      set: (val: string) => {
        cookieSetter = val;
      },
      get: () => "",
      configurable: true,
    });
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  it("calls db.delete() to drop the Dexie database", async () => {
    const { db } = await import("../db");
    const { performClientWipe } = await import("../wipe");

    (db.delete as ReturnType<typeof vi.fn>).mockResolvedValue(undefined);

    await performClientWipe();

    expect(db.delete).toHaveBeenCalledTimes(1);
  });

  it("does not throw if db.delete() rejects (database already gone)", async () => {
    const { db } = await import("../db");
    const { performClientWipe } = await import("../wipe");

    (db.delete as ReturnType<typeof vi.fn>).mockRejectedValue(
      new Error("database already deleted")
    );

    await expect(performClientWipe()).resolves.toBeUndefined();
  });

  it("clears all Cache Storage caches", async () => {
    const { db } = await import("../db");
    const { performClientWipe } = await import("../wipe");

    (db.delete as ReturnType<typeof vi.fn>).mockResolvedValue(undefined);

    await performClientWipe();

    expect(mockCachesKeys).toHaveBeenCalledTimes(1);
    expect(mockCachesDelete).toHaveBeenCalledWith("cache-v1");
    expect(mockCachesDelete).toHaveBeenCalledWith("cache-v2");
  });

  it("clears the session cookie", async () => {
    const { db } = await import("../db");
    const { performClientWipe } = await import("../wipe");

    (db.delete as ReturnType<typeof vi.fn>).mockResolvedValue(undefined);

    await performClientWipe();

    expect(cookieSetter).toBe(
      "session=; Max-Age=0; path=/; Secure; SameSite=Strict"
    );
  });

  it("does not throw when caches global is absent (SSR guard)", async () => {
    vi.unstubAllGlobals();
    // Remove caches from window
    const origCaches = (globalThis as Record<string, unknown>).caches;
    delete (globalThis as Record<string, unknown>).caches;

    const { db } = await import("../db");
    const { performClientWipe } = await import("../wipe");

    (db.delete as ReturnType<typeof vi.fn>).mockResolvedValue(undefined);

    await expect(performClientWipe()).resolves.toBeUndefined();

    if (origCaches !== undefined) {
      (globalThis as Record<string, unknown>).caches = origCaches;
    }
  });
});
