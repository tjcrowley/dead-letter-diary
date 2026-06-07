---
phase: 06-wipe-and-ceremony
verified: 2026-06-07T00:00:00Z
status: passed
score: 13/13 must-haves verified
re_verification: false
---

# Phase 6: Wipe and Ceremony Verification Report

**Phase Goal:** When the deadline passes, the diary is cryptographically destroyed with an irreversible, observable ceremony
**Verified:** 2026-06-07
**Status:** passed
**Re-verification:** No — initial verification

---

## Goal Achievement

### Observable Truths

All truths drawn from the three plan `must_haves` blocks (Plans 01, 02, 03).

#### Plan 01 Truths

| # | Truth | Status | Evidence |
|---|-------|--------|----------|
| 1 | After `confirmWipe()` completes, a wipe push notification is sent then subscription row is deleted | VERIFIED | `deadline-engine.ts` line 176: `await sendWipeNotification(pool, userId, log)` immediately after `confirmWipe`; `notification-sender.ts` lines 136–137: DELETE FROM notifications always runs |
| 2 | POST /api/wipe/panic immediately deletes shard (no 60s settle window) when state='active', sets state='wiped', sends wipe push | VERIFIED | `wipe.ts` lines 106–133: panic wipe inserts wipe_log with `shard_deleted=true, confirmed_at=now()`, deletes `shards.server_shards`, updates state to 'wiped', then calls `sendWipeNotification` outside the transaction |
| 3 | POST /api/wipe/panic returns 409 when deadline_state.state is not 'active' | VERIFIED | `wipe.ts` lines 99–101: checks `state !== 'active'`, returns 409 `{ error: 'Not in active state' }` |
| 4 | Panic wipe uses FOR UPDATE lock — concurrent check-in after panic sees 'wiped' state | VERIFIED | `wipe.ts` line 94: `SELECT state FROM deadline_state WHERE user_id = $1 FOR UPDATE` |

#### Plan 02 Truths

| # | Truth | Status | Evidence |
|---|-------|--------|----------|
| 5 | SW push handler intercepts type:'wipe' payload, clears Cache Storage and IndexedDB, shows wipe notification, navigates clients to /wiped | VERIFIED | `sw.ts` lines 54–89: `if (data?.type === 'wipe')` branch clears caches, navigates all clients via `client.navigate('/wiped')`, deletes IDB via `indexedDB.deleteDatabase('DeadLetterDiary')`, shows notification with `requireInteraction: true`, returns early |
| 6 | `performClientWipe()` deletes Dexie DB, clears Cache Storage, clears session cookie | VERIFIED | `wipe.ts` lines 23–43: `db.delete()` in try/catch, `caches.keys()` + parallel delete guarded by `typeof caches !== 'undefined'`, `document.cookie = 'session=; Max-Age=0; path=/; Secure; SameSite=Strict'` |
| 7 | /wiped page renders diary title + epitaph (if set); makes no calls to /api/entries or crypto endpoint | VERIFIED | `wiped/page.tsx` lines 13–23: only fetches `/api/account/epitaph`; renders "Dead Letter Diary" h1 and conditional epitaph paragraph; no imports of entries/crypto modules |
| 8 | DeadlineBanner detects state='wiped' and triggers `performClientWipe()` then `router.replace('/wiped')` | VERIFIED | `DeadlineBanner.tsx` lines 84–89: `if (data.state === 'wiped') { void performClientWipe().then(() => { router.replace('/wiped'); }); return; }` — runs before `setDeadlineState` |
| 9 | PanicEncryptButton shows typed confirmation dialog (user must type DESTROY); only calls POST /api/wipe/panic after confirmation | VERIFIED | `PanicEncryptButton.tsx` lines 117: `disabled={typedValue !== 'DESTROY' || loading}`; line 37: `fetch('/api/wipe/panic', { method: 'POST', credentials: 'include' })` only fires in `handleConfirm` which guards on `typedValue !== 'DESTROY'` |

#### Plan 03 Truths

| # | Truth | Status | Evidence |
|---|-------|--------|----------|
| 10 | server_shards table lives in 'shards' schema after migration 002 | VERIFIED | `002.do.shard-schema.sql`: `CREATE SCHEMA IF NOT EXISTS shards; ALTER TABLE public.server_shards SET SCHEMA shards;` |
| 11 | All SQL queries referencing server_shards use shards.server_shards | VERIFIED | grep confirms: `crypto.ts` (3 occurrences), `wipe.ts` (1), `deadline-engine.ts` (1) — all qualified. Only bare `server_shards` string is a comment inside a mock response in the test file |
| 12 | GET /api/account/epitaph returns epitaph or null; POST enforces immutability (409 on second write) | VERIFIED | `wipe.ts` lines 20–70: GET returns `{ epitaph }` from `SELECT epitaph FROM users WHERE id=$1`; POST uses `WHERE id=$1 AND epitaph IS NULL` guard, returns 409 when rowCount=0 |
| 13 | backup.sh uses `--exclude-schema=shards` with `set -euo pipefail` | VERIFIED | `scripts/backup.sh` line 6: `set -euo pipefail`; line 27: `--exclude-schema=shards` passed to `pg_dump` |

**Score:** 13/13 truths verified

---

### Required Artifacts

| Artifact | Status | Details |
|----------|--------|---------|
| `apps/api/src/lib/notification-sender.ts` | VERIFIED | `sendWipeNotification` exported; substantive (fetches subscription, sends push with `urgency:'high', TTL:0`, always deletes subscription row) |
| `apps/api/src/routes/wipe.ts` | VERIFIED | POST /api/wipe/panic + GET /api/account/epitaph + POST /api/account/epitaph all present; registered as fastify-plugin default export |
| `apps/api/src/lib/deadline-engine.ts` | VERIFIED | `sendWipeNotification` called after `confirmWipe` in pendingWipe loop (line 176) |
| `apps/api/migrations/002.do.shard-schema.sql` | VERIFIED | 8-line migration: CREATE SCHEMA + ALTER TABLE with BEGIN/COMMIT |
| `apps/api/src/routes/crypto.ts` | VERIFIED | All three shard queries use `shards.server_shards` |
| `apps/web/lib/wipe.ts` | VERIFIED | `performClientWipe()` exported; three-step cleanup implemented |
| `apps/web/app/sw.ts` | VERIFIED | type:'wipe' push handler branch present; correct ordering: cache clear → navigate clients → delete IDB → show notification |
| `apps/web/app/wiped/page.tsx` | VERIFIED | Renders title + conditional epitaph; fetches only `/api/account/epitaph`; no diary content imports |
| `apps/web/components/PanicEncryptButton.tsx` | VERIFIED | Typed DESTROY confirmation gate; POST /api/wipe/panic; performClientWipe + redirect on success |
| `apps/web/components/DeadlineBanner.tsx` | VERIFIED | wipe guard calls performClientWipe().then(router.replace('/wiped')); imports from wipe lib confirmed |
| `scripts/backup.sh` | VERIFIED | --exclude-schema=shards, set -euo pipefail, explicit warning messages |
| `apps/api/src/lib/__tests__/deadline-engine.test.ts` | VERIFIED | sendWipeNotification spy assertions present (lines 300–395); both positive and negative cases |
| `apps/api/src/routes/__tests__/wipe.test.ts` | VERIFIED | Full coverage: GET/POST epitaph (5 cases), panic wipe happy path, 409 non-active, 409 no state row, 409 already wiped, 500 on DB error, sendWipeNotification called after COMMIT |
| `apps/web/lib/__tests__/wipe.test.ts` | VERIFIED | 5 tests: db.delete called, error resilience, cache clearing, cookie clearing, SSR guard |
| `apps/web/app/wiped/__tests__/page.test.tsx` | VERIFIED | 4 tests: title renders, epitaph shown, no epitaph element when null, no forbidden endpoint calls |
| `apps/web/components/__tests__/PanicEncryptButton.test.tsx` | VERIFIED | 7 tests: dialog hidden, dialog shown, confirm disabled, confirm enabled, API call, performClientWipe+redirect, cancel no-API, error display |

---

### Key Link Verification

| From | To | Via | Status | Details |
|------|----|-----|--------|---------|
| `deadline-engine.ts` | `notification-sender.ts` | `import sendWipeNotification` | WIRED | Line 4: `import { sendDeadlineWarning, sendWipeNotification } from "./notification-sender.js"` |
| `deadline-engine.ts` | `sendWipeNotification call` | called after `confirmWipe` returns | WIRED | Line 176: `await sendWipeNotification(pool, userId, log)` inside pendingWipe loop, after `confirmWipe` |
| `wipe.ts` | `notification-sender.ts` | `import sendWipeNotification` | WIRED | Line 4: `import { sendWipeNotification } from "../lib/notification-sender.js"` |
| `server.ts` | `routes/wipe.ts` | `fastify.register(wipeRoutes)` | WIRED | `server.ts` line 16: import; line 70: `fastify.register(wipeRoutes)` |
| `002.do.shard-schema.sql` | `deadline-engine.ts` | `DELETE FROM shards.server_shards` | WIRED | Line 121: `DELETE FROM shards.server_shards WHERE user_id = $1` |
| `002.do.shard-schema.sql` | `crypto.ts` | shard queries use `shards.server_shards` | WIRED | Lines 70, 109, 126 all qualify with `shards.` prefix |
| `scripts/backup.sh` | `pg_dump --exclude-schema=shards` | shell flag | WIRED | Line 27: `--exclude-schema=shards` present in pg_dump invocation |
| `DeadlineBanner.tsx` | `wipe.ts` | `import performClientWipe` | WIRED | Line 5: `import { performClientWipe } from '@/lib/wipe'`; called at line 85 |
| `wiped/page.tsx` | `GET /api/account/epitaph` | `fetch` on mount | WIRED | Line 13: `fetch('/api/account/epitaph', { credentials: 'include' })` in `useEffect` |
| `sw.ts push handler` | `indexedDB.deleteDatabase('DeadLetterDiary')` | SW wipe branch | WIRED | Lines 74–79: `indexedDB.deleteDatabase("DeadLetterDiary")` with onblocked resolve |

---

### Requirements Coverage

| Requirement | Source Plan | Description | Status | Evidence |
|-------------|------------|-------------|--------|----------|
| WIPE-01 | 06-01 | Server deletes shard when deadline passes | SATISFIED | `confirmWipe` in deadline-engine.ts deletes `shards.server_shards`; `sendWipeNotification` called after |
| WIPE-02 | 06-02 | Client receives wipe push → clears IndexedDB, caches, cookies | SATISFIED | SW `type:'wipe'` handler: clears caches, navigates clients, deletes IDB; `performClientWipe()` clears all three in window context |
| WIPE-03 | 06-02 | Final UI: blank screen with only the diary title | SATISFIED | `/wiped` page: dark gravestone UI, only "Dead Letter Diary" heading + optional epitaph; no diary content |
| WIPE-04 | 06-03 | Optional diary epitaph displayed on wipe screen | SATISFIED | GET/POST /api/account/epitaph routes in wipe.ts; /wiped page fetches and renders epitaph |
| WIPE-05 | 06-01, 06-02 | Panic encrypt: on-demand wipe button with confirmation | SATISFIED | PanicEncryptButton: typed DESTROY gate; POST /api/wipe/panic; server route immediate delete |
| WIPE-06 | 06-02 | Client checks wipe log on every session start — shows blank state if wiped | SATISFIED | DeadlineBanner polls every 60s; on `state==='wiped'` calls performClientWipe + router.replace('/wiped') |
| INST-07 | 06-03 | Server shards in separate PostgreSQL schema excluded from backups | SATISFIED | Migration 002 moves server_shards to shards schema; all queries qualified |
| INST-08 | 06-03 | Opinionated backup.sh explicitly excludes shards schema | SATISFIED | scripts/backup.sh: `set -euo pipefail`, `--exclude-schema=shards`, explicit warning comments |

All 8 required requirements satisfied. No orphaned requirements for Phase 6 found in REQUIREMENTS.md traceability table.

---

### Anti-Patterns Found

No blockers or stubs detected.

| File | Pattern Checked | Result |
|------|----------------|--------|
| `apps/api/src/lib/deadline-engine.ts` | TODO/placeholder/empty return | Clean |
| `apps/api/src/routes/wipe.ts` | TODO/placeholder/stub handler | Clean |
| `apps/web/lib/wipe.ts` | Empty implementation | Clean — three-step cleanup implemented |
| `apps/web/app/sw.ts` | type:'wipe' branch stub | Clean — full implementation present |
| `apps/web/app/wiped/page.tsx` | Placeholder return | Clean — renders full ceremony UI |
| `apps/web/components/PanicEncryptButton.tsx` | onClick stub / no API call | Clean — full confirmation + API call |
| `apps/web/components/DeadlineBanner.tsx` | `return null` on wiped state (old stub) | Clean — replaced with performClientWipe + redirect |
| `scripts/backup.sh` | Missing --exclude-schema flag | Clean — flag present |

---

### Human Verification Required

#### 1. SW Push Wipe in Browser

**Test:** Install the app as a PWA, trigger a wipe via POST /api/wipe/panic (or wait for deadline), confirm push is received.
**Expected:** Browser receives push with `type:'wipe'`, navigates to /wiped, IndexedDB 'DeadLetterDiary' is deleted, all caches cleared.
**Why human:** Service Worker behavior and push delivery cannot be verified by static code analysis or unit tests.

#### 2. /wiped Gravestone Page Appearance

**Test:** Navigate to /wiped in a browser with and without an epitaph set.
**Expected:** Dark background, centered "Dead Letter Diary" heading, italic epitaph text below (or nothing if null), no navigation links, ceremony aesthetic matches design intent.
**Why human:** Visual rendering and aesthetic quality require human judgment.

#### 3. PanicEncryptButton End-to-End Flow

**Test:** Click "Panic Encrypt (destroy diary)" in settings, type "DESTROY", click Confirm.
**Expected:** Dialog appears, confirm button is disabled until full word is typed, API call fires, app navigates to /wiped with diary wiped.
**Why human:** Real browser interaction flow and visual state of dialog.

#### 4. DeadlineBanner Poll-Triggered Wipe

**Test:** Set a very short deadline, let it expire, observe the next poll cycle (60s).
**Expected:** DeadlineBanner detects state='wiped', calls performClientWipe, navigates to /wiped without any user action.
**Why human:** Requires live server with real deadline state machine running.

---

### Gaps Summary

No gaps. All 13 observable truths verified, all 16 artifacts confirmed substantive and wired, all 8 requirements satisfied. The cryptographic wipe pipeline is complete: server-side two-phase shard deletion with push notification, client-side SW ceremony, /wiped page, panic route, and backup exclusion are all implemented, connected, and tested.

---

_Verified: 2026-06-07_
_Verifier: Claude (gsd-verifier)_
