"use client";

import React from "react";

const IN_APP_BROWSER_PATTERNS = [
  "FBAN",
  "FBAV",
  "Instagram",
  "Twitter",
  "Line",
  "MiuiBrowser",
];

function isWkWebView(ua: string): boolean {
  const isIOS = /iPhone|iPad|iPod/.test(ua);
  const isAndroidWebView = /wv\)/.test(ua);

  if (isAndroidWebView) return true;

  if (!isIOS) return false;

  // iOS in-app browser: has known patterns
  if (IN_APP_BROWSER_PATTERNS.some((p) => ua.includes(p))) return true;

  // iOS WKWebView: has Mobile/ but lacks Safari/ token
  if (/Mobile\//.test(ua) && !/Safari\//.test(ua)) return true;

  return false;
}

interface WkWebViewGuardProps {
  children: React.ReactNode;
}

export default function WkWebViewGuard({ children }: WkWebViewGuardProps) {
  const ua = typeof navigator !== "undefined" ? navigator.userAgent : "";

  if (isWkWebView(ua)) {
    return (
      <div
        style={{
          minHeight: "100vh",
          backgroundColor: "#0a0a0a",
          color: "#e8e8e8",
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          padding: "2rem",
          textAlign: "center",
          fontFamily:
            "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif",
        }}
      >
        <h1 style={{ fontSize: "1.25rem", marginBottom: "1rem" }}>
          Open in Safari to use Dead Letter Diary
        </h1>
        <p style={{ color: "#888", maxWidth: "24rem", lineHeight: 1.6 }}>
          Tap the share button and choose &quot;Open in Safari&quot; or
          &quot;Open in Browser&quot;.
        </p>
      </div>
    );
  }

  return <>{children}</>;
}
