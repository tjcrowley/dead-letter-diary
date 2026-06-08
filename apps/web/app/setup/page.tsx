"use client";

import { useState, useRef } from "react";
import { useRouter } from "next/navigation";
import { api } from "@/lib/api";
import { registerPasskey, authenticatePasskey } from "@/lib/webauthn";
import {
  generateDmk,
  wrapDmk,
  deriveShardFromPassphrase,
  uint8ToBase64url,
  base64urlToUint8,
} from "@/lib/crypto";
import { setSessionDmk } from "@/lib/session-dmk";

type Step =
  | "create-account"
  | "enroll-passkey"
  | "diary-name"
  | "commitment"
  | "acknowledgment";

const TOTAL_STEPS = 5;
const STEP_NUMBERS: Record<Step, number> = {
  "create-account": 1,
  "enroll-passkey": 2,
  "diary-name": 3,
  commitment: 4,
  acknowledgment: 5,
};

export default function SetupPage() {
  const router = useRouter();

  // Step tracking
  const [step, setStep] = useState<Step>("create-account");

  // Step 1: create-account
  const [passphrase, setPassphrase] = useState("");
  const [confirm, setConfirm] = useState("");

  // Step 2: enroll-passkey
  const [prfStatus, setPrfStatus] = useState<boolean | null>(null);

  // Step 3: diary-name
  const [diaryName, setDiaryName] = useState("");

  // Step 4: commitment
  const [windowHours, setWindowHours] = useState(24);
  const [wordMinimum, setWordMinimum] = useState(50);

  // Step 5: acknowledgment
  const [acknowledged, setAcknowledged] = useState(false);

  // Shared
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  // Key ceremony state (persists across steps)
  const dmkRef = useRef<CryptoKey | null>(null);
  const serverShardRef = useRef<Uint8Array | null>(null);
  const hkdfSaltRef = useRef<Uint8Array | null>(null);

  // ── Step 1: Create Account ──────────────────────────────────────────────────
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
      const result = await api.post<{ id: string; hkdfSalt: string }>(
        "/api/auth/register",
        { passphrase }
      );

      // Key ceremony: generate DMK, split into shards, store server shard + passphrase key wrap
      const salt = base64urlToUint8(result.hkdfSalt);
      hkdfSaltRef.current = salt;

      const deviceShard = await deriveShardFromPassphrase(passphrase, salt);
      const serverShard = crypto.getRandomValues(new Uint8Array(32));
      serverShardRef.current = serverShard;

      await api.post("/api/crypto/shard", {
        shard: uint8ToBase64url(serverShard),
      });

      const dmk = await generateDmk();
      dmkRef.current = dmk;

      const { wrappedDmk, wrapIv } = await wrapDmk(dmk, deviceShard, serverShard, salt);
      await api.post("/api/crypto/key-wrap", {
        wrappedDmk: uint8ToBase64url(new Uint8Array(wrappedDmk)),
        wrapIv: uint8ToBase64url(wrapIv),
        wrapType: "passphrase",
      });

      setSessionDmk(dmk);
      setStep("enroll-passkey");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Account creation failed.");
    } finally {
      setLoading(false);
    }
  }

  // ── Step 2: Enroll Passkey ──────────────────────────────────────────────────
  async function handleRegisterPasskey() {
    setError("");
    setLoading(true);
    try {
      const result = await registerPasskey();
      setPrfStatus(result.prfCapable);

      // If device supports PRF, create a PRF-backed key wrap for passwordless unlock
      if (
        result.prfCapable &&
        dmkRef.current &&
        serverShardRef.current &&
        hkdfSaltRef.current
      ) {
        try {
          const authResult = await authenticatePasskey();
          if (authResult.prfResult) {
            const prfShard = new Uint8Array(authResult.prfResult as ArrayBuffer).slice(0, 32);
            const { wrappedDmk, wrapIv } = await wrapDmk(
              dmkRef.current,
              prfShard,
              serverShardRef.current,
              hkdfSaltRef.current
            );
            await api.post("/api/crypto/key-wrap", {
              wrappedDmk: uint8ToBase64url(new Uint8Array(wrappedDmk)),
              wrapIv: uint8ToBase64url(wrapIv),
              wrapType: "webauthn_prf",
              credentialId: result.credentialId,
            });
          }
        } catch {
          // PRF wrap failed — passphrase wrap still covers unlock
        }
      }
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Passkey registration failed."
      );
    } finally {
      setLoading(false);
    }
  }

  function handlePasskeyContinue() {
    setStep("diary-name");
  }

  // ── Step 3: Diary Name ──────────────────────────────────────────────────────
  async function handleDiaryName(e: React.FormEvent) {
    e.preventDefault();
    setError("");

    const trimmed = diaryName.trim();
    if (!trimmed) {
      setError("Please enter a name for your diary.");
      return;
    }
    if (trimmed.length > 80) {
      setError("Diary name must be 80 characters or fewer.");
      return;
    }

    setLoading(true);
    try {
      await api.patch("/api/settings", {
        diary_name: trimmed,
        timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
      });
      setStep("commitment");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to save diary name.");
    } finally {
      setLoading(false);
    }
  }

  // ── Step 4: Commitment ──────────────────────────────────────────────────────
  async function handleCommitment(e: React.FormEvent) {
    e.preventDefault();
    setError("");

    setLoading(true);
    try {
      await api.post("/api/deadline/settings", {
        window_hours: windowHours,
        word_minimum: wordMinimum,
        timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
      });
      setStep("acknowledgment");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to save commitment settings.");
    } finally {
      setLoading(false);
    }
  }

  // ── Step 5: Acknowledgment ──────────────────────────────────────────────────
  function handleBeginWriting() {
    router.push("/write");
  }

  // ── Render ──────────────────────────────────────────────────────────────────
  const currentStepNum = STEP_NUMBERS[step];

  return (
    <div style={styles.container}>
      <h1 style={styles.title}>Dead Letter Diary</h1>
      <p style={styles.subtitle}>First-time setup</p>
      <p style={styles.stepIndicator}>
        Step {currentStepNum} of {TOTAL_STEPS}
      </p>

      {/* ── Step 1: Create Account ── */}
      {step === "create-account" && (
        <form onSubmit={handleCreateAccount} style={styles.card}>
          <h2 style={styles.cardTitle}>Create Account</h2>
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
            {loading ? "Creating account…" : "Create Account"}
          </button>
        </form>
      )}

      {/* ── Step 2: Enroll Passkey ── */}
      {step === "enroll-passkey" && (
        <div style={styles.card}>
          <h2 style={styles.cardTitle}>Register Passkey</h2>
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
                {loading ? "Registering…" : "Register Passkey"}
              </button>
            </>
          ) : (
            <>
              <p style={styles.success}>Passkey registered successfully.</p>
              <p style={styles.prfInfo}>
                PRF: {prfStatus ? "Supported — passwordless unlock enabled" : "Not supported"}
              </p>
              {!prfStatus && (
                <p style={styles.prfWarning}>
                  Your device does not support PRF. You will use your passphrase
                  for encryption key derivation.
                </p>
              )}
              <button onClick={handlePasskeyContinue} style={styles.button}>
                Continue
              </button>
            </>
          )}
        </div>
      )}

      {/* ── Step 3: Diary Name ── */}
      {step === "diary-name" && (
        <form onSubmit={handleDiaryName} style={styles.card}>
          <h2 style={styles.cardTitle}>Name Your Diary</h2>
          <p style={styles.hint}>
            Give your diary a name. This is only visible to you and helps
            identify it across devices.
          </p>

          <label style={styles.label}>
            Diary Name
            <input
              type="text"
              value={diaryName}
              onChange={(e) => setDiaryName(e.target.value)}
              placeholder="e.g. My Dead Letter Diary"
              style={styles.input}
              maxLength={80}
              required
            />
          </label>

          {error && <p style={styles.error}>{error}</p>}

          <button type="submit" disabled={loading} style={styles.button}>
            {loading ? "Saving..." : "Continue"}
          </button>
        </form>
      )}

      {/* ── Step 4: Commitment ── */}
      {step === "commitment" && (
        <form onSubmit={handleCommitment} style={styles.card}>
          <h2 style={styles.cardTitle}>Set Your Commitment</h2>
          <p style={styles.hint}>
            How often must you check in, and how much must you write? These
            are your commitments — strengthening them takes effect immediately,
            but relaxing them requires a 7-day waiting period.
          </p>

          <label style={styles.label}>
            Check-in window (hours)
            <input
              type="number"
              value={windowHours}
              onChange={(e) => setWindowHours(Number(e.target.value))}
              min={12}
              max={168}
              style={styles.input}
              required
            />
          </label>

          <label style={styles.label}>
            Word minimum per check-in
            <input
              type="number"
              value={wordMinimum}
              onChange={(e) => setWordMinimum(Number(e.target.value))}
              min={25}
              max={500}
              style={styles.input}
              required
            />
          </label>

          {error && <p style={styles.error}>{error}</p>}

          <button type="submit" disabled={loading} style={styles.button}>
            {loading ? "Saving..." : "Set Commitment"}
          </button>
        </form>
      )}

      {/* ── Step 5: Acknowledgment ── */}
      {step === "acknowledgment" && (
        <div style={{ ...styles.card, ...styles.dangerCard }}>
          <h2 style={{ ...styles.cardTitle, color: "#ff4444" }}>
            No Recovery
          </h2>
          <p style={styles.hint}>
            If your deadline passes without a check-in, this diary will be
            permanently and cryptographically destroyed. There is no backup,
            no recovery, no second chance. The data will be gone forever.
          </p>

          <label style={styles.checkboxLabel}>
            <input
              type="checkbox"
              checked={acknowledged}
              onChange={(e) => setAcknowledged(e.target.checked)}
              style={styles.checkbox}
            />
            I understand this diary can be permanently destroyed
          </label>

          <button
            onClick={handleBeginWriting}
            disabled={!acknowledged}
            style={{
              ...styles.button,
              ...(acknowledged ? {} : styles.buttonDisabled),
            }}
          >
            Begin Writing
          </button>
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
    marginBottom: "0.5rem",
    fontStyle: "italic",
  },
  stepIndicator: {
    fontSize: "0.85rem",
    color: "#666",
    marginBottom: "2rem",
    letterSpacing: "0.05em",
    textTransform: "uppercase",
  },
  card: {
    width: "100%",
    maxWidth: "420px",
    padding: "2rem",
    border: "1px solid #333",
    borderRadius: "8px",
    backgroundColor: "#111",
  },
  dangerCard: {
    border: "1px solid #882222",
    backgroundColor: "#130a0a",
  },
  cardTitle: {
    fontSize: "1.25rem",
    fontWeight: 600,
    marginBottom: "0.75rem",
    marginTop: 0,
  },
  hint: {
    fontSize: "0.9rem",
    color: "#999",
    marginBottom: "1.5rem",
    lineHeight: 1.5,
    marginTop: 0,
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
  buttonDisabled: {
    backgroundColor: "#333",
    color: "#666",
    cursor: "not-allowed",
  },
  checkboxLabel: {
    display: "flex",
    alignItems: "flex-start",
    gap: "0.75rem",
    fontSize: "0.9rem",
    color: "#ccc",
    marginBottom: "1.5rem",
    cursor: "pointer",
    lineHeight: 1.5,
  },
  checkbox: {
    marginTop: "0.15rem",
    flexShrink: 0,
    width: "16px",
    height: "16px",
    cursor: "pointer",
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
