"use client";

import React, { useEffect, useState } from "react";

interface SwUpdateToastProps {
  hasUnsavedText: boolean;
}

export default function SwUpdateToast({ hasUnsavedText }: SwUpdateToastProps) {
  const [waitingSW, setWaitingSW] = useState<ServiceWorker | null>(null);
  const [registration, setRegistration] =
    useState<ServiceWorkerRegistration | null>(null);

  useEffect(() => {
    if (!("serviceWorker" in navigator)) return;

    let reg: ServiceWorkerRegistration | null = null;

    navigator.serviceWorker
      .register("/sw.js", { scope: "/", updateViaCache: "none" })
      .then((r) => {
        reg = r;
        setRegistration(r);

        // Already waiting on mount
        if (r.waiting) {
          setWaitingSW(r.waiting);
        }

        // New SW installing
        r.addEventListener("updatefound", () => {
          const newWorker = r.installing;
          if (!newWorker) return;
          newWorker.addEventListener("statechange", () => {
            if (
              newWorker.state === "installed" &&
              navigator.serviceWorker.controller
            ) {
              setWaitingSW(newWorker);
            }
          });
        });
      })
      .catch(() => {
        // SW registration failed silently — not critical
      });

    // Handle controller change (after skipWaiting) — triggers reload
    const handleControllerChange = () => {
      window.location.reload();
    };
    navigator.serviceWorker.addEventListener(
      "controllerchange",
      handleControllerChange
    );

    return () => {
      navigator.serviceWorker.removeEventListener(
        "controllerchange",
        handleControllerChange
      );
    };
  }, []);

  if (!waitingSW) return null;

  const handleUpdate = () => {
    if (hasUnsavedText) {
      alert("Save or clear your text before updating.");
      return;
    }
    if (waitingSW) {
      waitingSW.postMessage({ type: "SKIP_WAITING" });
    }
  };

  return (
    <div
      role="alert"
      style={{
        position: "fixed",
        bottom: "1.5rem",
        right: "1.5rem",
        backgroundColor: "#1a1a1a",
        border: "1px solid #333",
        borderRadius: "0.5rem",
        padding: "0.875rem 1rem",
        color: "#e8e8e8",
        fontSize: "0.875rem",
        zIndex: 2000,
        display: "flex",
        alignItems: "center",
        gap: "0.75rem",
      }}
    >
      <span>Update available — restart to apply.</span>
      <button
        onClick={handleUpdate}
        style={{
          padding: "0.375rem 0.75rem",
          backgroundColor: "#e8e8e8",
          color: "#0a0a0a",
          border: "none",
          borderRadius: "0.25rem",
          cursor: "pointer",
          fontSize: "0.8125rem",
          fontWeight: 600,
          whiteSpace: "nowrap",
        }}
      >
        Update now
      </button>
    </div>
  );
}
