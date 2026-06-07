# Dead Letter Diary

> A diary that deletes itself if you stop writing.

---

Dead Letter Diary is a progressive web app for writers who need a hard commitment device. Every day you don't write at least 50 words, the clock ticks down. When it runs out, your entire diary is gone — cryptographically, permanently, irrecoverably.

This is not a metaphor.

---

## How It Works

**Write or lose it.** The diary requires a minimum word count per session (default: 50 words) within a configurable window (default: 24 hours). Miss the window, and the dead man's switch fires.

**One grace day per week.** You get one 24-hour reprieve per week. Use it wisely.

**Warnings.** Push notifications fire at 24h, 4h, 1h, and 15 minutes before the deadline. You will know it's coming.

**Then it's gone.** Not "deleted from the server." Not "moved to trash." Gone. The encryption key is split between your device and the server — when the deadline passes, the server destroys its shard. Without both halves, the ciphertext is mathematically unreadable. There is no recovery.

---

## Security Model

Dead Letter Diary uses **split-key encryption**:

- Your **device key shard** lives in your device's secure enclave, protected by biometric or passphrase
- The **server key shard** lives on the server, returned only to authenticated sessions in good standing
- Entries are encrypted with AES-GCM 256 using a key derived from both shards via HKDF
- When the deadline passes, the server deletes its shard and refuses all decryption requests
- The client wipes its local IndexedDB

Neither party alone can decrypt the diary. When the switch fires, no one can.

---

## Auth

| Method | Notes |
|--------|-------|
| Biometric | Face ID, Touch ID, Windows Hello, fingerprint (WebAuthn) |
| Hardware key | YubiKey, Passkey (WebAuthn) |
| Passphrase | Fallback and account recovery |
| PIN | Quick daily unlock |

---

## Configuration

| Setting | Default | Range |
|---------|---------|-------|
| Minimum words per session | 50 | 25–500 |
| Check-in window | 24 hours | 12h–7 days |
| Grace days | 1 per week | 0–3 per week |
| Warning notifications | 24h, 4h, 1h, 15min | Configurable |

---

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Frontend | Next.js 15 PWA |
| Encryption | Web Crypto API (AES-GCM 256, HKDF) |
| Auth | WebAuthn / FIDO2, bcrypt |
| Offline | IndexedDB (Dexie.js) + Service Worker |
| Backend | Fastify (TypeScript) |
| Database | PostgreSQL |
| Push notifications | Web Push API + VAPID |
| Deployment | Docker Compose |

---

## Status

Pre-development. Roadmap in progress.

---

## Why

Because some things are only worth writing if the stakes are real.

---

*A dead letter is a piece of mail that can't be delivered and can't be returned. Eventually, it's destroyed.*
