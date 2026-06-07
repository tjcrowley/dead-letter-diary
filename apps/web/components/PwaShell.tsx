"use client";

import React from "react";
import WkWebViewGuard from "./WkWebViewGuard";
import PrivateModeGuard from "./PrivateModeGuard";
import InstallPrompt from "./InstallPrompt";
import SwUpdateToast from "./SwUpdateToast";
import EncryptionBadge from "./EncryptionBadge";

interface PwaShellProps {
  children: React.ReactNode;
  hasUnsavedText?: boolean;
}

export default function PwaShell({
  children,
  hasUnsavedText = false,
}: PwaShellProps) {
  return (
    <>
      <WkWebViewGuard>
        <PrivateModeGuard>{children}</PrivateModeGuard>
      </WkWebViewGuard>
      <InstallPrompt />
      <SwUpdateToast hasUnsavedText={hasUnsavedText} />
      <div
        style={{
          position: "fixed",
          bottom: "0.5rem",
          left: "50%",
          transform: "translateX(-50%)",
          zIndex: 100,
        }}
      >
        <EncryptionBadge />
      </div>
    </>
  );
}
