import "fake-indexeddb/auto";
import { describe, it, expect, beforeEach } from "vitest";
import { db, saveDraft, loadDraft, loadLatestDraft, type DraftEntry } from "../db";

function makeDraft(overrides: Partial<DraftEntry> = {}): DraftEntry {
  return {
    id: "draft-1",
    ciphertext: new ArrayBuffer(16),
    iv: new Uint8Array(12),
    aad: new Uint8Array(8),
    wordCount: 42,
    updatedAt: Date.now(),
    ...overrides,
  };
}

describe("db – IndexedDB auto-save", () => {
  beforeEach(async () => {
    await db.drafts.clear();
  });

  it("saveDraft then loadDraft returns same entry", async () => {
    const draft = makeDraft({ id: "abc-123", wordCount: 10 });
    await saveDraft(draft);

    const loaded = await loadDraft("abc-123");
    expect(loaded).toBeDefined();
    expect(loaded!.id).toBe("abc-123");
    expect(loaded!.wordCount).toBe(10);
    expect(loaded!.ciphertext.byteLength).toBe(16);
  });

  it("saveDraft twice with same id updates the entry (upsert)", async () => {
    const v1 = makeDraft({ id: "upsert-test", wordCount: 5, updatedAt: 1000 });
    await saveDraft(v1);

    const v2 = makeDraft({ id: "upsert-test", wordCount: 25, updatedAt: 2000 });
    await saveDraft(v2);

    const loaded = await loadDraft("upsert-test");
    expect(loaded).toBeDefined();
    expect(loaded!.wordCount).toBe(25);
    expect(loaded!.updatedAt).toBe(2000);

    // Only one entry should exist
    const count = await db.drafts.where("id").equals("upsert-test").count();
    expect(count).toBe(1);
  });

  it("loadLatestDraft returns most recently updated draft", async () => {
    await saveDraft(makeDraft({ id: "old", updatedAt: 1000 }));
    await saveDraft(makeDraft({ id: "newest", updatedAt: 3000 }));
    await saveDraft(makeDraft({ id: "middle", updatedAt: 2000 }));

    const latest = await loadLatestDraft();
    expect(latest).toBeDefined();
    expect(latest!.id).toBe("newest");
  });
});
