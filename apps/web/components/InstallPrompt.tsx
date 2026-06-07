"use client";

import React, { useEffect, useState } from "react";

type BeforeInstallPromptEvent = Event & {
  prompt: () => Promise<{ outcome: string }>;
};

function isIOS(): boolean {
  if (typeof navigator === "undefined") return false;
  return /iPhone|iPad|iPod/.test(navigator.userAgent);
}

function isStandalone(): boolean {
  if (typeof window === "undefined") return false;
  return window.matchMedia("(display-mode: standalone)").matches;
}

export default function InstallPrompt() {
  const [dismissed, setDismissed] = useState(false);
  const [deferredPrompt, setDeferredPrompt] =
    useState<BeforeInstallPromptEvent | null>(null);
  const [installed, setInstalled] = useState(false);

  useEffect(() => {
    // Check sessionStorage for previous dismissal
    if (sessionStorage.getItem("install-prompt-dismissed") === "1") {
      setDismissed(true);
    }

    const handleBeforeInstallPrompt = (e: Event) => {
      e.preventDefault();
      setDeferredPrompt(e as BeforeInstallPromptEvent);
    };

    const handleAppInstalled = () => {
      setInstalled(true);
      setDeferredPrompt(null);
    };

    window.addEventListener("beforeinstallprompt", handleBeforeInstallPrompt);
    window.addEventListener("appinstalled", handleAppInstalled);

    return () => {
      window.removeEventListener(
        "beforeinstallprompt",
        handleBeforeInstallPrompt
      );
      window.removeEventListener("appinstalled", handleAppInstalled);
    };
  }, []);

  if (dismissed || installed) return null;

  // iOS coaching path
  if (isIOS() && !isStandalone()) {
    return (
      <div
        style={{
          position: "fixed",
          bottom: "1rem",
          left: "1rem",
          right: "1rem",
          backgroundColor: "#1a1a1a",
          border: "1px solid #333",
          borderRadius: "0.5rem",
          padding: "1rem",
          color: "#e8e8e8",
          fontSize: "0.875rem",
          lineHeight: 1.5,
          zIndex: 1000,
        }}
      >
        <p style={{ margin: "0 0 0.75rem" }}>
          To install: tap the{" "}
          <strong>Share</strong> button (the box with an arrow), then tap{" "}
          <strong>Add to Home Screen</strong>.
        </p>
        <button
          onClick={() => {
            sessionStorage.setItem("install-prompt-dismissed", "1");
            setDismissed(true);
          }}
          style={{
            padding: "0.375rem 0.75rem",
            backgroundColor: "transparent",
            color: "#888",
            border: "1px solid #444",
            borderRadius: "0.25rem",
            cursor: "pointer",
            fontSize: "0.75rem",
          }}
        >
          Dismiss
        </button>
      </div>
    );
  }

  // Desktop/Android: beforeinstallprompt path
  if (deferredPrompt) {
    return (
      <div
        style={{
          position: "fixed",
          bottom: "1rem",
          left: "1rem",
          backgroundColor: "#1a1a1a",
          border: "1px solid #333",
          borderRadius: "0.5rem",
          padding: "1rem",
          color: "#e8e8e8",
          fontSize: "0.875rem",
          zIndex: 1000,
        }}
      >
        <button
          onClick={async () => {
            if (deferredPrompt) {
              await deferredPrompt.prompt();
              setDeferredPrompt(null);
            }
          }}
          style={{
            padding: "0.5rem 1rem",
            backgroundColor: "#e8e8e8",
            color: "#0a0a0a",
            border: "none",
            borderRadius: "0.25rem",
            cursor: "pointer",
            fontSize: "0.875rem",
            fontWeight: 600,
          }}
        >
          Install app
        </button>
      </div>
    );
  }

  return null;
}
