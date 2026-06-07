"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import { countWords } from "@/lib/word-count";
import { encryptEntry, decryptEntry } from "@/lib/crypto";
import { saveDraft, loadLatestDraft } from "@/lib/db";
import { getSessionDmk } from "@/lib/session-dmk";

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
  const [saveStatus, setSaveStatus] = useState<"idle" | "saving" | "saved">(
    "idle"
  );

  const textRef = useRef(text);
  const entryIdRef = useRef<string>("");
  const saveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const pendingSaveRef = useRef(false);

  // Keep textRef in sync for use in callbacks
  textRef.current = text;

  // -------------------------------------------------------------------------
  // Encrypt + save helper
  // -------------------------------------------------------------------------

  const doSave = useCallback(async (content: string) => {
    const dmk = getSessionDmk();
    if (!dmk || !content.trim()) return;

    const wc = countWords(content);
    try {
      setSaveStatus("saving");
      const { ciphertext, iv, aad } = await encryptEntry(
        dmk,
        content,
        entryIdRef.current,
        PLACEHOLDER_USER_ID,
        wc
      );
      await saveDraft({
        id: entryIdRef.current,
        ciphertext,
        iv,
        aad,
        wordCount: wc,
        updatedAt: Date.now(),
      });
      setSaveStatus("saved");
    } catch {
      // Silently fail — auto-save is best-effort; user can keep writing
      setSaveStatus("idle");
    }
    pendingSaveRef.current = false;
  }, []);

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
  // On mount: generate entry ID, load latest draft, set up beforeunload
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

    return () => {
      window.removeEventListener("beforeunload", handleBeforeUnload);
      flushSave();
    };
  }, [flushSave]);

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
        }}
      >
        {wordCount} / {WORD_MINIMUM} words
        {saveStatus === "saving" && (
          <span style={{ marginLeft: "0.75rem", color: "#888" }}>saving...</span>
        )}
        {saveStatus === "saved" && (
          <span style={{ marginLeft: "0.75rem", color: "#888" }}>saved</span>
        )}
      </div>
    </div>
  );
}
