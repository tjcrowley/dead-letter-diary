import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Dead Letter Diary",
  description: "A commitment device for writers",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
