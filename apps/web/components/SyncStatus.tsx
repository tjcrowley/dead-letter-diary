"use client";

import { useLiveQuery } from "dexie-react-hooks";
import { db } from "@/lib/db";
import { useState, useEffect } from "react";

// ---------------------------------------------------------------------------
// SyncStatus Component
// ---------------------------------------------------------------------------

/**
 * Displays the current sync state for offline-aware entry saving.
 *
 * Uses Dexie's useLiveQuery to reactively count outbox entries and
 * listen to online/offline events for live status updates.
 *
 * Labels:
 *   "Synced"                       — online, outbox empty
 *   "Saving..."                    — local save in progress or online with pending outbox
 *   "Offline — N entries pending"  — offline with queued entries
 */
export function SyncStatus({ isSaving }: { isSaving: boolean }) {
  const pendingCount = useLiveQuery(() => db.outbox.count(), []) ?? 0;
  const [isOnline, setIsOnline] = useState(
    typeof navigator !== "undefined" ? navigator.onLine : true
  );

  useEffect(() => {
    const onOnline = () => setIsOnline(true);
    const onOffline = () => setIsOnline(false);
    window.addEventListener("online", onOnline);
    window.addEventListener("offline", onOffline);
    return () => {
      window.removeEventListener("online", onOnline);
      window.removeEventListener("offline", onOffline);
    };
  }, []);

  let label: string;
  if (isSaving) {
    label = "Saving...";
  } else if (!isOnline && pendingCount > 0) {
    label = `Offline — ${pendingCount} ${pendingCount === 1 ? "entry" : "entries"} pending`;
  } else if (pendingCount > 0) {
    label = "Saving...";
  } else {
    label = "Synced";
  }

  return (
    <div
      aria-live="polite"
      style={{ fontSize: "0.75rem", color: "#888", padding: "4px 8px" }}
    >
      {label}
    </div>
  );
}
