"use client";

import { useEffect, useState } from "react";

export default function WipedPage() {
  const [epitaph, setEpitaph] = useState<string | null>(null);

  useEffect(() => {
    // Clear session cookie on mount — belt-and-suspenders cleanup
    document.cookie = "session=; Max-Age=0; path=/; Secure; SameSite=Strict";

    // Fetch epitaph if set
    fetch("/api/account/epitaph", { credentials: "include" })
      .then((res) => {
        if (res.ok) return res.json() as Promise<{ epitaph: string | null }>;
        return { epitaph: null };
      })
      .then((data) => {
        setEpitaph(data.epitaph ?? null);
      })
      .catch(() => {
        // Non-critical — proceed without epitaph
      });
  }, []);

  return (
    <div className="min-h-screen flex flex-col items-center justify-center bg-neutral-950 text-neutral-200 px-4">
      <div className="max-w-md w-full text-center space-y-6">
        {/* Gravestone border accent */}
        <div className="mx-auto w-16 h-1 bg-neutral-700 rounded" />

        <h1 className="text-3xl font-bold tracking-widest text-neutral-100 uppercase">
          Dead Letter Diary
        </h1>

        {epitaph && (
          <p className="text-base italic text-neutral-400 leading-relaxed">
            {epitaph}
          </p>
        )}

        <div className="mx-auto w-16 h-1 bg-neutral-700 rounded" />

        <p className="text-sm text-neutral-600">
          This diary has been permanently destroyed.
        </p>
      </div>
    </div>
  );
}
