import type { Metadata } from "next";
import PwaShell from "../components/PwaShell";
import DeadlineBanner from "../components/DeadlineBanner";
import StreakCounter from "../components/StreakCounter";
import Link from "next/link";

export const metadata: Metadata = {
  title: "Dead Letter Diary",
  description: "A diary with a dead man's switch",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <head>
        <link rel="apple-touch-icon" href="/apple-touch-icon.png" />
      </head>
      <body
        style={{
          margin: 0,
          padding: 0,
          fontFamily:
            "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif",
          backgroundColor: "#0a0a0a",
          color: "#e8e8e8",
          minHeight: "100vh",
        }}
      >
        <PwaShell hasUnsavedText={false}>
          <div
            style={{
              borderBottom: "1px solid #222",
              backgroundColor: "#0d0d0d",
              padding: "0.5rem 1rem",
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              gap: "1rem",
              flexWrap: "wrap",
            }}
          >
            <nav
              style={{
                display: "flex",
                gap: "1.25rem",
                alignItems: "center",
              }}
            >
              <Link
                href="/write"
                style={{
                  color: "#e8e8e8",
                  textDecoration: "none",
                  fontSize: "0.9rem",
                  fontWeight: 500,
                }}
              >
                Write
              </Link>
              <Link
                href="/entries"
                style={{
                  color: "#e8e8e8",
                  textDecoration: "none",
                  fontSize: "0.9rem",
                  fontWeight: 500,
                }}
              >
                Past Entries
              </Link>
              <Link
                href="/settings"
                style={{
                  color: "#e8e8e8",
                  textDecoration: "none",
                  fontSize: "0.9rem",
                  fontWeight: 500,
                }}
              >
                Settings
              </Link>
            </nav>
            <StreakCounter />
          </div>
          <div
            style={{
              padding: "0.5rem 1rem",
              display: "flex",
              justifyContent: "center",
            }}
          >
            <DeadlineBanner />
          </div>
          {children}
        </PwaShell>
      </body>
    </html>
  );
}
