# Research Summary: Dead Letter Diary

**Synthesized:** 2026-06-06
**Sources:** STACK.md, FEATURES.md, ARCHITECTURE.md, PITFALLS.md

---

## Recommended Stack

| Layer | Choice | Version |
|-------|--------|---------|
| Frontend | Next.js (App Router) | 15.x |
| PWA / Service Worker | `@serwist/next` | 9.x |
| Backend | Fastify | 5.x |
| Runtime | Node.js | 22 LTS |
| WebAuthn (server) | `@simplewebauthn/server` | 13.x |
| WebAuthn (browser) | `@simplewebauthn/browser` | 13.x |
| IndexedDB | Dexie.js + `dexie-react-hooks` | 4.x / 1.1.3+ |
| Push (server) | `web-push` | 3.6.7 (maintenance mode — pin it) |
| ORM | Drizzle ORM + `postgres` driver | 0.36+ / 3.x |
| Database | PostgreSQL | 16 |
| Cache / Challenge store | Redis + `ioredis` | 7.x / 5.x |
| Reverse proxy | Caddy 2 | 2.8+ (auto-HTTPS for local + production) |
| Validation | Zod | 3.23+ |
| Deployment | Docker Compose | v2 |

**Key choices:**
- **Serwist** over `next-pwa` — the maintainer of `@ducanh2912/next-pwa` redirected new projects to Serwist; Next.js docs endorse it.
- **Drizzle** over Prisma — 7kb vs 1.6MB bundle, no engine binary, readable SQL migrations, ideal for self-hosting.
- **Caddy** over nginx — auto-HTTPS via mkcert for local deployment; WebAuthn requires HTTPS.
- **pgcrypto column encryption** for server shards with env var master key — Vault/KMS is hostile to self-hosters.

---

## Table Stakes (must be in v1)

- Distraction-free write surface with live word count
- Persistent deadline countdown visible from every screen
- Auto-save to IndexedDB (debounced, never lose a keystroke)
- Installable PWA with home-screen coaching for iOS
- Biometric unlock (WebAuthn) with visible passphrase/PIN fallback
- Push notification warnings at configurable thresholds
- Offline writing with sync status indicator
- Encryption status indicator ("End-to-end encrypted")
- Streak counter
- Past entries browsing (read-only, client-side decryption)
- Grace day UI with weekly budget display
- Settings page for word minimum, timeout, warnings, grace budget
- Account creation with multi-step setup ritual
- Explicit "no recovery" acknowledgment during setup
- HTTPS (non-negotiable for WebAuthn, SW, push)

---

## Differentiators

- **The Wipe Ceremony** — final countdown → shard deletion → animated wipe → blank screen with only diary title. No precedent in any existing product.
- **Server-verified word count** — server is the bouncer, not just storage. Word count committed as AES-GCM AAD for tamper-evidence.
- **Akrasia Horizon** (from Beeminder) — weakening commitments (lower word count, longer window) takes 7 days. Strengthening is immediate.
- **Tiered warning escalation** — notification tone shifts from gentle (24h) to urgent (1h) to final (15min).
- **Decoy state** — post-wipe app shows only the diary title and a blank screen, as if the user never wrote.
- **Setup ritual** — user signs a "contract with future self," names the diary, explicitly acknowledges irreversibility.
- **Optional diary epitaph** — short message displayed on the wipe screen if the diary dies.
- **Panic encrypt** — on-demand immediate wipe button for personal-safety use cases.

---

## Architecture Decisions

### Key Derivation: PRF Extension + Diary Master Key (DMK)

The WebAuthn **PRF extension** (`hmac-secret`) returns a deterministic 32-byte output per credential. This is the device shard source — it never leaves the secure enclave.

**The DMK pattern:**
1. PRF output → `device_shard` via HKDF
2. `wrap_key = HKDF(device_shard XOR server_shard)`
3. DMK (random 32 bytes, generated once) is AES-GCM-wrapped with `wrap_key`
4. DMK is the actual encryption key for entries
5. Decouples credential rotation from entry re-encryption
6. Enables multi-device via `key_wraps` table (one wrapped DMK per credential)

**PRF fallback ladder:** PRF → passphrase + Argon2id → PIN is UI-lockout only (not a key source).

### Word Count Verification

Server cannot read plaintext. Word count goes into AES-GCM **Additional Authenticated Data (AAD)**. Server stores the count from AAD. Tampering is detectable but not preventable — this is a fundamental E2E limitation. Mitigation: flag suspicious patterns (exact-minimum entries at deadline minus 5 min).

Use `Intl.Segmenter` with `isWordLike` for counting — naive whitespace split is unusable for CJK/Thai.

### Deadline State Machine

Server-authoritative. Stored as absolute UTC timestamps. Poller (every 60s), not a cron scheduler.

```
[active] --checkin→ [active] (deadline advanced)
[active] --grace→   [active] (budget decremented)
[active] --missed→  [settle] (60s window, not surfaced to user)
[settle] --confirmed→ [wiped] (shard deleted, push sent)
```

Two-phase wipe: mark pending → wait 60s → confirm deadline still passed → delete shard. Prevents race with a slow check-in.

### Service Worker Rules

- **Cache** (CacheFirst): app shell, JS, CSS, fonts, icons, manifest
- **NetworkOnly** (NEVER cache): `/api/shard`, `/api/session/*`, `/api/checkin`, `/api/sync`, `/api/push/subscribe`
- Caching the shard endpoint would allow a wiped session to replay — catastrophic.

### Local-First Deployment

- Docker Compose with `restart: always` + system service (launchd/systemd)
- Caddy reverse proxy with mkcert for local HTTPS → installed into system trust store
- First-run setup page generates all secrets (VAPID keys, session secret, shard encryption key)
- Single-user default; multi-user capable from schema design
- No cloud account, domain name, or VPS required
- Installer: checks Docker → starts Compose → registers system service → opens browser

---

## Top Pitfalls (phase-mapped)

### Phase 1 (Foundation)
- RP ID is permanent — pick domain before first credential. Lock-in is irreversible.
- Multi-user schema from day one — `user_id` on every table even if single-user.

### Phase 2 (Auth)
- Server-side UV flag verification — Safari lies about `userVerification: "required"`.
- `residentKey: "required"` for passkey UX, but support `"preferred"` fallback.
- Detect WKWebView (Instagram/Facebook/Slack) → redirect to Safari.
- `attestation: "none"` — don't require it.

### Phase 3 (Crypto)
- **One fresh random IV per AES-GCM encryption.** Never reuse. Unit test for uniqueness across 1M operations.
- Non-extractable CryptoKey — ESLint rule banning `extractable: true` outside tests.
- Per-user HKDF salt (32 bytes random at registration).
- `crypto.timingSafeEqual()` for all shard/token/challenge comparisons.
- `server_shard = crypto.getRandomValues(32)` — never derive from user identity.

### Phase 4 (Offline)
- **Safari ITP 7-day eviction** — call `navigator.storage.persist()`, require Home Screen install, warn on non-install.
- Detect private/incognito mode → refuse to open diary.
- Two-stage save: draft store first, clear UI only after `transaction.complete`.
- Storage quota monitoring — compress entries, surface usage in settings.

### Phase 5 (Notifications / Deadline)
- Deadlines computed in user's IANA timezone via `luxon` or Temporal, not raw arithmetic.
- DST transitions: surface one-time banner.
- iOS push only works from Home Screen install — gate notification setup behind standalone check.
- Push subscriptions silently expire on iOS — re-subscribe on every launch, have in-app banner as backup.
- `urgency: "high"` on deadline warnings to survive low-power mode.

### Phase 7 (Wipe)
- Server shard in **separate Postgres schema** excluded from backups (`pg_dump --exclude-schema=shards`).
- Two-phase wipe with row-level locks (`SELECT ... FOR UPDATE`).
- Wipe log (append-only, hash-chained) written BEFORE shard deletion — crash safety.
- Race condition: check-in at 11:59:58 vs wipe at 12:00:00 — 60s settle window resolves this.

### Phase 8 (Self-Hosting / Installer)
- HTTPS mandatory check on boot — refuse to start on `http://` (except `localhost`).
- `.env.example` only — `.env` in `.gitignore` from commit zero.
- Named Docker volumes with warnings about `docker compose down -v`.
- Opinionated `backup.sh` that explicitly excludes shards.
- VAPID keys treated as durable secret in named volume.

---

## Installer Requirements (local-first)

The installer is a first-class feature, not an afterthought:

1. Check Docker installed and running (offer install link if missing)
2. Create project directory with `.env` from `.env.example` (auto-generate secrets)
3. `docker compose up -d` with `restart: always`
4. Install mkcert local CA → generate HTTPS cert for `localhost` or user-chosen hostname
5. Register system service:
   - macOS: launchd plist (`~/Library/LaunchAgents/`)
   - Linux: systemd user unit (`~/.config/systemd/user/`)
6. Open browser to first-run setup page
7. First-run page: create owner account → WebAuthn enrollment → set diary title → set commitments → confirm "no recovery"

---

## Recommended Build Order (7 phases)

| Phase | Name | Focus | Highest Risk |
|-------|------|-------|-------------|
| 1 | Foundation | Project scaffold, Docker Compose, Caddy, PostgreSQL schema, Fastify API skeleton, Drizzle, basic auth (passphrase only) | RP ID selection, multi-user schema |
| 2 | Auth & WebAuthn | WebAuthn registration/assertion, PRF extension, PIN, biometric unlock, session management, Redis challenge store | PRF cross-platform support, UV flag verification |
| 3 | Encryption Core | Crypto module (HKDF, AES-GCM, DMK wrap/unwrap), shard split, write surface with encrypted storage, Dexie schema, word count (Intl.Segmenter) | IV reuse, key extractability, AAD binding |
| 4 | Offline & Sync | Service Worker (Serwist), offline write queue, sync protocol, storage persistence, conflict resolution | Safari ITP eviction, quota errors, private mode |
| 5 | Dead Man's Switch | Deadline state machine, poller, check-in validation, grace days, warning push notifications, Akrasia Horizon | DST/timezone math, iOS push unreliability, race conditions |
| 6 | Wipe & Ceremony | Two-phase wipe, shard deletion, wipe log, client cleanup, wipe UI (countdown, blank screen, epitaph), panic encrypt | Backup defeating security model, crash between delete and notify |
| 7 | Installer & Polish | System service integration, mkcert installer, first-run setup, PWA install coaching, streak UI, past entries, settings, self-hosting docs | HTTPS on local network, Docker volume management |

---

## Open Questions

| Question | Must resolve by | Notes |
|----------|----------------|-------|
| RP ID (domain) for self-hosters | Phase 1 | Permanent. `localhost` works for local-only; what about LAN access? |
| Shamir 2-of-2 vs XOR for shards | Phase 3 | XOR is simpler; Shamir extends to n-of-m for multi-device later |
| Argon2id via WASM vs PBKDF2 600k iterations | Phase 3 | Performance on low-end iOS Safari needs measurement |
| Server shard backup policy | Phase 6 | "No backups" vs "separate schema excluded from backups" |
| EU iOS DMA push status in 2026 | Phase 5 | Fluid — verify at implementation time |
| Email fallback for push warnings | Phase 5 | Needed for iOS unreliability; requires SMTP config |
| Fast-time scheduler for testing | Phase 5 | Dev tooling: 2-minute deadlines for testing without real waits |
