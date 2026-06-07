# Roadmap: Dead Letter Diary

## Overview

Dead Letter Diary is a PWA diary with a cryptographic dead man's switch. The build progresses from project scaffold through authentication, encryption, offline capability, the deadline engine, wipe ceremony, and finally the local installer. Each phase delivers a verifiable capability, and the dependency chain is strict: encryption depends on auth, the deadline engine depends on encryption, and the installer wraps everything at the end.

## Phases

**Phase Numbering:**
- Integer phases (1, 2, 3): Planned milestone work
- Decimal phases (2.1, 2.2): Urgent insertions (marked with INSERTED)

Decimal phases appear between their surrounding integers in numeric order.

- [x] **Phase 1: Foundation** - Project scaffold, Docker Compose, database schema, Caddy HTTPS, API skeleton (completed 2026-06-07)
- [x] **Phase 2: Auth & WebAuthn** - Account creation, WebAuthn passkey enrollment, biometric/passphrase unlock, sessions (completed 2026-06-07)
- [x] **Phase 3: Encryption & Writing** - Key derivation, shard split, DMK, encrypted write surface with live word count (completed 2026-06-07)
- [ ] **Phase 4: Offline & PWA** - Service Worker, IndexedDB persistence, sync queue, installable PWA shell
- [ ] **Phase 5: Dead Man's Switch** - Deadline state machine, check-in validation, grace days, push notifications
- [ ] **Phase 6: Wipe & Ceremony** - Shard deletion, wipe log, client cleanup, wipe UI, panic encrypt
- [ ] **Phase 7: Installer & Polish** - System service, mkcert setup, first-run ritual, streaks, settings, past entries

## Phase Details

### Phase 1: Foundation
**Goal**: A running local dev environment with database, API, and HTTPS that future phases build on
**Depends on**: Nothing (first phase)
**Requirements**: INST-01, INST-02, INST-05, INST-06, INST-09, INST-10
**Success Criteria** (what must be TRUE):
  1. `docker compose up` starts PostgreSQL, Redis, Fastify, Next.js, and Caddy with no manual steps
  2. Caddy serves the Next.js frontend over HTTPS on localhost with a trusted local cert
  3. Fastify API responds to health check at `/api/health` over HTTPS
  4. Database migrations run on first boot and create multi-user-ready schema (user_id on every table)
  5. All secrets (VAPID keys, session secret, shard encryption key) auto-generate on first run
**Plans**: 3 plans

Plans:
- [x] 01-01: Docker Compose, Caddy, and database schema
- [x] 01-02: Fastify API skeleton and Next.js app shell
- [x] 01-03: Secret generation and HTTPS boot check

### Phase 2: Auth & WebAuthn
**Goal**: Users can create an account and unlock their diary with biometric, passphrase, or PIN
**Depends on**: Phase 1
**Requirements**: AUTH-01, AUTH-02, AUTH-03, AUTH-04, AUTH-05, AUTH-06, AUTH-07, AUTH-08
**Success Criteria** (what must be TRUE):
  1. User can create an account with a passphrase on the first-run setup page
  2. User can register a WebAuthn passkey (biometric or hardware key) with PRF extension
  3. User can unlock the diary with biometric (Face ID, Touch ID, Windows Hello) and passphrase/PIN fallback is always visible
  4. Session persists across browser refresh without re-authentication
  5. Server rejects WebAuthn assertions that lack biometric confirmation (UV flag)
**Plans**: 3 plans

Plans:
- [ ] 02-01-PLAN.md — Auth plugin, account creation, passphrase unlock, vitest setup
- [ ] 02-02-PLAN.md — WebAuthn registration, authentication, PRF, UV verification
- [ ] 02-03-PLAN.md — Frontend setup/unlock pages, WebAuthn browser ceremony, PIN

### Phase 3: Encryption & Writing
**Goal**: Diary entries are end-to-end encrypted with split-key architecture and the write surface works
**Depends on**: Phase 2
**Requirements**: CRYPT-01, CRYPT-02, CRYPT-03, CRYPT-04, CRYPT-05, CRYPT-06, CRYPT-07, CRYPT-08, CRYPT-09, CRYPT-10, WRITE-01, WRITE-02, WRITE-03, WRITE-04, WRITE-05
**Success Criteria** (what must be TRUE):
  1. DMK is generated at account creation, wrapped with a key derived from device shard XOR server shard, and held as non-extractable CryptoKey in memory
  2. User can write in a distraction-free editor with live word count that turns green when minimum is met
  3. Entries auto-save to IndexedDB every 1-2 seconds and are encrypted with AES-GCM 256 using DMK
  4. Server stores its shard in PostgreSQL and returns it only to authenticated sessions in good standing
  5. Server verifies word count from AAD on check-in submission
**Plans**: 3 plans

Plans:
- [ ] 03-01-PLAN.md — Crypto module and word count (Web Crypto API, HKDF, AES-GCM, PBKDF2, Intl.Segmenter)
- [ ] 03-02-PLAN.md — Write surface with live word count and encrypted Dexie auto-save
- [ ] 03-03-PLAN.md — Server shard storage (at-rest encryption) and entry submission with AAD word count verification

### Phase 4: Offline & PWA
**Goal**: The diary works without internet and is installable as a PWA on all platforms
**Depends on**: Phase 3
**Requirements**: OFFLINE-01, OFFLINE-02, OFFLINE-03, OFFLINE-04, OFFLINE-05, OFFLINE-06, PWA-01, PWA-02, PWA-03, PWA-04, PWA-05, PWA-06
**Success Criteria** (what must be TRUE):
  1. User can write entries while offline -- they save to IndexedDB and sync when connection restores
  2. Sync status indicator shows "Synced" / "Saving..." / "Offline -- N entries pending"
  3. PWA is installable with proper manifest, icons, and splash screens on iOS, Android, and desktop
  4. Service Worker caches app shell but NEVER caches crypto/session endpoints
  5. Private/incognito mode is detected and the diary refuses to open with a clear message
**Plans**: 3 plans

Plans:
- [x] 04-01-PLAN.md — Serwist SW, PWA manifest, icons, offline page, WKWebView guard, install prompt, SW update toast, encryption badge
- [ ] 04-02-PLAN.md — Offline write queue (outbox pattern), sync flush on online, SyncStatus indicator
- [ ] 04-03-PLAN.md — Storage persistence (persist()), incognito detection, quota monitoring, PrivateModeGuard

### Phase 5: Dead Man's Switch
**Goal**: The deadline engine enforces the writing commitment with configurable windows, warnings, and grace days
**Depends on**: Phase 4
**Requirements**: DMS-01, DMS-02, DMS-03, DMS-04, DMS-05, DMS-06, DMS-07, DMS-08, DMS-09, DMS-10, NOTIF-01, NOTIF-02, NOTIF-03, NOTIF-04, NOTIF-05, NOTIF-06, NOTIF-07
**Success Criteria** (what must be TRUE):
  1. Server maintains a deadline state machine with absolute UTC timestamps, checked by a poller every 60 seconds
  2. User receives push notification warnings that escalate from gentle to urgent across configurable thresholds
  3. User can invoke one grace day per week (24h reprieve), with weekly budget visible in the UI
  4. Weakening commitments (lower word count, longer window) requires 7-day advance; strengthening is immediate
  5. Two-phase wipe with 60-second settle window and row-level locks prevents race between check-in and wipe
**Plans**: TBD

Plans:
- [ ] 05-01: Deadline state machine and poller
- [ ] 05-02: Push notifications with escalation and iOS edge cases
- [ ] 05-03: Grace days, Akrasia Horizon, and check-in validation

### Phase 6: Wipe & Ceremony
**Goal**: When the deadline passes, the diary is cryptographically destroyed with an irreversible, observable ceremony
**Depends on**: Phase 5
**Requirements**: WIPE-01, WIPE-02, WIPE-03, WIPE-04, WIPE-05, WIPE-06, INST-07, INST-08
**Success Criteria** (what must be TRUE):
  1. Server deletes its shard when the deadline passes -- diary data is cryptographically irrecoverable at that instant
  2. Client receives wipe notification, clears IndexedDB, caches, and cookies, then shows a blank screen with only the diary title
  3. User can set an immutable diary epitaph at creation time that displays on the wipe screen
  4. Panic encrypt button in settings triggers immediate wipe with confirmation dialog
  5. Server shards live in a separate PostgreSQL schema excluded from backups, with an opinionated backup script
**Plans**: TBD

Plans:
- [ ] 06-01: Two-phase shard deletion and wipe log
- [ ] 06-02: Client cleanup and wipe ceremony UI
- [ ] 06-03: Panic encrypt and shard backup exclusion

### Phase 7: Installer & Polish
**Goal**: A non-technical user can install Dead Letter Diary on their machine with one command, and the app feels complete
**Depends on**: Phase 6
**Requirements**: INST-03, INST-04, SETUP-01, SETUP-02, SETUP-03, SETUP-04, SETUP-05, WRITE-06
**Success Criteria** (what must be TRUE):
  1. Installer script checks Docker, starts Compose, registers a system service (launchd/systemd), and opens the browser
  2. First-run setup walks user through account creation, WebAuthn enrollment, diary naming, commitment setting, and "no recovery" acknowledgment
  3. Settings page lets user configure word minimum, timeout, warning thresholds, grace budget, and timezone
  4. Streak counter and deadline countdown are visible from the dashboard and every screen respectively
  5. User can browse past entries in a read-only view with client-side decryption
**Plans**: TBD

Plans:
- [ ] 07-01: Installer script and system service integration
- [ ] 07-02: First-run setup ritual and settings page
- [ ] 07-03: Streak counter, deadline countdown, and past entries browser

## Progress

**Execution Order:**
Phases execute in numeric order: 1 -> 2 -> 3 -> 4 -> 5 -> 6 -> 7

| Phase | Plans Complete | Status | Completed |
|-------|----------------|--------|-----------|
| 1. Foundation | 3/3 | Complete   | 2026-06-07 |
| 2. Auth & WebAuthn | 3/3 | Complete   | 2026-06-07 |
| 3. Encryption & Writing | 3/3 | Complete   | 2026-06-07 |
| 4. Offline & PWA | 2/3 | In Progress|  |
| 5. Dead Man's Switch | 0/3 | Not started | - |
| 6. Wipe & Ceremony | 0/3 | Not started | - |
| 7. Installer & Polish | 0/3 | Not started | - |
