import type { Metadata } from "next";
import PwaShell from "../components/PwaShell";

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
        <PwaShell hasUnsavedText={false}>{children}</PwaShell>
      </body>
    </html>
  );
}
