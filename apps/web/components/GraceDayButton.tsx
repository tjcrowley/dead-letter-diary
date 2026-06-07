"use client";

import { useState } from "react";

interface GraceDayButtonProps {
  graceBudget: number;
  onGraceUsed?: () => void;
}

/**
 * GraceDayButton — invokes a grace day to extend the deadline by 24 hours.
 * Shows remaining budget and handles 429 (exhausted) and 409 (not active) error states.
 */
export function GraceDayButton({ graceBudget, onGraceUsed }: GraceDayButtonProps) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleClick = async () => {
    setLoading(true);
    setError(null);

    try {
      const res = await fetch("/api/deadline/grace", {
        method: "POST",
        credentials: "include",
      });

      if (res.ok) {
        onGraceUsed?.();
      } else if (res.status === 429) {
        setError("Grace budget exhausted for this week");
      } else if (res.status === 409) {
        setError("Cannot invoke grace day — deadline has already passed");
      } else {
        setError("An error occurred. Please try again.");
      }
    } finally {
      setLoading(false);
    }
  };

  const isDisabled = graceBudget === 0 || loading;

  let label: string;
  if (loading) {
    label = "Applying...";
  } else if (graceBudget === 0) {
    label = "Grace day used this week";
  } else {
    label = "Invoke Grace Day (1 remaining this week)";
  }

  return (
    <div>
      <button
        onClick={handleClick}
        disabled={isDisabled}
        type="button"
      >
        {label}
      </button>
      {error && <p role="alert">{error}</p>}
    </div>
  );
}
