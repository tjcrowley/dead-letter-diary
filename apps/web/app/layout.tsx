import type { Metadata } from "next";

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
        {children}
      </body>
    </html>
  );
}
