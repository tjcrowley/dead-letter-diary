"use client";

import { useEffect, useState } from "react";

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

function formatCountdown(deadlineAt: string): {
  label: string;
  color: "green" | "yellow" | "red";
} {
  const deadlineMs = new Date(deadlineAt).getTime();
  const remainingMs = deadlineMs - Date.now();

  if (remainingMs <= 0) {
    return { label: "Deadline passed", color: "red" };
  }

  const totalSeconds = Math.floor(remainingMs / 1000);
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);

  let label: string;
  if (hours >= 24) {
    const days = Math.floor(hours / 24);
    const remainingHours = hours % 24;
    label =
      remainingHours > 0
        ? `${days}d ${remainingHours}h remaining`
        : `${days}d remaining`;
  } else if (hours > 0) {
    label = `${hours}h ${minutes}m remaining`;
  } else {
    label = `${minutes}m remaining`;
  }

  let color: "green" | "yellow" | "red";
  if (remainingMs > 24 * 60 * 60 * 1000) {
    color = "green";
  } else if (remainingMs > 60 * 60 * 1000) {
    color = "yellow";
  } else {
    color = "red";
  }

  return { label, color };
}

const colorClasses = {
  green: "bg-green-50 border-green-200 text-green-800",
  yellow: "bg-yellow-50 border-yellow-200 text-yellow-800",
  red: "bg-red-50 border-red-200 text-red-800",
};

export default function DeadlineBanner() {
  const [deadlineState, setDeadlineState] = useState<DeadlineState | null>(null);
  const [notFound, setNotFound] = useState(false);

  async function fetchDeadline() {
    try {
      const res = await fetch("/api/deadline", { credentials: "include" });
      if (res.status === 404) {
        setNotFound(true);
        return;
      }
      if (!res.ok) {
        return;
      }
      const data = (await res.json()) as DeadlineState;
      setDeadlineState(data);
      setNotFound(false);
    } catch {
      // Network error — silently ignore, banner will retain previous state
    }
  }

  useEffect(() => {
    void fetchDeadline();

    const intervalId = setInterval(() => {
      void fetchDeadline();
    }, 60_000);

    return () => clearInterval(intervalId);
  }, []);

  // No deadline configured yet
  if (notFound) return null;

  // No data yet (initial load)
  if (!deadlineState) return null;

  // Wiped state — Phase 6 handles wipe screen
  if (deadlineState.state === "wiped") return null;

  if (deadlineState.state === "pending_wipe") {
    return (
      <div className="border rounded px-4 py-2 text-sm font-medium bg-red-100 border-red-400 text-red-900">
        Wipe pending — check in immediately
      </div>
    );
  }

  // Active state — show countdown
  const { label, color } = formatCountdown(deadlineState.deadline_at);

  return (
    <div
      className={`border rounded px-4 py-2 text-sm font-medium ${colorClasses[color]}`}
    >
      {label}
    </div>
  );
}
