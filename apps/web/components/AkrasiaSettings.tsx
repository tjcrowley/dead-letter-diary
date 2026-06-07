"use client";

import { useState } from "react";

interface AkrasiaSettingsProps {
  currentSettings: {
    word_minimum: number;
    window_hours: number;
    pending_word_minimum?: number | null;
    pending_window_hours?: number | null;
    pending_effective_at?: string | null;
  };
}

/**
 * AkrasiaSettings — form for adjusting commitment settings.
 * Strengthening changes apply immediately; weakening changes are queued for 7 days.
 * Shows pending change messaging when a weakening is queued.
 */
export function AkrasiaSettings({ currentSettings }: AkrasiaSettingsProps) {
  const [wordMinimum, setWordMinimum] = useState(currentSettings.word_minimum);
  const [windowHours, setWindowHours] = useState(currentSettings.window_hours);
  const [status, setStatus] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const formatPendingDate = (isoDate: string) => {
    try {
      return new Date(isoDate).toLocaleDateString(undefined, {
        year: "numeric",
        month: "long",
        day: "numeric",
      });
    } catch {
      return isoDate;
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setStatus(null);

    try {
      const res = await fetch("/api/deadline/settings", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ word_minimum: wordMinimum, window_hours: windowHours }),
      });

      if (res.ok) {
        const body = await res.json() as { ok: boolean; pending_effective_at?: string };
        if (body.pending_effective_at) {
          setStatus("Weakening change queued — will apply in 7 days.");
        } else {
          setStatus("Settings saved.");
        }
      } else {
        setStatus("Failed to save settings. Please try again.");
      }
    } finally {
      setLoading(false);
    }
  };

  const pendingDate = currentSettings.pending_effective_at
    ? formatPendingDate(currentSettings.pending_effective_at)
    : null;

  return (
    <form onSubmit={handleSubmit}>
      <div>
        <label htmlFor="word_minimum">Word minimum</label>
        <input
          id="word_minimum"
          type="number"
          min={25}
          max={500}
          value={wordMinimum}
          onChange={(e) => setWordMinimum(Number(e.target.value))}
        />
        {currentSettings.pending_word_minimum != null && pendingDate && (
          <p className="muted">
            Change to {currentSettings.pending_word_minimum} pending — effective {pendingDate}
          </p>
        )}
      </div>

      <div>
        <label htmlFor="window_hours">Window hours</label>
        <input
          id="window_hours"
          type="number"
          min={12}
          max={168}
          value={windowHours}
          onChange={(e) => setWindowHours(Number(e.target.value))}
        />
        {currentSettings.pending_window_hours != null && pendingDate && (
          <p className="muted">
            Change to {currentSettings.pending_window_hours} pending — effective {pendingDate}
          </p>
        )}
      </div>

      <button type="submit" disabled={loading}>
        {loading ? "Saving..." : "Save settings"}
      </button>

      {status && <p role="status">{status}</p>}
    </form>
  );
}
