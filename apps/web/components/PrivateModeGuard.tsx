"use client";

import React, { useEffect, useState } from "react";
import { detectPrivateMode } from "@/lib/storage";

interface PrivateModeGuardProps {
  children: React.ReactNode;
}

export default function PrivateModeGuard({ children }: PrivateModeGuardProps) {
  const [isPrivate, setIsPrivate] = useState<boolean | null>(null);

  useEffect(() => {
    detectPrivateMode().then((result) => {
      setIsPrivate(result);
    });
  }, []);

  // Detection still in progress — avoid flash
  if (isPrivate === null) return null;

  // Private mode detected — show refusal screen
  if (isPrivate === true) {
    return (
      <div
        style={{
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          minHeight: "100vh",
          backgroundColor: "#0a0a0a",
          color: "#e8e8e8",
          padding: "2rem",
          textAlign: "center",
        }}
      >
        <h1
          style={{
            fontSize: "1.5rem",
            fontWeight: 700,
            marginBottom: "1rem",
          }}
        >
          Private browsing not supported
        </h1>
        <p
          style={{
            fontSize: "1rem",
            lineHeight: 1.6,
            maxWidth: "480px",
            color: "#aaa",
          }}
        >
          Dead Letter Diary requires persistent storage to keep your encrypted
          entries safe. Private / incognito mode does not support this. Please
          open the diary in a regular browser tab.
        </p>
      </div>
    );
  }

  return <>{children}</>;
}
