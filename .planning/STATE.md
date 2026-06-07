---
gsd_state_version: 1.0
milestone: v1.0
milestone_name: milestone
status: executing
stopped_at: Completed 06-03-PLAN.md
last_updated: "2026-06-07T22:48:57.691Z"
last_activity: 2026-06-07 -- Completed 04-02 outbox sync queue — db v2, sync.ts, SyncStatus component, write page wired
progress:
  total_phases: 7
  completed_phases: 6
  total_plans: 19
  completed_plans: 19
  percent: 92
---

# Project State

## Project Reference

See: .planning/PROJECT.md (updated 2026-06-06)

**Core value:** The diary must actually be inescapably deletable -- cryptographically irrecoverable -- otherwise the commitment device has no teeth.
**Current focus:** Phase 4: Offline PWA

## Current Position

Phase: 4 of 7 (Offline PWA) -- In Progress
Plan: 2 of 3 in current phase -- COMPLETE
Status: In Progress
Last activity: 2026-06-07 -- Completed 04-02 outbox sync queue — db v2, sync.ts, SyncStatus component, write page wired

Progress: [█████████░] 92%

## Performance Metrics

**Velocity:**
- Total plans completed: 0
- Average duration: -
- Total execution time: 0 hours

**By Phase:**

| Phase | Plans | Total | Avg/Plan |
|-------|-------|-------|----------|
| - | - | - | - |

**Recent Trend:**
- Last 5 plans: -
- Trend: -

*Updated after each plan completion*
| Phase 01-foundation P01 | 3 | 2 tasks | 27 files |
| Phase 01-foundation P02 | 90 | 2 tasks | 12 files |
| Phase 01-foundation P03 | 4 | 2 tasks | 4 files |
| Phase 02 P01 | 4 | 2 tasks | 12 files |
| Phase 02-auth-webauthn P02 | 3 | 2 tasks | 6 files |
| Phase 02-auth-webauthn P03 | 5 | 2 tasks | 5 files |
| Phase 03-encryption-writing P01 | 3 | 2 tasks | 6 files |
| Phase 03-encryption-writing P03 | 3 | 2 tasks | 5 files |
| Phase 03-encryption-writing P02 | 4 | 2 tasks | 6 files |
| Phase 04-offline-pwa P01 | 6 | 2 tasks | 19 files |
| Phase 04-offline-pwa P02 | 12 | 2 tasks | 7 files |
| Phase 04-offline-pwa P03 | 3 | 2 tasks | 8 files |
| Phase 05-dead-mans-switch P01 | 5 | 2 tasks | 11 files |
| Phase 05-dead-mans-switch P02 | 5 | 2 tasks | 12 files |
| Phase 05-dead-mans-switch P03 | 15 | 2 tasks | 5 files |
| Phase 05-dead-mans-switch P04 | 2 | 2 tasks | 4 files |
| Phase 06-wipe-and-ceremony P01 | 12 | 2 tasks | 6 files |
| Phase 06-wipe-and-ceremony P03 | 2 | 2 tasks | 6 files |
| Phase 06-wipe-and-ceremony P02 | 18 | 2 tasks | 8 files |

## Accumulated Context

### Decisions

Decisions are logged in PROJECT.md Key Decisions table.
Recent decisions affecting current work:

- [Roadmap]: 7-phase build order follows crypto dependency chain (auth before encryption, encryption before deadline, installer last)
- [Roadmap]: INST requirements split across Phase 1 (infra), Phase 6 (shard security), and Phase 7 (installer UX)
- [Phase 01-foundation]: Caddy local_certs for HTTPS; SITE_HOSTNAME env var to avoid Docker container ID collision
- [Phase 01-foundation]: All 10 DB tables scaffolded in Phase 1 migration — no table creation in later phases (locked decision)
- [Phase 01-foundation]: WEBAUTHN_RP_ID warning is most prominent comment in .env.example — permanent passkey domain commitment
- [Phase 01-foundation]: npm workspace Docker builds require root build context; API uses workspace flag against root lock file
- [Phase 01-foundation]: Caddy bound to 127.0.0.1/::1 only — Docker Desktop VPNKit holds 0.0.0.0:443 on macOS
- [Phase 01-foundation]: Next.js production Docker build uses npx next build (no --turbopack) — turbopack is dev-only
- [Phase 01-foundation]: Secrets set into process.env at runtime — smoke test uses node -e ensureSecrets() not printenv to verify secret presence
- [Phase 01-foundation]: Generated secrets persisted to deadletter_api_secrets named volume via GENERATED_ENV_PATH — avoids host .env write and bind mount issues
- [Phase 01-foundation]: INST-09 volume prefix is dead-letter-diary_deadletter_ (compose project + volume name) — grep on substring not prefix
- [Phase 02]: Argon2id with memoryCost=65536, timeCost=3, parallelism=4 for passphrase hashing
- [Phase 02]: Session tokens SHA-256 hashed before DB storage -- raw token never persisted
- [Phase 02]: httpOnly secure sameSite=strict cookie named session with 7-day expiry
- [Phase 02-auth-webauthn]: Redis for challenge storage with 60s TTL and immediate delete after read (single-use)
- [Phase 02-auth-webauthn]: UV flag enforcement on every auth verify -- 403 if userVerified is false (AUTH-07)
- [Phase 02-auth-webauthn]: PRF result kept as ArrayBuffer in memory, never serialized or sent to server
- [Phase 02-auth-webauthn]: PIN stored in sessionStorage (client-side only gate), no server endpoint
- [Phase 02-auth-webauthn]: Biometric and passphrase unlock always visible simultaneously per AUTH-06
- [Phase 03-encryption-writing]: HKDF info string 'dead-letter-diary-dmk-wrap' for domain separation
- [Phase 03-encryption-writing]: AAD format JSON.stringify({entryId, userId, wordCount}) -- deterministic key order
- [Phase 03-encryption-writing]: PBKDF2 600,000 iterations per OWASP 2024 recommendation
- [Phase 03-encryption-writing]: Intl.Segmenter with 'en' locale -- UAX #29 handles all scripts
- [Phase 03-encryption-writing]: Shard at-rest format iv(12)+authTag(16)+ciphertext in single BYTEA column
- [Phase 03-encryption-writing]: AAD userId verified server-side with 403 on mismatch (anti-spoofing)
- [Phase 03-encryption-writing]: Default word_minimum 50 when no deadline_state row exists
- [Phase 03-encryption-writing]: Plain textarea only -- no rich text editor per project constraints
- [Phase 03-encryption-writing]: Session DMK holder in separate module -- Next.js forbids non-page exports from page files
- [Phase 03-encryption-writing]: Auto-save debounce 1s with flush on beforeunload/unmount
- [Phase 04-offline-pwa]: Serwist disabled in dev (NODE_ENV !== production) — SW only active in production builds
- [Phase 04-offline-pwa]: isApiRoute() extracted to lib/sw-route-matcher.ts for testability — sw.ts is a separate webworker compile target
- [Phase 04-offline-pwa]: skipWaiting: false in Serwist — user-triggered updates only via SKIP_WAITING message (PWA-04)
- [Phase 04-offline-pwa]: @vitejs/plugin-react required in vitest.config.ts for JSX parsing in .tsx test files
- [Phase 04-offline-pwa]: OutboxEntry defined in db.ts (not sync.ts) to avoid circular import with sync.ts
- [Phase 04-offline-pwa]: vitest.config.ts extended with @/ alias to match Next.js tsconfig paths
- [Phase 04-offline-pwa]: detectPrivateMode uses SecurityError on IDB open — NOT quota thresholds (Chrome 2024+ artificial quota applies in all modes)
- [Phase 04-offline-pwa]: PrivateModeGuard renders null during detection to avoid flash, then shows absolute refusal screen with no dismiss
- [Phase 04-offline-pwa]: callPersist fires on appinstalled, beforeinstallprompt, and standalone launch — covers all install vectors
- [Phase 05-dead-mans-switch]: luxon used for computeDeadlineUTC — DST-safe deadline computation via DateTime.now().setZone(tz).plus({hours}).toUTC()
- [Phase 05-dead-mans-switch]: Two-phase wipe: wipe_log.shard_deleted=true before DELETE server_shards — crash-safe recovery (DMS-08)
- [Phase 05-dead-mans-switch]: Akrasia weakening triggers 7-day pending_effective_at delay; strengthening is immediate
- [Phase 05-dead-mans-switch]: Shard gate permissive when no deadline_state row — onboarding must work before deadline is configured
- [Phase 05-dead-mans-switch]: initVapid() no-op when VAPID keys absent — safe for test environments before first run
- [Phase 05-dead-mans-switch]: ON CONFLICT uses subscription->>'endpoint' JSONB extraction — no endpoint TEXT column needed
- [Phase 05-dead-mans-switch]: Mixed Akrasia axis logic: each axis evaluated independently — word_minimum strengthening writes immediately even when window_hours weakens; up to 2 UPDATE statements
- [Phase 05-dead-mans-switch]: Grace budget reset uses Luxon rolling 7-day window (diff >= 7 days from grace_used_at), not Mon-Sun calendar week
- [Phase 05-dead-mans-switch]: notification_thresholds columns are threshold_minutes (INT) and tone (TEXT) — not hours_before/label/urgency
- [Phase 06-wipe-and-ceremony]: sendWipeNotification called after COMMIT in both checkDeadlines and panic route — push is best-effort and must not hold DB locks
- [Phase 06-wipe-and-ceremony]: Panic wipe sets confirmed_at=now() immediately (no 60s settle window) — wipe_log has both initiated_at and confirmed_at set in single INSERT
- [Phase 06-wipe-and-ceremony]: 409 returned for both missing deadline_state row and non-active state — unified non-active error response in panic route
- [Phase 06-wipe-and-ceremony]: rowCount === 0 on UPDATE users SET epitaph WHERE epitaph IS NULL is the immutability guard — SQL atomically enforces single-write constraint
- [Phase 06-wipe-and-ceremony]: server_shards moved to shards PostgreSQL schema via migration 002; pg_dump --exclude-schema=shards excludes it from all backups
- [Phase 06-wipe-and-ceremony]: backup.sh uses set -euo pipefail so any missing env var or pg_dump failure exits loudly — explicit failure by design
- [Phase 06-wipe-and-ceremony]: SW wipe branch navigates clients to /wiped BEFORE indexedDB.deleteDatabase to prevent onblocked deadlock from open connections
- [Phase 06-wipe-and-ceremony]: performClientWipe wraps db.delete() in try/catch — safe to call repeatedly; DeadlineBanner redirects in fetchDeadline callback before setDeadlineState

### Pending Todos

None yet.

### Blockers/Concerns

- RP ID (domain) for WebAuthn must be decided before Phase 2 -- permanent and irreversible
- Argon2id vs PBKDF2 for passphrase fallback needs performance measurement on low-end iOS Safari (Phase 3)

## Session Continuity

Last session: 2026-06-07T22:48:44.130Z
Stopped at: Completed 06-03-PLAN.md
Resume file: None
