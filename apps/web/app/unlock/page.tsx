"use client";

import { useState, useCallback } from "react";
import { useRouter } from "next/navigation";
import { api } from "@/lib/api";
import { authenticatePasskey } from "@/lib/webauthn";

const PIN_STORAGE_KEY = "dld_pin";

export default function UnlockPage() {
  const router = useRouter();

  // Biometric state
  const [bioLoading, setBioLoading] = useState(false);
  const [bioError, setBioError] = useState("");

  // Passphrase state
  const [passphrase, setPassphrase] = useState("");
  const [passLoading, setPassLoading] = useState(false);
  const [passError, setPassError] = useState("");

  // PIN state
  const [pin, setPin] = useState("");
  const [pinConfirm, setPinConfirm] = useState("");
  const [pinError, setPinError] = useState("");
  const [pinLoading, setPinLoading] = useState(false);
  const [settingPin, setSettingPin] = useState(false);

  const hasPin =
    typeof window !== "undefined" && !!sessionStorage.getItem(PIN_STORAGE_KEY);

  const handleBiometric = useCallback(async () => {
    setBioError("");
    setBioLoading(true);
    try {
      await authenticatePasskey();
      router.push("/");
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Biometric unlock failed.";
      if (msg.toLowerCase().includes("no account") || msg.toLowerCase().includes("not found")) {
        setBioError("No account found. Go to /setup to create one.");
      } else {
        setBioError(msg);
      }
    } finally {
      setBioLoading(false);
    }
  }, [router]);

  async function handlePassphrase(e: React.FormEvent) {
    e.preventDefault();
    setPassError("");
    setPassLoading(true);
    try {
      await api.post("/api/auth/unlock", { passphrase });
      router.push("/");
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Unlock failed.";
      if (msg.toLowerCase().includes("no account") || msg.toLowerCase().includes("not found")) {
        setPassError("No account found. Go to /setup to create one.");
      } else {
        setPassError(msg);
      }
    } finally {
      setPassLoading(false);
    }
  }

  function handleSetPin(e: React.FormEvent) {
    e.preventDefault();
    setPinError("");

    if (pin.length < 4 || pin.length > 6 || !/^\d+$/.test(pin)) {
      setPinError("PIN must be 4-6 digits.");
      return;
    }
    if (pin !== pinConfirm) {
      setPinError("PINs do not match.");
      return;
    }

    sessionStorage.setItem(PIN_STORAGE_KEY, pin);
    setSettingPin(false);
    setPin("");
    setPinConfirm("");
  }

  async function handlePinUnlock(e: React.FormEvent) {
    e.preventDefault();
    setPinError("");
    setPinLoading(true);

    const storedPin = sessionStorage.getItem(PIN_STORAGE_KEY);
    if (pin !== storedPin) {
      setPinError("Incorrect PIN.");
      setPinLoading(false);
      return;
    }

    // PIN matched -- check if session cookie is still valid (no server round-trip for PIN itself)
    try {
      await api.get("/api/auth/me");
      router.push("/");
    } catch {
      sessionStorage.removeItem(PIN_STORAGE_KEY);
      setPinError("Session expired. Use passphrase or biometric to unlock.");
    } finally {
      setPinLoading(false);
    }
  }

  return (
    <div style={styles.container}>
      <h1 style={styles.title}>Dead Letter Diary</h1>
      <p style={styles.subtitle}>Unlock your diary</p>

      <div style={styles.methods}>
        {/* Biometric unlock */}
        <div style={styles.card}>
          <h2 style={styles.cardTitle}>Biometric Unlock</h2>
          <p style={styles.hint}>Use Face ID, Touch ID, or Windows Hello.</p>
          {bioError && <p style={styles.error}>{bioError}</p>}
          <button
            onClick={handleBiometric}
            disabled={bioLoading}
            style={styles.button}
          >
            {bioLoading ? "Authenticating..." : "Unlock with Biometric"}
          </button>
        </div>

        {/* Passphrase unlock */}
        <div style={styles.card}>
          <h2 style={styles.cardTitle}>Passphrase</h2>
          <form onSubmit={handlePassphrase}>
            <label style={styles.label}>
              <input
                type="password"
                value={passphrase}
                onChange={(e) => setPassphrase(e.target.value)}
                placeholder="Enter your passphrase"
                style={styles.input}
                autoComplete="current-password"
                required
              />
            </label>
            {passError && <p style={styles.error}>{passError}</p>}
            <button type="submit" disabled={passLoading} style={styles.button}>
              {passLoading ? "Unlocking..." : "Unlock"}
            </button>
          </form>
        </div>
      </div>

      {/* PIN quick unlock */}
      <div style={styles.pinSection}>
        <h3 style={styles.pinTitle}>Quick PIN</h3>

        {!hasPin && !settingPin && (
          <button
            onClick={() => setSettingPin(true)}
            style={styles.linkButton}
          >
            Set a PIN for quick access
          </button>
        )}

        {settingPin && (
          <form onSubmit={handleSetPin} style={styles.pinForm}>
            <input
              type="password"
              inputMode="numeric"
              maxLength={6}
              value={pin}
              onChange={(e) => setPin(e.target.value.replace(/\D/g, ""))}
              placeholder="4-6 digit PIN"
              style={styles.pinInput}
              autoComplete="off"
            />
            <input
              type="password"
              inputMode="numeric"
              maxLength={6}
              value={pinConfirm}
              onChange={(e) =>
                setPinConfirm(e.target.value.replace(/\D/g, ""))
              }
              placeholder="Confirm PIN"
              style={styles.pinInput}
              autoComplete="off"
            />
            {pinError && <p style={styles.error}>{pinError}</p>}
            <div style={styles.pinButtons}>
              <button type="submit" style={styles.smallButton}>
                Save PIN
              </button>
              <button
                type="button"
                onClick={() => {
                  setSettingPin(false);
                  setPin("");
                  setPinConfirm("");
                  setPinError("");
                }}
                style={styles.cancelButton}
              >
                Cancel
              </button>
            </div>
          </form>
        )}

        {hasPin && !settingPin && (
          <form onSubmit={handlePinUnlock} style={styles.pinForm}>
            <input
              type="password"
              inputMode="numeric"
              maxLength={6}
              value={pin}
              onChange={(e) => setPin(e.target.value.replace(/\D/g, ""))}
              placeholder="Enter PIN"
              style={styles.pinInput}
              autoComplete="off"
            />
            {pinError && <p style={styles.error}>{pinError}</p>}
            <button
              type="submit"
              disabled={pinLoading}
              style={styles.smallButton}
            >
              {pinLoading ? "Checking..." : "Unlock with PIN"}
            </button>
          </form>
        )}
      </div>
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
  methods: {
    display: "flex",
    gap: "1.5rem",
    width: "100%",
    maxWidth: "860px",
    flexWrap: "wrap" as const,
    justifyContent: "center",
  },
  card: {
    flex: "1 1 380px",
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
  pinSection: {
    width: "100%",
    maxWidth: "860px",
    marginTop: "1.5rem",
    padding: "1.5rem",
    border: "1px solid #222",
    borderRadius: "8px",
    backgroundColor: "#0d0d0d",
    textAlign: "center",
  },
  pinTitle: {
    fontSize: "1rem",
    fontWeight: 600,
    color: "#aaa",
    marginBottom: "0.75rem",
  },
  linkButton: {
    background: "none",
    border: "none",
    color: "#6699cc",
    cursor: "pointer",
    fontSize: "0.9rem",
    textDecoration: "underline",
    padding: 0,
  },
  pinForm: {
    display: "flex",
    flexDirection: "column",
    alignItems: "center",
    gap: "0.75rem",
    maxWidth: "240px",
    margin: "0 auto",
  },
  pinInput: {
    width: "100%",
    padding: "0.65rem",
    fontSize: "1.1rem",
    textAlign: "center",
    letterSpacing: "0.3em",
    backgroundColor: "#1a1a1a",
    border: "1px solid #444",
    borderRadius: "6px",
    color: "#e8e8e8",
    outline: "none",
  },
  pinButtons: {
    display: "flex",
    gap: "0.75rem",
    width: "100%",
  },
  smallButton: {
    flex: 1,
    padding: "0.65rem",
    fontSize: "0.9rem",
    fontWeight: 600,
    backgroundColor: "#e8e8e8",
    color: "#0a0a0a",
    border: "none",
    borderRadius: "6px",
    cursor: "pointer",
  },
  cancelButton: {
    flex: 1,
    padding: "0.65rem",
    fontSize: "0.9rem",
    fontWeight: 600,
    backgroundColor: "transparent",
    color: "#888",
    border: "1px solid #444",
    borderRadius: "6px",
    cursor: "pointer",
  },
};
