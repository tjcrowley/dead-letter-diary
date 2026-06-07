"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { api } from "@/lib/api";
import { registerPasskey } from "@/lib/webauthn";

type Step = "create-account" | "enroll-passkey";

export default function SetupPage() {
  const router = useRouter();
  const [step, setStep] = useState<Step>("create-account");
  const [passphrase, setPassphrase] = useState("");
  const [confirm, setConfirm] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [prfStatus, setPrfStatus] = useState<boolean | null>(null);

  async function handleCreateAccount(e: React.FormEvent) {
    e.preventDefault();
    setError("");

    if (passphrase.length < 12) {
      setError("Passphrase must be at least 12 characters.");
      return;
    }
    if (passphrase !== confirm) {
      setError("Passphrases do not match.");
      return;
    }

    setLoading(true);
    try {
      await api.post("/api/auth/register", { passphrase });
      setStep("enroll-passkey");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Account creation failed.");
    } finally {
      setLoading(false);
    }
  }

  async function handleRegisterPasskey() {
    setError("");
    setLoading(true);
    try {
      const result = await registerPasskey();
      setPrfStatus(result.prfCapable);
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Passkey registration failed."
      );
    } finally {
      setLoading(false);
    }
  }

  function handleContinue() {
    router.push("/");
  }

  return (
    <div style={styles.container}>
      <h1 style={styles.title}>Dead Letter Diary</h1>
      <p style={styles.subtitle}>First-time setup</p>

      {step === "create-account" && (
        <form onSubmit={handleCreateAccount} style={styles.card}>
          <h2 style={styles.cardTitle}>Step 1: Create Account</h2>
          <p style={styles.hint}>
            Choose a strong passphrase (12+ characters). This is your fallback
            if biometrics are unavailable.
          </p>

          <label style={styles.label}>
            Passphrase
            <input
              type="password"
              value={passphrase}
              onChange={(e) => setPassphrase(e.target.value)}
              placeholder="Enter passphrase (12+ chars)"
              style={styles.input}
              autoComplete="new-password"
              minLength={12}
              required
            />
          </label>

          <label style={styles.label}>
            Confirm Passphrase
            <input
              type="password"
              value={confirm}
              onChange={(e) => setConfirm(e.target.value)}
              placeholder="Confirm passphrase"
              style={styles.input}
              autoComplete="new-password"
              required
            />
          </label>

          {error && <p style={styles.error}>{error}</p>}

          <button type="submit" disabled={loading} style={styles.button}>
            {loading ? "Creating..." : "Create Account"}
          </button>
        </form>
      )}

      {step === "enroll-passkey" && (
        <div style={styles.card}>
          <h2 style={styles.cardTitle}>Step 2: Register Passkey</h2>
          <p style={styles.hint}>
            Register a passkey to unlock with Face ID, Touch ID, or Windows
            Hello.
          </p>

          {prfStatus === null ? (
            <>
              {error && <p style={styles.error}>{error}</p>}
              <button
                onClick={handleRegisterPasskey}
                disabled={loading}
                style={styles.button}
              >
                {loading ? "Registering..." : "Register Passkey"}
              </button>
            </>
          ) : (
            <>
              <p style={styles.success}>Passkey registered successfully.</p>
              <p style={styles.prfInfo}>
                PRF: {prfStatus ? "Supported" : "Not supported"}
              </p>
              {!prfStatus && (
                <p style={styles.prfWarning}>
                  Your device does not support PRF. You will use your passphrase
                  for encryption key derivation.
                </p>
              )}
              <button onClick={handleContinue} style={styles.button}>
                Continue to Diary
              </button>
            </>
          )}
        </div>
      )}
    </div>
  );
}

const styles: Record<string, React.CSSProperties> = {
  container: {
    display: "flex",
    flexDirection: "column",
    alignItems: "center",
    justifyContent: "center",
    minHeight: "100vh",
    padding: "2rem",
  },
  title: {
    fontSize: "clamp(2rem, 6vw, 3rem)",
    fontWeight: 700,
    letterSpacing: "-0.02em",
    margin: 0,
  },
  subtitle: {
    fontSize: "1.1rem",
    color: "#888",
    marginTop: "0.5rem",
    marginBottom: "2rem",
    fontStyle: "italic",
  },
  card: {
    width: "100%",
    maxWidth: "420px",
    padding: "2rem",
    border: "1px solid #333",
    borderRadius: "8px",
    backgroundColor: "#111",
  },
  cardTitle: {
    fontSize: "1.25rem",
    fontWeight: 600,
    marginBottom: "0.75rem",
  },
  hint: {
    fontSize: "0.9rem",
    color: "#999",
    marginBottom: "1.5rem",
    lineHeight: 1.5,
  },
  label: {
    display: "flex",
    flexDirection: "column",
    fontSize: "0.9rem",
    color: "#ccc",
    marginBottom: "1rem",
    gap: "0.4rem",
  },
  input: {
    padding: "0.75rem",
    fontSize: "1rem",
    backgroundColor: "#1a1a1a",
    border: "1px solid #444",
    borderRadius: "6px",
    color: "#e8e8e8",
    outline: "none",
  },
  button: {
    width: "100%",
    padding: "0.85rem",
    fontSize: "1rem",
    fontWeight: 600,
    backgroundColor: "#e8e8e8",
    color: "#0a0a0a",
    border: "none",
    borderRadius: "6px",
    cursor: "pointer",
    marginTop: "0.5rem",
  },
  error: {
    color: "#ff4444",
    fontSize: "0.9rem",
    marginBottom: "0.75rem",
  },
  success: {
    color: "#44bb44",
    fontSize: "1rem",
    marginBottom: "0.5rem",
  },
  prfInfo: {
    fontSize: "0.9rem",
    color: "#aaa",
    marginBottom: "0.5rem",
  },
  prfWarning: {
    fontSize: "0.85rem",
    color: "#cc9944",
    marginBottom: "1rem",
    lineHeight: 1.4,
  },
};
