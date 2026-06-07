"use client";

export default function OfflinePage() {
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
      <h1 style={{ fontSize: "1.5rem", marginBottom: "1rem" }}>
        You&apos;re offline
      </h1>
      <p style={{ color: "#888", maxWidth: "28rem", lineHeight: 1.6 }}>
        Dead Letter Diary requires a network connection to load for the first
        time. Once installed, you can write offline.
      </p>
      <button
        onClick={() => window.location.reload()}
        style={{
          marginTop: "2rem",
          padding: "0.625rem 1.5rem",
          backgroundColor: "#1a1a1a",
          color: "#e8e8e8",
          border: "1px solid #333",
          borderRadius: "0.375rem",
          cursor: "pointer",
          fontSize: "0.875rem",
        }}
      >
        Try again
      </button>
    </div>
  );
}
