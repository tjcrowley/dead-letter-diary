"use client";

import { useEffect, useState } from "react";
import { api } from "@/lib/api";
import PanicEncryptButton from "@/components/PanicEncryptButton";

interface DeadlineState {
  state: "active" | "pending_wipe" | "wiped";
  deadline_at: string;
  window_hours: number;
  word_minimum: number;
  grace_budget: number;
  grace_used_at: string | null;
  pending_window_hours: number | null;
  pending_word_minimum: number | null;
  pending_effective_at: string | null;
}

interface Threshold {
  id: string;
  threshold_minutes: number;
  tone: "gentle" | "urgent" | "final";
}

interface UserSettings {
  diary_name: string | null;
  timezone: string;
}

function formatMinutes(minutes: number): string {
  if (minutes >= 60) {
    const hours = Math.floor(minutes / 60);
    const mins = minutes % 60;
    return mins > 0 ? `${hours}h ${mins}m` : `${hours}h`;
  }
  return `${minutes}m`;
}

export default function SettingsPage() {
  // ── Commitment settings ────────────────────────────────────────────────────
  const [deadlineState, setDeadlineState] = useState<DeadlineState | null>(null);
  const [wordMinimum, setWordMinimum] = useState(50);
  const [windowHours, setWindowHours] = useState(24);
  const [commitmentSaving, setCommitmentSaving] = useState(false);
  const [commitmentMsg, setCommitmentMsg] = useState("");

  // ── Notification thresholds ────────────────────────────────────────────────
  const [thresholds, setThresholds] = useState<Threshold[]>([]);
  const [thresholdsSaving, setThresholdsSaving] = useState(false);
  const [thresholdsMsg, setThresholdsMsg] = useState("");

  // ── User settings (timezone, diary name) ───────────────────────────────────
  const [timezone, setTimezone] = useState("");
  const [timezoneSaving, setTimezoneSaving] = useState(false);
  const [timezoneMsg, setTimezoneMsg] = useState("");

  // ── Load all data on mount ─────────────────────────────────────────────────
  useEffect(() => {
    // Load deadline state
    api
      .get<DeadlineState>("/api/deadline")
      .then((data) => {
        setDeadlineState(data);
        setWordMinimum(data.word_minimum);
        setWindowHours(data.window_hours);
      })
      .catch(() => {
        // Not configured yet
      });

    // Load thresholds
    api
      .get<Threshold[]>("/api/settings/thresholds")
      .then((data) => {
        setThresholds(data);
      })
      .catch(() => {});

    // Load user settings
    api
      .get<UserSettings>("/api/settings")
      .then((data) => {
        setTimezone(data.timezone);
      })
      .catch(() => {});
  }, []);

  // ── Save commitment settings ───────────────────────────────────────────────
  async function handleSaveCommitment(e: React.FormEvent) {
    e.preventDefault();
    setCommitmentSaving(true);
    setCommitmentMsg("");
    try {
      await api.post("/api/deadline/settings", {
        window_hours: windowHours,
        word_minimum: wordMinimum,
        timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
      });
      setCommitmentMsg("Saved.");
      // Reload deadline state to reflect pending changes
      const updated = await api.get<DeadlineState>("/api/deadline");
      setDeadlineState(updated);
    } catch (err) {
      setCommitmentMsg(
        err instanceof Error ? err.message : "Failed to save."
      );
    } finally {
      setCommitmentSaving(false);
    }
  }

  // ── Save thresholds ────────────────────────────────────────────────────────
  async function handleSaveThresholds(e: React.FormEvent) {
    e.preventDefault();
    setThresholdsSaving(true);
    setThresholdsMsg("");
    try {
      await api.patch("/api/settings/thresholds", {
        thresholds: thresholds.map(({ threshold_minutes, tone }) => ({
          threshold_minutes,
          tone,
        })),
      });
      setThresholdsMsg("Saved.");
    } catch (err) {
      setThresholdsMsg(
        err instanceof Error ? err.message : "Failed to save."
      );
    } finally {
      setThresholdsSaving(false);
    }
  }

  function addThreshold() {
    if (thresholds.length >= 10) return;
    setThresholds([
      ...thresholds,
      { id: crypto.randomUUID(), threshold_minutes: 60, tone: "gentle" },
    ]);
  }

  function removeThreshold(id: string) {
    setThresholds(thresholds.filter((t) => t.id !== id));
  }

  function updateThreshold(
    id: string,
    field: "threshold_minutes" | "tone",
    value: string
  ) {
    setThresholds(
      thresholds.map((t) =>
        t.id === id
          ? {
              ...t,
              [field]:
                field === "threshold_minutes" ? Number(value) : value,
            }
          : t
      )
    );
  }

  // ── Save timezone ──────────────────────────────────────────────────────────
  async function handleSaveTimezone(e: React.FormEvent) {
    e.preventDefault();
    setTimezoneSaving(true);
    setTimezoneMsg("");
    try {
      await api.patch("/api/settings", { timezone });
      setTimezoneMsg("Saved.");
    } catch (err) {
      setTimezoneMsg(
        err instanceof Error ? err.message : "Failed to save."
      );
    } finally {
      setTimezoneSaving(false);
    }
  }

  return (
    <div style={styles.container}>
      <h1 style={styles.pageTitle}>Settings</h1>

      {/* ── Commitment Settings ── */}
      <section style={styles.card}>
        <h2 style={styles.sectionTitle}>Commitment Settings</h2>
        <p style={styles.hint}>
          Strengthening your commitment (shorter window or higher word count)
          takes effect immediately. Relaxing it requires a 7-day waiting
          period.
        </p>

        {deadlineState?.pending_word_minimum !== null &&
          deadlineState?.pending_word_minimum !== undefined && (
            <p style={styles.pendingNote}>
              Word minimum change to {deadlineState.pending_word_minimum}{" "}
              pending — effective{" "}
              {deadlineState.pending_effective_at
                ? new Date(
                    deadlineState.pending_effective_at
                  ).toLocaleDateString()
                : "soon"}
            </p>
          )}

        {deadlineState?.pending_window_hours !== null &&
          deadlineState?.pending_window_hours !== undefined && (
            <p style={styles.pendingNote}>
              Window change to {deadlineState.pending_window_hours}h pending —
              effective{" "}
              {deadlineState.pending_effective_at
                ? new Date(
                    deadlineState.pending_effective_at
                  ).toLocaleDateString()
                : "soon"}
            </p>
          )}

        <form onSubmit={handleSaveCommitment}>
          <label style={styles.label}>
            Word minimum per check-in
            <input
              type="number"
              value={wordMinimum}
              onChange={(e) => setWordMinimum(Number(e.target.value))}
              min={25}
              max={500}
              style={styles.input}
            />
          </label>

          <label style={styles.label}>
            Check-in window (hours)
            <input
              type="number"
              value={windowHours}
              onChange={(e) => setWindowHours(Number(e.target.value))}
              min={12}
              max={168}
              style={styles.input}
            />
          </label>

          {commitmentMsg && (
            <p style={commitmentMsg === "Saved." ? styles.successMsg : styles.errorMsg}>
              {commitmentMsg}
            </p>
          )}

          <button type="submit" disabled={commitmentSaving} style={styles.button}>
            {commitmentSaving ? "Saving..." : "Save Commitment Settings"}
          </button>
        </form>
      </section>

      {/* ── Notification Thresholds ── */}
      <section style={styles.card}>
        <h2 style={styles.sectionTitle}>Notification Thresholds</h2>
        <p style={styles.hint}>
          Configure when and how urgently you are notified before a deadline.
        </p>

        <form onSubmit={handleSaveThresholds}>
          {thresholds.map((t) => (
            <div key={t.id} style={styles.thresholdRow}>
              <div style={styles.thresholdFields}>
                <label style={styles.inlineLabel}>
                  Before deadline
                  <input
                    type="number"
                    value={t.threshold_minutes}
                    onChange={(e) =>
                      updateThreshold(t.id, "threshold_minutes", e.target.value)
                    }
                    min={1}
                    style={{ ...styles.input, ...styles.inputNarrow }}
                  />
                  <span style={styles.unitLabel}>
                    min ({formatMinutes(t.threshold_minutes)})
                  </span>
                </label>

                <label style={styles.inlineLabel}>
                  Tone
                  <select
                    value={t.tone}
                    onChange={(e) =>
                      updateThreshold(t.id, "tone", e.target.value)
                    }
                    style={styles.select}
                  >
                    <option value="gentle">Gentle</option>
                    <option value="urgent">Urgent</option>
                    <option value="final">Final</option>
                  </select>
                </label>
              </div>

              <button
                type="button"
                onClick={() => removeThreshold(t.id)}
                style={styles.removeButton}
                aria-label="Remove threshold"
              >
                Remove
              </button>
            </div>
          ))}

          {thresholds.length < 10 && (
            <button
              type="button"
              onClick={addThreshold}
              style={styles.addButton}
            >
              + Add Threshold
            </button>
          )}

          {thresholdsMsg && (
            <p
              style={
                thresholdsMsg === "Saved."
                  ? styles.successMsg
                  : styles.errorMsg
              }
            >
              {thresholdsMsg}
            </p>
          )}

          <button
            type="submit"
            disabled={thresholdsSaving || thresholds.length === 0}
            style={styles.button}
          >
            {thresholdsSaving ? "Saving..." : "Save Thresholds"}
          </button>
        </form>
      </section>

      {/* ── Timezone ── */}
      <section style={styles.card}>
        <h2 style={styles.sectionTitle}>Timezone</h2>
        <p style={styles.hint}>
          Changing timezone affects when your deadline resets.
        </p>

        <form onSubmit={handleSaveTimezone}>
          <label style={styles.label}>
            Timezone
            <input
              type="text"
              value={timezone}
              onChange={(e) => setTimezone(e.target.value)}
              placeholder="e.g. America/New_York"
              style={styles.input}
            />
          </label>

          {timezoneMsg && (
            <p
              style={
                timezoneMsg === "Saved." ? styles.successMsg : styles.errorMsg
              }
            >
              {timezoneMsg}
            </p>
          )}

          <button type="submit" disabled={timezoneSaving} style={styles.button}>
            {timezoneSaving ? "Saving..." : "Save Timezone"}
          </button>
        </form>
      </section>

      {/* ── Danger Zone ── */}
      <section style={{ ...styles.card, ...styles.dangerZone }}>
        <h2 style={{ ...styles.sectionTitle, color: "#ff4444" }}>
          Danger Zone
        </h2>
        <p style={styles.hint}>
          Permanently encrypt this diary right now — before the deadline.
        </p>
        <PanicEncryptButton />
      </section>
    </div>
  );
}

const styles: Record<string, React.CSSProperties> = {
  container: {
    maxWidth: "600px",
    margin: "0 auto",
    padding: "2rem 1rem",
    display: "flex",
    flexDirection: "column",
    gap: "1.5rem",
  },
  pageTitle: {
    fontSize: "1.75rem",
    fontWeight: 700,
    margin: 0,
    letterSpacing: "-0.02em",
  },
  card: {
    padding: "1.5rem",
    border: "1px solid #333",
    borderRadius: "8px",
    backgroundColor: "#111",
  },
  dangerZone: {
    border: "1px solid #882222",
    backgroundColor: "#130a0a",
  },
  sectionTitle: {
    fontSize: "1.1rem",
    fontWeight: 600,
    marginTop: 0,
    marginBottom: "0.5rem",
  },
  hint: {
    fontSize: "0.875rem",
    color: "#888",
    marginTop: 0,
    marginBottom: "1.25rem",
    lineHeight: 1.5,
  },
  pendingNote: {
    fontSize: "0.85rem",
    color: "#cc9944",
    marginBottom: "0.75rem",
    padding: "0.5rem 0.75rem",
    border: "1px solid #664422",
    borderRadius: "4px",
    backgroundColor: "#1a1200",
  },
  label: {
    display: "flex",
    flexDirection: "column",
    fontSize: "0.875rem",
    color: "#ccc",
    marginBottom: "1rem",
    gap: "0.4rem",
  },
  inlineLabel: {
    display: "flex",
    alignItems: "center",
    gap: "0.5rem",
    fontSize: "0.875rem",
    color: "#ccc",
  },
  input: {
    padding: "0.65rem 0.75rem",
    fontSize: "0.95rem",
    backgroundColor: "#1a1a1a",
    border: "1px solid #444",
    borderRadius: "6px",
    color: "#e8e8e8",
    outline: "none",
  },
  inputNarrow: {
    width: "80px",
  },
  select: {
    padding: "0.65rem 0.75rem",
    fontSize: "0.95rem",
    backgroundColor: "#1a1a1a",
    border: "1px solid #444",
    borderRadius: "6px",
    color: "#e8e8e8",
    outline: "none",
  },
  unitLabel: {
    fontSize: "0.8rem",
    color: "#777",
  },
  thresholdRow: {
    display: "flex",
    alignItems: "flex-end",
    justifyContent: "space-between",
    gap: "1rem",
    marginBottom: "0.75rem",
    padding: "0.75rem",
    border: "1px solid #2a2a2a",
    borderRadius: "6px",
    backgroundColor: "#0f0f0f",
  },
  thresholdFields: {
    display: "flex",
    flexDirection: "column",
    gap: "0.5rem",
    flex: 1,
  },
  removeButton: {
    padding: "0.4rem 0.75rem",
    fontSize: "0.8rem",
    color: "#ff6666",
    backgroundColor: "transparent",
    border: "1px solid #882222",
    borderRadius: "4px",
    cursor: "pointer",
    flexShrink: 0,
  },
  addButton: {
    padding: "0.5rem 1rem",
    fontSize: "0.875rem",
    color: "#aaa",
    backgroundColor: "transparent",
    border: "1px solid #444",
    borderRadius: "6px",
    cursor: "pointer",
    marginBottom: "1rem",
  },
  button: {
    width: "100%",
    padding: "0.75rem",
    fontSize: "0.95rem",
    fontWeight: 600,
    backgroundColor: "#e8e8e8",
    color: "#0a0a0a",
    border: "none",
    borderRadius: "6px",
    cursor: "pointer",
    marginTop: "0.25rem",
  },
  successMsg: {
    color: "#44bb44",
    fontSize: "0.875rem",
    marginBottom: "0.5rem",
  },
  errorMsg: {
    color: "#ff4444",
    fontSize: "0.875rem",
    marginBottom: "0.5rem",
  },
};
