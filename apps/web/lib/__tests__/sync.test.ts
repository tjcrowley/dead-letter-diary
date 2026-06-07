/**
 * Tests for sync.ts — outbox queue and sync status logic.
 *
 * Uses fake-indexeddb to mock IndexedDB in the test environment.
 */

import "fake-indexeddb/auto";
import { describe, it, expect, beforeEach, vi } from "vitest";
import { db } from "../db";
import {
  queueForSync,
  flushOutbox,
  getSyncStatus,
  type OutboxEntry,
} from "../sync";
import type { DraftEntry } from "../db";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeDraftEntry(overrides: Partial<DraftEntry> = {}): DraftEntry {
  return {
    id: "entry-1",
    ciphertext: new ArrayBuffer(16),
    iv: new Uint8Array(12),
    aad: new Uint8Array(8),
    wordCount: 55,
    updatedAt: Date.now(),
    ...overrides,
  };
}

function setOnline(value: boolean) {
  Object.defineProperty(navigator, "onLine", {
    value,
    configurable: true,
    writable: true,
  });
}

// ---------------------------------------------------------------------------
// Setup
// ---------------------------------------------------------------------------

beforeEach(async () => {
  await db.outbox.clear();
  await db.drafts.clear();
  setOnline(true);
});

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("db.outbox — table exists", () => {
  it("db.outbox table exists after DB construction", () => {
    expect(db.outbox).toBeDefined();
  });
});

describe("queueForSync", () => {
  it("adds an OutboxEntry with attempts: 0 and recent queuedAt", async () => {
    const before = Date.now();
    const draft = makeDraftEntry({ id: "q-test-1" });

    await queueForSync(draft);

    const entries = await db.outbox.toArray();
    expect(entries).toHaveLength(1);

    const entry = entries[0];
    expect(entry.id).toBe("q-test-1");
    expect(entry.attempts).toBe(0);
    expect(entry.queuedAt).toBeGreaterThanOrEqual(before);
    expect(entry.queuedAt).toBeLessThanOrEqual(Date.now());
  });
});

describe("flushOutbox", () => {
  it("calls submitFn for each entry in queuedAt order and deletes on success", async () => {
    const draft1 = makeDraftEntry({ id: "flush-1" });
    const draft2 = makeDraftEntry({ id: "flush-2" });

    // Queue with slightly different timestamps to test order
    await db.outbox.put({
      id: "flush-1",
      ciphertext: draft1.ciphertext,
      iv: draft1.iv,
      aad: draft1.aad,
      wordCount: draft1.wordCount,
      queuedAt: 1000,
      attempts: 0,
    });
    await db.outbox.put({
      id: "flush-2",
      ciphertext: draft2.ciphertext,
      iv: draft2.iv,
      aad: draft2.aad,
      wordCount: draft2.wordCount,
      queuedAt: 2000,
      attempts: 0,
    });

    const callOrder: string[] = [];
    const submitFn = vi.fn(async (entry: OutboxEntry) => {
      callOrder.push(entry.id);
    });

    await flushOutbox(submitFn);

    expect(submitFn).toHaveBeenCalledTimes(2);
    expect(callOrder).toEqual(["flush-1", "flush-2"]);

    // Both entries deleted on success
    const remaining = await db.outbox.count();
    expect(remaining).toBe(0);
  });

  it("increments attempts and keeps entry when submitFn throws", async () => {
    await db.outbox.put({
      id: "fail-entry",
      ciphertext: new ArrayBuffer(8),
      iv: new Uint8Array(12),
      aad: new Uint8Array(8),
      wordCount: 10,
      queuedAt: Date.now(),
      attempts: 0,
    });

    const submitFn = vi.fn(async (_entry: OutboxEntry) => {
      throw new Error("Network error");
    });

    await flushOutbox(submitFn);

    // Entry still in outbox
    const entry = await db.outbox.get("fail-entry");
    expect(entry).toBeDefined();
    expect(entry!.attempts).toBe(1);
  });
});

describe("getSyncStatus", () => {
  it("returns { state: 'synced' } when isSaving is false, online, and outbox is empty", async () => {
    setOnline(true);
    const status = await getSyncStatus(false);
    expect(status).toEqual({ state: "synced" });
  });

  it("returns { state: 'saving' } when isSaving is true regardless of outbox state", async () => {
    setOnline(true);
    const status = await getSyncStatus(true);
    expect(status).toEqual({ state: "saving" });
  });

  it("returns { state: 'offline', pendingCount: N } when offline and outbox has N entries", async () => {
    setOnline(false);

    await db.outbox.put({
      id: "offline-1",
      ciphertext: new ArrayBuffer(8),
      iv: new Uint8Array(12),
      aad: new Uint8Array(8),
      wordCount: 10,
      queuedAt: Date.now(),
      attempts: 0,
    });
    await db.outbox.put({
      id: "offline-2",
      ciphertext: new ArrayBuffer(8),
      iv: new Uint8Array(12),
      aad: new Uint8Array(8),
      wordCount: 10,
      queuedAt: Date.now(),
      attempts: 0,
    });

    const status = await getSyncStatus(false);
    expect(status).toEqual({ state: "offline", pendingCount: 2 });
  });

  it("returns { state: 'saving' } when online but outbox has entries (pending flush)", async () => {
    setOnline(true);

    await db.outbox.put({
      id: "pending-1",
      ciphertext: new ArrayBuffer(8),
      iv: new Uint8Array(12),
      aad: new Uint8Array(8),
      wordCount: 10,
      queuedAt: Date.now(),
      attempts: 0,
    });

    const status = await getSyncStatus(false);
    expect(status).toEqual({ state: "saving" });
  });
});
