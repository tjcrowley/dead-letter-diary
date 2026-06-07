/**
 * Dexie (IndexedDB) database for auto-saving encrypted diary drafts.
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

// ---------------------------------------------------------------------------
// Database
// ---------------------------------------------------------------------------

class DeadLetterDiaryDB extends Dexie {
  drafts!: Table<DraftEntry, string>;

  constructor() {
    super("DeadLetterDiary");
    this.version(1).stores({
      drafts: "id, updatedAt",
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
