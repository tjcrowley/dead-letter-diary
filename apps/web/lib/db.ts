/**
 * Dexie (IndexedDB) database for auto-saving encrypted diary drafts
 * and queuing entries for server sync via the outbox pattern.
 *
 * Encryption happens BEFORE data reaches this module — we store only
 * ciphertext, IV, and AAD. No plaintext is ever persisted to IndexedDB.
 */

import Dexie, { type Table } from "dexie";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface DraftEntry {
  id: string;
  ciphertext: ArrayBuffer;
  iv: Uint8Array;
  aad: Uint8Array;
  wordCount: number;
  updatedAt: number;
}

/**
 * An entry in the outbox queue, waiting to be submitted to the server.
 * Defined here (alongside the table) to avoid circular imports with sync.ts.
 */
export interface OutboxEntry {
  id: string;
  ciphertext: ArrayBuffer;
  iv: Uint8Array;
  aad: Uint8Array;
  wordCount: number;
  queuedAt: number;
  attempts: number;
}

// ---------------------------------------------------------------------------
// Database
// ---------------------------------------------------------------------------

class DeadLetterDiaryDB extends Dexie {
  drafts!: Table<DraftEntry, string>;
  outbox!: Table<OutboxEntry, string>;

  constructor() {
    super("DeadLetterDiary");

    // Version 1: drafts only (must remain declared for Dexie migration)
    this.version(1).stores({
      drafts: "id, updatedAt",
    });

    // Version 2: add outbox table for sync queue
    this.version(2).stores({
      drafts: "id, updatedAt",
      outbox: "id, queuedAt",
    });
  }
}

export const db = new DeadLetterDiaryDB();

// ---------------------------------------------------------------------------
// Operations
// ---------------------------------------------------------------------------

/**
 * Save (upsert) a draft entry to IndexedDB.
 */
export async function saveDraft(draft: DraftEntry): Promise<void> {
  await db.drafts.put(draft);
}

/**
 * Load a specific draft by ID.
 */
export async function loadDraft(id: string): Promise<DraftEntry | undefined> {
  return db.drafts.get(id);
}

/**
 * Load the most recently updated draft.
 */
export async function loadLatestDraft(): Promise<DraftEntry | undefined> {
  return db.drafts.orderBy("updatedAt").last();
}
