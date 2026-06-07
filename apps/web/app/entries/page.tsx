"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { getSessionDmk } from "@/lib/session-dmk";
import { decryptEntry, base64urlToUint8 } from "@/lib/crypto";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface EntryMeta {
  id: string;
  word_count: number;
  created_at: string;
}

interface EntryPayload {
  id: string;
  ciphertext: string; // base64url
  iv: string;         // base64url
  aad: string;        // base64url
  word_count: number;
  created_at: string;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function formatDate(dateStr: string): string {
  return new Date(dateStr).toLocaleDateString(undefined, {
    weekday: "long",
    year: "numeric",
    month: "long",
    day: "numeric",
  });
}

// ---------------------------------------------------------------------------
// Entries Page
// ---------------------------------------------------------------------------

export default function EntriesPage() {
  const [entries, setEntries] = useState<EntryMeta[]>([]);
  const [loading, setLoading] = useState(true);
  const [authError, setAuthError] = useState(false);

  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [decryptedText, setDecryptedText] = useState<string | null>(null);
  const [decrypting, setDecrypting] = useState(false);
  const [decryptError, setDecryptError] = useState<string | null>(null);

  const [diaryName, setDiaryName] = useState<string | null>(null);

  // -------------------------------------------------------------------------
  // On mount: load diary name + entry list
  // -------------------------------------------------------------------------

  useEffect(() => {
    // Fetch diary name from settings (best-effort, silent on failure)
    fetch("/api/settings", { credentials: "include" })
      .then((res) => (res.ok ? res.json() : null))
      .then((data: { diary_name?: string } | null) => {
        if (data?.diary_name) setDiaryName(data.diary_name);
      })
      .catch(() => {
        // Settings unavailable — use fallback heading
      });

    // Fetch entry list
    fetch("/api/entries", { credentials: "include" })
      .then((res) => {
        if (res.status === 401) {
          setAuthError(true);
          return null;
        }
        return res.json() as Promise<{ entries: EntryMeta[] }>;
      })
      .then((data) => {
        if (data) setEntries(data.entries);
      })
      .catch(() => {
        // Network error — entries stay empty
      })
      .finally(() => setLoading(false));
  }, []);

  // -------------------------------------------------------------------------
  // Decrypt handler — called on entry row click
  // -------------------------------------------------------------------------

  async function handleDecrypt(id: string) {
    const dmk = getSessionDmk();
    if (!dmk) {
      setDecryptError(
        "Your diary is locked. Unlock it first to read entries."
      );
      setSelectedId(id);
      setDecryptedText(null);
      return;
    }

    setDecrypting(true);
    setSelectedId(id);
    setDecryptedText(null);
    setDecryptError(null);

    try {
      const res = await fetch(`/api/entries/${id}`, { credentials: "include" });
      if (!res.ok) {
        setDecryptError("Failed to fetch entry from server.");
        return;
      }

      const payload = (await res.json()) as EntryPayload;

      const ciphertextBytes = base64urlToUint8(payload.ciphertext);
      const ivBytes = base64urlToUint8(payload.iv);
      const aadBytes = base64urlToUint8(payload.aad);

      const plaintext = await decryptEntry(
        dmk,
        ciphertextBytes.buffer as ArrayBuffer,
        ivBytes,
        aadBytes
      );

      setDecryptedText(plaintext);
    } catch {
      setDecryptError(
        "Decryption failed. This entry may be from a different session key."
      );
    } finally {
      setDecrypting(false);
    }
  }

  function handleClose() {
    setSelectedId(null);
    setDecryptedText(null);
    setDecryptError(null);
  }

  // -------------------------------------------------------------------------
  // DMK status banner (shown when list loaded but diary is locked)
  // -------------------------------------------------------------------------

  const dmkAvailable = getSessionDmk() !== null;

  // -------------------------------------------------------------------------
  // Render
  // -------------------------------------------------------------------------

  return (
    <div
      style={{
        minHeight: "100vh",
        backgroundColor: "#0a0a0a",
        color: "#e8e8e8",
        padding: "2rem",
        fontFamily: "Georgia, 'Times New Roman', serif",
      }}
    >
      <div style={{ maxWidth: "720px", margin: "0 auto" }}>
        {/* Page heading */}
        <h1
          style={{
            fontSize: "1.75rem",
            fontWeight: 600,
            marginBottom: "0.25rem",
            color: "#e8e8e8",
          }}
        >
          {diaryName ?? "Past Entries"}
        </h1>
        <p
          style={{
            fontSize: "0.875rem",
            color: "#666",
            marginBottom: "2rem",
          }}
        >
          Read-only &mdash; entries are decrypted in your browser
        </p>

        {/* Auth error */}
        {authError && (
          <div
            style={{
              backgroundColor: "#111",
              border: "1px solid #333",
              borderRadius: "6px",
              padding: "1rem",
              marginBottom: "1.5rem",
              color: "#e8e8e8",
            }}
          >
            Please unlock your diary first.{" "}
            <Link
              href="/unlock"
              style={{ color: "#a78bfa", textDecoration: "underline" }}
            >
              Go to unlock
            </Link>
          </div>
        )}

        {/* DMK locked banner */}
        {!authError && !loading && entries.length > 0 && !dmkAvailable && (
          <div
            style={{
              backgroundColor: "#111",
              border: "1px solid #444",
              borderRadius: "6px",
              padding: "0.75rem 1rem",
              marginBottom: "1.5rem",
              fontSize: "0.875rem",
              color: "#aaa",
            }}
          >
            Unlock your diary to decrypt entries.{" "}
            <Link
              href="/unlock"
              style={{ color: "#a78bfa", textDecoration: "underline" }}
            >
              Unlock
            </Link>
          </div>
        )}

        {/* Loading state */}
        {loading && (
          <p style={{ color: "#666", fontStyle: "italic" }}>
            Loading entries...
          </p>
        )}

        {/* Empty state */}
        {!loading && !authError && entries.length === 0 && (
          <div
            style={{
              backgroundColor: "#111",
              border: "1px solid #333",
              borderRadius: "6px",
              padding: "1.5rem",
              textAlign: "center",
              color: "#666",
            }}
          >
            <p style={{ marginBottom: "1rem" }}>
              No entries yet &mdash; start writing!
            </p>
            <Link
              href="/write"
              style={{
                color: "#a78bfa",
                textDecoration: "underline",
                fontSize: "0.9rem",
              }}
            >
              Write your first entry
            </Link>
          </div>
        )}

        {/* Entry list */}
        {!loading && entries.length > 0 && (
          <ul style={{ listStyle: "none", padding: 0, margin: 0 }}>
            {entries.map((entry) => (
              <li key={entry.id} style={{ marginBottom: "0.75rem" }}>
                {/* Clickable entry row */}
                <button
                  onClick={() => handleDecrypt(entry.id)}
                  style={{
                    width: "100%",
                    textAlign: "left",
                    backgroundColor:
                      selectedId === entry.id ? "#1a1a1a" : "#111",
                    border: "1px solid #333",
                    borderRadius: "6px",
                    padding: "0.875rem 1rem",
                    cursor: "pointer",
                    color: "#e8e8e8",
                    fontFamily: "inherit",
                    display: "flex",
                    justifyContent: "space-between",
                    alignItems: "center",
                    transition: "background-color 0.15s ease",
                  }}
                  aria-expanded={selectedId === entry.id}
                >
                  <span style={{ fontSize: "0.9375rem" }}>
                    {formatDate(entry.created_at)}
                  </span>
                  <span style={{ fontSize: "0.8125rem", color: "#888" }}>
                    {entry.word_count} words
                  </span>
                </button>

                {/* Inline expanded view — only for selected entry */}
                {selectedId === entry.id && (
                  <div
                    style={{
                      backgroundColor: "#0f0f0f",
                      border: "1px solid #333",
                      borderTop: "none",
                      borderRadius: "0 0 6px 6px",
                      padding: "1rem",
                    }}
                  >
                    {/* Decrypting spinner */}
                    {decrypting && (
                      <p
                        style={{
                          color: "#888",
                          fontStyle: "italic",
                          fontSize: "0.875rem",
                          margin: 0,
                        }}
                      >
                        Decrypting...
                      </p>
                    )}

                    {/* Decrypt error */}
                    {decryptError && !decrypting && (
                      <p
                        style={{
                          color: "#f87171",
                          fontSize: "0.875rem",
                          margin: "0 0 0.5rem 0",
                        }}
                      >
                        {decryptError}
                      </p>
                    )}

                    {/* Decrypted plaintext — read-only preformatted block */}
                    {decryptedText && !decrypting && (
                      <pre
                        style={{
                          whiteSpace: "pre-wrap",
                          fontFamily: "inherit",
                          backgroundColor: "#111",
                          padding: "1rem",
                          borderRadius: "6px",
                          color: "#e8e8e8",
                          marginTop: "0.5rem",
                          fontSize: "1rem",
                          lineHeight: 1.8,
                          margin: 0,
                        }}
                      >
                        {decryptedText}
                      </pre>
                    )}

                    {/* Close button */}
                    {!decrypting && (
                      <button
                        onClick={handleClose}
                        style={{
                          marginTop: "0.75rem",
                          backgroundColor: "transparent",
                          border: "1px solid #444",
                          borderRadius: "4px",
                          color: "#888",
                          cursor: "pointer",
                          padding: "0.25rem 0.75rem",
                          fontSize: "0.8125rem",
                          fontFamily: "inherit",
                        }}
                      >
                        Close
                      </button>
                    )}
                  </div>
                )}
              </li>
            ))}
          </ul>
        )}

        {/* Navigation footer */}
        <div
          style={{
            marginTop: "2.5rem",
            paddingTop: "1rem",
            borderTop: "1px solid #222",
            fontSize: "0.875rem",
          }}
        >
          <Link
            href="/write"
            style={{ color: "#a78bfa", textDecoration: "none" }}
          >
            Write today&apos;s entry
          </Link>
        </div>
      </div>
    </div>
  );
}
