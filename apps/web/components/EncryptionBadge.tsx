import React from "react";

export default function EncryptionBadge() {
  return (
    <div
      aria-label="End-to-end encrypted"
      style={{
        display: "flex",
        alignItems: "center",
        gap: "0.3rem",
        fontSize: "0.75rem",
        color: "#888",
      }}
    >
      <svg
        width="12"
        height="12"
        viewBox="0 0 12 12"
        fill="none"
        aria-hidden="true"
        xmlns="http://www.w3.org/2000/svg"
      >
        <rect
          x="1.5"
          y="5"
          width="9"
          height="6.5"
          rx="1"
          stroke="#888"
          strokeWidth="1"
        />
        <path
          d="M3.5 5V3.5C3.5 2.12 4.62 1 6 1C7.38 1 8.5 2.12 8.5 3.5V5"
          stroke="#888"
          strokeWidth="1"
          strokeLinecap="round"
        />
        <circle cx="6" cy="8.25" r="0.75" fill="#888" />
      </svg>
      E2E encrypted
    </div>
  );
}
