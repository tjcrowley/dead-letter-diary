"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import { countWords } from "@/lib/word-count";
import { encryptEntry, decryptEntry } from "@/lib/crypto";
import { saveDraft, loadLatestDraft, db } from "@/lib/db";
import { getSessionDmk } from "@/lib/session-dmk";
import { queueForSync, registerSyncListener } from "@/lib/sync";
import { api } from "@/lib/api";
import { SyncStatus } from "@/components/SyncStatus";

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const WORD_MINIMUM = 50;
const AUTOSAVE_DELAY_MS = 1_000;
const PLACEHOLDER_USER_ID = "local-user";

// ---------------------------------------------------------------------------
// Write Page
// ---------------------------------------------------------------------------

export default function WritePage() {
  const [text, setText] = useState("");
  const [wordCount, setWordCount] = useState(0);
  const [isSaving, setIsSaving] = useState(false);

  const textRef = useRef(text);
  const entryIdRef = useRef<string>("");
  const saveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const pendingSaveRef = useRef(false);

  // Keep textRef in sync for use in callbacks
  textRef.current = text;

  // -------------------------------------------------------------------------
  // Server submit function (used by both doSave and sync listener)
  // -------------------------------------------------------------------------

  const submitEntryToServer = useCallback(
    async (entryId: string, ciphertext: ArrayBuffer, iv: Uint8Array, aad: Uint8Array, wc: number) => {
      try {
        await api.post("/api/entries", {
          id: entryId,
          ciphertext: Array.from(new Uint8Array(ciphertext)),
          iv: Array.from(iv),
          aad: Array.from(aad),
          wordCount: wc,
        });
        // Successfully submitted — remove from outbox
        await db.outbox.delete(entryId);
      } catch {
        // Network failure — leave in outbox for retry on next online event
      }
    },
    []
  );

  // -------------------------------------------------------------------------
  // Encrypt + save helper
  // -------------------------------------------------------------------------

  const doSave = useCallback(async (content: string) => {
    const dmk = getSessionDmk();
    if (!dmk || !content.trim()) return;

    const wc = countWords(content);
    try {
      setIsSaving(true);
      const { ciphertext, iv, aad } = await encryptEntry(
        dmk,
        content,
        entryIdRef.current,
        PLACEHOLDER_USER_ID,
        wc
      );

      const draftEntry = {
        id: entryIdRef.current,
        ciphertext,
        iv,
        aad,
        wordCount: wc,
        updatedAt: Date.now(),
      };

      // 1. Save to local IndexedDB
      await saveDraft(draftEntry);

      // 2. Queue for server sync (outbox pattern)
      await queueForSync(draftEntry);

      // 3. Attempt immediate server submit; leave in outbox on failure
      await submitEntryToServer(entryIdRef.current, ciphertext, iv, aad, wc);
    } catch {
      // Silently fail — auto-save is best-effort; user can keep writing
    } finally {
      setIsSaving(false);
    }
    pendingSaveRef.current = false;
  }, [submitEntryToServer]);

  // -------------------------------------------------------------------------
  // Debounced save scheduler
  // -------------------------------------------------------------------------

  const scheduleSave = useCallback(
    (content: string) => {
      pendingSaveRef.current = true;
      if (saveTimerRef.current) {
        clearTimeout(saveTimerRef.current);
      }
      saveTimerRef.current = setTimeout(() => {
        doSave(content);
      }, AUTOSAVE_DELAY_MS);
    },
    [doSave]
  );

  // -------------------------------------------------------------------------
  // Flush pending save (beforeunload + unmount)
  // -------------------------------------------------------------------------

  const flushSave = useCallback(() => {
    if (saveTimerRef.current) {
      clearTimeout(saveTimerRef.current);
      saveTimerRef.current = null;
    }
    if (pendingSaveRef.current) {
      doSave(textRef.current);
    }
  }, [doSave]);

  // -------------------------------------------------------------------------
  // On mount: generate entry ID, load latest draft, set up beforeunload,
  //           register online sync listener
  // -------------------------------------------------------------------------

  useEffect(() => {
    entryIdRef.current = crypto.randomUUID();

    // Try to load the latest draft
    const dmk = getSessionDmk();
    if (dmk) {
      loadLatestDraft().then(async (draft) => {
        if (draft) {
          try {
            const plaintext = await decryptEntry(
              dmk,
              draft.ciphertext,
              draft.iv,
              draft.aad
            );
            setText(plaintext);
            setWordCount(countWords(plaintext));
            entryIdRef.current = draft.id;
          } catch {
            // Decryption failed (different key, corrupted) — start fresh
          }
        }
      });
    }

    // Auto-focus
    textareaRef.current?.focus();

    // Flush on beforeunload
    const handleBeforeUnload = () => flushSave();
    window.addEventListener("beforeunload", handleBeforeUnload);

    // Register online event listener for outbox flush
    // submitFn wraps each OutboxEntry and sends it to the server
    const cleanupSyncListener = registerSyncListener(async (entry) => {
      await submitEntryToServer(
        entry.id,
        entry.ciphertext,
        entry.iv,
        entry.aad,
        entry.wordCount
      );
    });

    return () => {
      window.removeEventListener("beforeunload", handleBeforeUnload);
      cleanupSyncListener();
      flushSave();
    };
  }, [flushSave, submitEntryToServer]);

  // -------------------------------------------------------------------------
  // Handle text change
  // -------------------------------------------------------------------------

  const handleChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    const value = e.target.value;
    setText(value);
    const wc = countWords(value);
    setWordCount(wc);
    scheduleSave(value);
  };

  // -------------------------------------------------------------------------
  // Styles
  // -------------------------------------------------------------------------

  const meetsMinimum = wordCount >= WORD_MINIMUM;

  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        minHeight: "100vh",
        background: "var(--background)",
        color: "var(--foreground)",
        padding: "2rem",
      }}
    >
      <textarea
        ref={textareaRef}
        value={text}
        onChange={handleChange}
        autoFocus
        placeholder="Start writing..."
        style={{
          flex: 1,
          width: "100%",
          maxWidth: "720px",
          margin: "0 auto",
          background: "transparent",
          color: "inherit",
          border: "none",
          outline: "none",
          resize: "none",
          fontSize: "1.125rem",
          lineHeight: 1.8,
          fontFamily: "Georgia, 'Times New Roman', serif",
          caretColor: "var(--foreground)",
        }}
        aria-label="Diary entry"
      />

      <div
        style={{
          position: "fixed",
          bottom: "1.5rem",
          right: "2rem",
          fontSize: "0.875rem",
          fontVariantNumeric: "tabular-nums",
          color: meetsMinimum ? "#22c55e" : "#888",
          transition: "color 0.2s ease",
          userSelect: "none",
          display: "flex",
          alignItems: "center",
          gap: "0.75rem",
        }}
      >
        {wordCount} / {WORD_MINIMUM} words
        <SyncStatus isSaving={isSaving} />
      </div>
    </div>
  );
}
