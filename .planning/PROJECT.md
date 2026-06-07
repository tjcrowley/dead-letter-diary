# Dead Letter Diary

## What This Is

A progressive web app diary with a cryptographic dead man's switch. Writers and diarists set a daily writing minimum (default: 50 words) and a check-in window (default: 24 hours). Miss the window, and the entire diary is permanently, mathematically destroyed — the encryption key is split between the device and the server, and the server deletes its shard. There is no recovery. One grace day per week. That's it.

## Core Value

The diary must actually be inescapably deletable — not just "deleted from the UI" but cryptographically irrecoverable — otherwise the commitment device has no teeth.

## Requirements

### Validated

(None yet — ship to validate)

### Active

- [ ] Split-key encryption: server holds a key shard and destroys it when the deadline passes
- [ ] Dead man's switch: configurable word count minimum (default 50) and check-in window (default 24h)
- [ ] Grace day: one 24-hour reprieve per week, manually invoked
- [ ] Warning push notifications at configurable thresholds (default: 24h, 4h, 1h, 15min before deadline)
- [ ] Wipe ceremony: server deletes shard, client wipes IndexedDB, final blank screen shows only diary title
- [ ] Auth: biometric (WebAuthn/FIDO2), hardware key (WebAuthn), passphrase, and PIN
- [ ] Offline-first: entries written to IndexedDB, synced when online
- [ ] PWA: installable, works on iOS/Android and desktop equally
- [ ] Word count verification: client counts, server verifies before accepting check-in
- [ ] Configurable settings: word minimum, timeout duration, warning thresholds, grace day budget

### Out of Scope

- Sharing or collaboration — the diary is private by design; sharing breaks the trust model
- Social features — no followers, likes, comments, or discovery
- Rich media (images, video) — text only in v1; media storage changes the threat model
- Export/backup in normal flow — intentional; a backup escape hatch undermines the commitment device
- Multi-diary support — one diary per account in v1; simplifies key management

## Context

- Two audiences: writers wanting a kick-in-the-pants commitment device, and diarists who want an actual dead man's switch (entries that die with them if they stop writing)
- The "truly inescapable" requirement was explicit — honor-system deletion (just wipe IndexedDB) is not sufficient
- Key-split architecture: device shard protected by WebAuthn in the secure enclave, server shard returned only to authenticated sessions in good standing; derived key = HKDF(device_shard XOR server_shard), used for AES-GCM 256 encryption
- PWA with Web Push for notifications; Web Crypto API for all encryption (no third-party crypto libs)
- Both mobile (Face ID, Touch ID, fingerprint) and desktop (Windows Hello, YubiKey, passphrase) must be first-class
- **Primary deployment target: local machine (laptop/desktop), not a VPS.** The server component runs as a system service (launchd on macOS, systemd on Linux) inside Docker with `restart: always`. Users install it once; it starts on boot and is not trivially stoppable. This raises the tampering bar from "technically savvy" to "deliberately circumventing the system."
- GitHub: github.com/tjcrowley/dead-letter-diary

## Constraints

- **Security**: Encryption must use Web Crypto API (AES-GCM 256, HKDF) — no third-party crypto libraries
- **Auth**: WebAuthn for biometric and hardware key — same API, different authenticator
- **Offline**: Must work without internet for writing; sync on reconnect
- **No recovery**: By design — no "forgot my password, restore everything" path for diary contents
- **Platform**: PWA only in v1 — no native app
- **Deployment**: Local-first — runs on user's own machine. Installer sets up Docker + system service + local HTTPS (Caddy with local CA cert). No cloud account, no domain name, no VPS required. Docker `restart: always` + OS service integration makes container resilient to accidental stops.
- **HTTPS**: Required for WebAuthn and Service Worker. Caddy handles local cert via mkcert integration — installed into system trust store automatically.

## Key Decisions

| Decision | Rationale | Outcome |
|----------|-----------|---------|
| Split-key encryption | Only way to make deletion cryptographically inescapable | — Pending |
| WebAuthn for biometric + hardware key | One API covers both authenticator types | — Pending |
| No export in normal flow | Export escape hatch undermines the commitment device | — Pending |
| One grace day per week | User requested; weekly budget prevents abuse while preserving humanity | — Pending |
| Next.js 15 PWA | Best PWA ecosystem, TypeScript-first, same stack as BCM | — Pending |
| Fastify backend | Lightweight, TypeScript, same stack as BCM | — Pending |
| Dexie.js + IndexedDB | Best offline-first DX for PWA | — Pending |
| Local-first deployment with system service | Primary target is user's own machine; Docker + launchd/systemd raises tampering bar; no cloud dependency | — Pending |
| Caddy reverse proxy with local CA | WebAuthn requires HTTPS; Caddy auto-generates trusted local cert via mkcert — no user cert management | — Pending |

---
*Last updated: 2026-06-06 after initialization*
