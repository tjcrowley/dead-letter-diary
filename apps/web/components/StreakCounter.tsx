"use client";

import { useEffect, useState } from "react";

interface StreakResponse {
  streak: number;
  last_entry_date: string | null;
}

export default function StreakCounter() {
  const [streak, setStreak] = useState<number | null>(null);

  useEffect(() => {
    fetch("/api/entries/streak", { credentials: "include" })
      .then(async (res) => {
        if (!res.ok) return;
        const data = (await res.json()) as StreakResponse;
        setStreak(data.streak);
      })
      .catch(() => {
        // Network error — render nothing
      });
  }, []);

  if (streak === null) return null;

  if (streak === 0) {
    return (
      <span style={{ color: "#888", fontSize: "0.9rem" }}>
        No streak yet — start writing!
      </span>
    );
  }

  return (
    <span style={{ color: "#44bb44", fontWeight: 600 }}>
      🔥 {streak} day streak
    </span>
  );
}
