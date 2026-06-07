"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { performClientWipe } from "@/lib/wipe";

interface Props {
  className?: string;
}

export function PanicEncryptButton({ className }: Props) {
  const router = useRouter();
  const [showDialog, setShowDialog] = useState(false);
  const [typedValue, setTypedValue] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function openDialog() {
    setTypedValue("");
    setError(null);
    setShowDialog(true);
  }

  function closeDialog() {
    setShowDialog(false);
    setTypedValue("");
    setError(null);
  }

  async function handleConfirm() {
    if (typedValue !== "DESTROY") return;

    setLoading(true);
    setError(null);

    try {
      const res = await fetch("/api/wipe/panic", {
        method: "POST",
        credentials: "include",
      });

      if (res.ok) {
        await performClientWipe();
        router.replace("/wiped");
      } else {
        let message = "Panic wipe failed. Please try again.";
        try {
          const body = (await res.json()) as { error?: string };
          if (body.error) message = body.error;
        } catch {
          // ignore parse error
        }
        setError(message);
        setLoading(false);
      }
    } catch {
      setError("Network error. Please check your connection.");
      setLoading(false);
    }
  }

  return (
    <>
      <button
        type="button"
        onClick={openDialog}
        className={
          className ??
          "px-4 py-2 bg-red-700 hover:bg-red-800 text-white rounded text-sm font-medium"
        }
      >
        Panic Encrypt (destroy diary)
      </button>

      {showDialog && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70">
          <div className="bg-neutral-900 border border-neutral-700 rounded-lg p-6 max-w-md w-full mx-4 space-y-4">
            <h2 className="text-lg font-semibold text-neutral-100">
              Confirm Destruction
            </h2>

            <p className="text-sm text-neutral-300">
              This will permanently destroy your diary. This cannot be undone.
            </p>

            <p className="text-sm text-neutral-400">
              Type <span className="font-mono text-red-400">DESTROY</span> to
              confirm:
            </p>

            <input
              type="text"
              value={typedValue}
              onChange={(e) => setTypedValue(e.target.value)}
              placeholder="Type DESTROY"
              className="w-full px-3 py-2 bg-neutral-800 border border-neutral-600 rounded text-neutral-100 text-sm font-mono placeholder:text-neutral-600 focus:outline-none focus:border-red-500"
              autoComplete="off"
              autoFocus
            />

            {error && (
              <p className="text-sm text-red-400">{error}</p>
            )}

            <div className="flex gap-3 justify-end">
              <button
                type="button"
                onClick={closeDialog}
                disabled={loading}
                className="px-4 py-2 text-sm text-neutral-400 hover:text-neutral-200 disabled:opacity-50"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleConfirm}
                disabled={typedValue !== "DESTROY" || loading}
                className="px-4 py-2 bg-red-700 hover:bg-red-800 disabled:opacity-40 disabled:cursor-not-allowed text-white rounded text-sm font-medium"
              >
                {loading ? "Destroying..." : "Confirm"}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}

export default PanicEncryptButton;
