# Requirements: Dead Letter Diary

**Defined:** 2026-06-06
**Core Value:** The diary must actually be inescapably deletable — cryptographically irrecoverable — otherwise the commitment device has no teeth.

## v1 Requirements

### Authentication

- [x] **AUTH-01**: User can create account with passphrase during first-run setup
- [x] **AUTH-02**: User can register a WebAuthn passkey (biometric or hardware key) with PRF extension
- [x] **AUTH-03**: User can unlock the diary with biometric (Face ID, Touch ID, Windows Hello, fingerprint)
- [x] **AUTH-04**: User can unlock with passphrase as fallback when PRF is unavailable
- [x] **AUTH-05**: User can set a PIN for quick unlock (UI lockout layer, not a key source)
- [x] **AUTH-06**: Passphrase/PIN fallback is always visible alongside biometric prompt
- [x] **AUTH-07**: Server-side UV flag verification rejects assertions without biometric confirmation
- [x] **AUTH-08**: Session persists across browser refresh (JWT or secure cookie)

### Encryption

- [x] **CRYPT-01**: Diary Master Key (DMK) generated at account creation (32 bytes random)
- [x] **CRYPT-02**: DMK wrapped with AES-GCM using wrap_key derived from HKDF(device_shard XOR server_shard)
- [x] **CRYPT-03**: Device shard derived from WebAuthn PRF output (or Argon2id from passphrase as fallback)
- [x] **CRYPT-04**: Server shard stored in PostgreSQL, returned only to authenticated sessions in good standing
- [x] **CRYPT-05**: All diary entries encrypted with AES-GCM 256 using DMK
- [x] **CRYPT-06**: Fresh random IV (12 bytes) per encryption operation — never reused
- [x] **CRYPT-07**: Entry metadata (entry_id, user_id, word_count) bound as AES-GCM AAD
- [x] **CRYPT-08**: DMK held as non-extractable CryptoKey in memory during session — never serialized
- [x] **CRYPT-09**: Per-user random HKDF salt (32 bytes) stored at registration
- [x] **CRYPT-10**: All shard/token/challenge comparisons use crypto.timingSafeEqual()

### Writing

- [x] **WRITE-01**: Distraction-free write surface with auto-focus, minimal chrome
- [x] **WRITE-02**: Live word count visible at all times, turns green when minimum is met
- [x] **WRITE-03**: Auto-save to IndexedDB every 1-2 seconds (debounced, never lose a keystroke)
- [x] **WRITE-04**: Word count computed using Intl.Segmenter with isWordLike (supports CJK/Thai)
- [x] **WRITE-05**: Server verifies word count from AAD on check-in submission
- [x] **WRITE-06**: User can browse past entries in read-only view (client-side decryption)

### Dead Man's Switch

- [x] **DMS-01**: Configurable check-in window (default 24h, range 12h–7 days)
- [x] **DMS-02**: Configurable word minimum per check-in (default 50, range 25–500)
- [x] **DMS-03**: Server-side deadline state machine with absolute UTC timestamps
- [x] **DMS-04**: Deadline computed in user's IANA timezone via date library (not raw arithmetic)
- [x] **DMS-05**: Poller (every 60s) checks deadlines — not a cron scheduler
- [x] **DMS-06**: Two-phase wipe: mark pending → 60s settle window → confirm → delete shard
- [x] **DMS-07**: Row-level locks prevent race between check-in and wipe
- [x] **DMS-08**: Wipe log (append-only) written BEFORE shard deletion for crash safety
- [x] **DMS-09**: Grace day: one 24h reprieve per week, manually invoked, weekly budget visible
- [x] **DMS-10**: Akrasia Horizon: weakening commitments (lower word count, longer window) requires 7-day advance. Strengthening is immediate.

### Notifications

- [x] **NOTIF-01**: Push notification warnings at configurable thresholds (default: 24h, 4h, 1h, 15min)
- [x] **NOTIF-02**: Warning tone escalates from gentle to urgent to final across thresholds
- [x] **NOTIF-03**: Push setup gated behind Home Screen install check on iOS
- [x] **NOTIF-04**: Re-subscribe on every app launch (iOS push subscriptions silently expire)
- [x] **NOTIF-05**: In-app deadline banner as backup when push fails — in-app is source of truth
- [x] **NOTIF-06**: `urgency: "high"` on deadline warnings to survive low-power mode
- [x] **NOTIF-07**: Soft-ask pattern for push permission (earn the prompt, don't ask on first load)

### Wipe Ceremony

- [x] **WIPE-01**: Server deletes shard when deadline passes — data is cryptographically dead at that instant
- [x] **WIPE-02**: Client receives wipe push → clears IndexedDB, caches, cookies
- [x] **WIPE-03**: Final UI: blank screen with only the diary title — decoy "as if it never happened" state
- [x] **WIPE-04**: Optional diary epitaph (set at creation, immutable) displayed on wipe screen
- [x] **WIPE-05**: Panic encrypt: on-demand immediate wipe button in settings (with confirmation)
- [x] **WIPE-06**: Client checks wipe log on every session start — shows blank state if wiped

### Offline

- [x] **OFFLINE-01**: Write surface works without internet — entries saved to IndexedDB
- [x] **OFFLINE-02**: Sync queue (outbox pattern) flushes when connection restored
- [x] **OFFLINE-03**: Sync status indicator: "Synced" / "Saving..." / "Offline — N entries pending"
- [x] **OFFLINE-04**: `navigator.storage.persist()` called on PWA install
- [x] **OFFLINE-05**: Private/incognito mode detected → refuse to open diary with clear message
- [x] **OFFLINE-06**: Storage quota monitoring with compression and user-visible usage display

### PWA

- [x] **PWA-01**: Installable PWA with web app manifest, icons, splash screens
- [x] **PWA-02**: Service Worker via Serwist — app shell cached, crypto endpoints NetworkOnly
- [x] **PWA-03**: iOS "Add to Home Screen" coaching (custom instructions with screenshots)
- [x] **PWA-04**: SW update handled gracefully — "update available" toast, no mid-write activation
- [x] **PWA-05**: WKWebView detection → redirect to Safari with instructions
- [x] **PWA-06**: Encryption status badge visible ("End-to-end encrypted")

### Setup & Settings

- [x] **SETUP-01**: First-run setup page: create owner account → WebAuthn enrollment → set diary title → set commitments → confirm "no recovery"
- [x] **SETUP-02**: Explicit "I understand this diary can be permanently destroyed" acknowledgment (cannot proceed without it)
- [x] **SETUP-03**: Settings page: word minimum, timeout, warning thresholds, grace budget, timezone
- [x] **SETUP-04**: Streak counter visible on dashboard (days written, current streak)
- [x] **SETUP-05**: Deadline countdown visible from every screen

### Local Deployment & Installer

- [x] **INST-01**: Docker Compose with `restart: always` — PostgreSQL, Redis, Fastify, Next.js, Caddy
- [x] **INST-02**: Caddy reverse proxy with mkcert local CA cert for HTTPS
- [x] **INST-03**: Installer script: checks Docker → starts Compose → registers system service → opens browser
- [x] **INST-04**: System service integration: launchd plist (macOS), systemd user unit (Linux)
- [x] **INST-05**: First-run auto-generates all secrets (VAPID keys, session secret, shard encryption key)
- [x] **INST-06**: `.env.example` only — `.env` in `.gitignore` from commit zero
- [x] **INST-07**: Server shards in separate PostgreSQL schema excluded from backups
- [x] **INST-08**: Opinionated `backup.sh` that explicitly excludes shards schema
- [x] **INST-09**: Named Docker volumes with prominent warnings about `docker compose down -v`
- [x] **INST-10**: HTTPS-only boot check — refuse to start on `http://` (except localhost)

## v2 Requirements

### Multi-Device

- **MDEV-01**: User can add a second device via out-of-band pairing ceremony (QR code / 6-digit code)
- **MDEV-02**: Each device has its own wrapped DMK in `key_wraps` table
- **MDEV-03**: Device removal deletes `key_wraps` row without rotating DMK (optional DMK rotation for forward security)

### Social / Accountability

- **SOC-01**: Optional public "wall of honor" — publishes only survival/death status (no content)
- **SOC-02**: Optional commitment statement shared to a public URL

### Platform

- **PLAT-01**: Email fallback for push warnings (requires SMTP config)
- **PLAT-02**: Windows Service integration for Windows self-hosters
- **PLAT-03**: Admin dashboard for multi-user self-hosted instances

## Out of Scope

| Feature | Reason |
|---------|--------|
| Cloud backup of diary contents | Backups are the inverse of a dead man's switch |
| "Forgot passphrase" recovery | Any recovery path = server can decrypt = E2E is a lie |
| Auto-extending deadline | Defeats the product; grace day is the only safety valve |
| Snooze/dismiss notifications | Snoozing the warning doesn't dismiss the deadline |
| Streak freezes / streak insurance | Defeats loss-aversion mechanic; grace day is the only insurance |
| Rich text editor with toolbars | Destroys distraction-free writing; markdown-aware textarea only |
| Sharing features | Private by design; sharing breaks the trust model |
| AI writing prompts | Sends plaintext to LLM, breaking E2E |
| Mood/weather/location metadata | Leaks plaintext-equivalent metadata to server |
| Multi-diary support | Simplifies key management in v1 |
| Open registration | Single-user app; open registration invites spam/abandonment |
| Telemetry with entry content | Even crash report line numbers could leak structure |

## Traceability

| Requirement | Phase | Status |
|-------------|-------|--------|
| AUTH-01 | Phase 2 | Complete |
| AUTH-02 | Phase 2 | Complete |
| AUTH-03 | Phase 2 | Complete |
| AUTH-04 | Phase 2 | Complete |
| AUTH-05 | Phase 2 | Complete |
| AUTH-06 | Phase 2 | Complete |
| AUTH-07 | Phase 2 | Complete |
| AUTH-08 | Phase 2 | Complete |
| CRYPT-01 | Phase 3 | Complete |
| CRYPT-02 | Phase 3 | Complete |
| CRYPT-03 | Phase 3 | Complete |
| CRYPT-04 | Phase 3 | Complete |
| CRYPT-05 | Phase 3 | Complete |
| CRYPT-06 | Phase 3 | Complete |
| CRYPT-07 | Phase 3 | Complete |
| CRYPT-08 | Phase 3 | Complete |
| CRYPT-09 | Phase 3 | Complete |
| CRYPT-10 | Phase 3 | Complete |
| WRITE-01 | Phase 3 | Complete |
| WRITE-02 | Phase 3 | Complete |
| WRITE-03 | Phase 3 | Complete |
| WRITE-04 | Phase 3 | Complete |
| WRITE-05 | Phase 3 | Complete |
| WRITE-06 | Phase 7 | Complete |
| DMS-01 | Phase 5 | Complete |
| DMS-02 | Phase 5 | Complete |
| DMS-03 | Phase 5 | Complete |
| DMS-04 | Phase 5 | Complete |
| DMS-05 | Phase 5 | Complete |
| DMS-06 | Phase 5 | Complete |
| DMS-07 | Phase 5 | Complete |
| DMS-08 | Phase 5 | Complete |
| DMS-09 | Phase 5 | Complete |
| DMS-10 | Phase 5 | Complete |
| NOTIF-01 | Phase 5 | Complete |
| NOTIF-02 | Phase 5 | Complete |
| NOTIF-03 | Phase 5 | Complete |
| NOTIF-04 | Phase 5 | Complete |
| NOTIF-05 | Phase 5 | Complete |
| NOTIF-06 | Phase 5 | Complete |
| NOTIF-07 | Phase 5 | Complete |
| WIPE-01 | Phase 6 | Complete |
| WIPE-02 | Phase 6 | Complete |
| WIPE-03 | Phase 6 | Complete |
| WIPE-04 | Phase 6 | Complete |
| WIPE-05 | Phase 6 | Complete |
| WIPE-06 | Phase 6 | Complete |
| OFFLINE-01 | Phase 4 | Complete |
| OFFLINE-02 | Phase 4 | Complete |
| OFFLINE-03 | Phase 4 | Complete |
| OFFLINE-04 | Phase 4 | Complete |
| OFFLINE-05 | Phase 4 | Complete |
| OFFLINE-06 | Phase 4 | Complete |
| PWA-01 | Phase 4 | Complete |
| PWA-02 | Phase 4 | Complete |
| PWA-03 | Phase 4 | Complete |
| PWA-04 | Phase 4 | Complete |
| PWA-05 | Phase 4 | Complete |
| PWA-06 | Phase 4 | Complete |
| SETUP-01 | Phase 7 | Complete |
| SETUP-02 | Phase 7 | Complete |
| SETUP-03 | Phase 7 | Complete |
| SETUP-04 | Phase 7 | Complete |
| SETUP-05 | Phase 7 | Complete |
| INST-01 | Phase 1 | Complete |
| INST-02 | Phase 1 | Complete |
| INST-03 | Phase 7 | Complete |
| INST-04 | Phase 7 | Complete |
| INST-05 | Phase 1 | Complete |
| INST-06 | Phase 1 | Complete |
| INST-07 | Phase 6 | Complete |
| INST-08 | Phase 6 | Complete |
| INST-09 | Phase 1 | Complete |
| INST-10 | Phase 1 | Complete |

**Coverage:** 74/74 v1 requirements mapped

---
*Requirements defined: 2026-06-06*
*Last updated: 2026-06-06 after roadmap creation*
