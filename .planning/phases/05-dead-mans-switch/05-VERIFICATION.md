---
phase: 05-dead-mans-switch
verified: 2026-06-07T22:30:00Z
status: passed
score: 12/12 must-haves verified
re_verification: true
  previous_status: gaps_found
  previous_score: 10/12
  gaps_closed:
    - "Push warnings fire at 24h/4h/1h/15min remaining, with tone escalating from gentle to urgent to final"
    - "Stale 410/404 subscriptions are deleted from the notifications table on send failure"
  gaps_remaining: []
  regressions: []
human_verification:
  - test: "Push notification delivery end-to-end"
    expected: "Install PWA on iOS 16.4+, let deadline approach threshold, receive push notification with correct urgency and body copy"
    why_human: "Requires physical device with PWA installed and real VAPID keys configured"
  - test: "Grace day weekly budget UI display"
    expected: "After invoking grace day, GraceDayButton should show disabled state with 'Grace day used this week'. After 7 days, should re-enable."
    why_human: "Requires UI interaction and time-dependent behavior"
  - test: "Two-phase wipe survives server restart"
    expected: "Initiate wipe (pending_wipe), restart server before 60s settle window, verify wipe completes on next poller tick"
    why_human: "Requires process restart during live state transition"
---

# Phase 5: Dead Man's Switch Verification Report

**Phase Goal:** The deadline engine enforces the writing commitment with configurable windows, warnings, and grace days
**Verified:** 2026-06-07T22:30:00Z
**Status:** passed
**Re-verification:** Yes — after gap closure (05-04-PLAN.md)

## Goal Achievement

### Observable Truths (Plan 01)

| # | Truth | Status | Evidence |
|---|-------|--------|----------|
| 1 | Server poller runs every 60s and transitions overdue deadline_state rows to pending_wipe | VERIFIED | `deadline-poller.ts` uses `setInterval(60_000)` in `onReady`; calls `checkDeadlines(fastify.pg, fastify.log)`; interval cleared in `onClose`. Tests verify both. |
| 2 | Two-phase wipe writes to wipe_log BEFORE any state change, preventing data loss on crash | VERIFIED | `confirmWipe` in `deadline-engine.ts` lines 114-121: `UPDATE wipe_log SET shard_deleted=true` runs before `DELETE FROM server_shards`. Comment documents crash-safety intent. Unit test confirms sequence. |
| 3 | Check-in route and poller cannot race — FOR UPDATE lock on deadline_state prevents both from acting simultaneously | VERIFIED | `POST /api/deadline/checkin` and `POST /api/deadline/grace` both use `SELECT ... FOR UPDATE` in a transaction. `initiateWipe` and `confirmWipe` in the engine also use `FOR UPDATE`. |
| 4 | GET /api/crypto/shard returns 403 when deadline_state.state is not 'active' | VERIFIED | `crypto.ts` lines 57-67: queries `deadline_state WHERE user_id = $1`, returns `403 { error: 'Diary deadline has passed' }` if `state !== 'active'`. |
| 5 | Deadline timestamps stored in UTC; computed from user's IANA timezone so DST transitions do not shift deadline by 1h | VERIFIED | `computeDeadlineUTC` in `deadline-engine.ts` uses Luxon: `DateTime.now().setZone(ianaTimezone).plus({ hours: windowHours }).toUTC().toJSDate()`. Unit tests exercise this. |
| 6 | In-app DeadlineBanner fetches /api/deadline and renders countdown from deadline_at | VERIFIED | `DeadlineBanner.tsx` fetches `/api/deadline` with `credentials:'include'` on mount, refreshes every 60s via `setInterval`, renders color-coded countdown. |

### Observable Truths (Plan 02) — includes re-verified gap items

| # | Truth | Status | Evidence |
|---|-------|--------|----------|
| 7 | Push warnings fire at 24h/4h/1h/15min remaining, with tone escalating from gentle to urgent to final | VERIFIED (was FAILED) | `deadline.ts` lines 90-103: thresholds array now uses `{ minutes, tone }` with values 1440/240/60/15; INSERT uses `(user_id, threshold_minutes, tone)`. No `hours_before`, `label`, or `urgency` references remain. `deadline.test.ts` lines 190-195 assert correct column names and absence of wrong ones. |
| 8 | iOS PWA check gates push subscription — subscribeIfInstalled is a no-op in a browser tab | VERIFIED | `push.ts` `isStandalone()` checks `navigator.standalone` (iOS) and `window.matchMedia('(display-mode: standalone)')`. Returns early if not standalone. Unit test confirms no-op behavior. |
| 9 | App re-subscribes on every launch to handle iOS silent subscription expiry | VERIFIED | `subscribeIfInstalled` calls `getSubscription()` then `existing.unsubscribe()` before subscribing. Unit test covers this path. |
| 10 | urgency: 'high' is passed for urgent and final tone warnings so they survive low-power mode | VERIFIED | `notification-sender.ts` line 66: `const urgency = tone === 'gentle' ? 'normal' : 'high'`. Unit tests in `notification-sender.test.ts` verify urgency mapping. |
| 11 | Push permission is never requested on page load — only via an explicit Enable button after user engagement | VERIFIED | `EnableNotificationsButton.tsx`: `Notification.requestPermission()` is only called inside `handleClick()`. No call on mount. |
| 12 | Service worker handles push events and shows a notification using showNotification | VERIFIED | `sw.ts` lines 45-61: `self.addEventListener('push', ...)` calls `event.waitUntil(self.registration.showNotification(...))`. |
| 13 | Stale 410/404 subscriptions are deleted from the notifications table on send failure | VERIFIED (was FAILED) | `deadline-engine.ts` correctly catches 410/404 and issues `DELETE FROM notifications`. `notifications.ts` upsert now has a backing unique index: `CREATE UNIQUE INDEX idx_notifications_user_endpoint ON notifications(user_id, (subscription->>'endpoint'))` added to `001.do.create-schema.sql` line 114. `notifications.test.ts` line 74 asserts the `subscription->>'endpoint'` expression is present in upsert SQL. |

### Observable Truths (Plan 03)

| # | Truth | Status | Evidence |
|---|-------|--------|----------|
| 14 | Grace day invocation extends deadline_at by 24h and records grace_used_at | VERIFIED | `POST /api/deadline/grace` in `deadline.ts`: `UPDATE deadline_state SET deadline_at = deadline_at + INTERVAL '24 hours', grace_used_at = now(), grace_budget = 0`. Uses FOR UPDATE lock. |
| 15 | Grace budget returns 429 when budget=0 within the same 7-day window | VERIFIED | `if (effectiveBudget < 1) return reply.status(429).send(...)`. `effectiveBudget` is 0 when `grace_budget=0` and `grace_used_at` within 7 days. |
| 16 | Grace budget resets to 1 automatically when grace_used_at is > 7 days ago (or null) | VERIFIED | Luxon `now.diff(lastGrace, 'days').days >= 7` check sets `effectiveBudget = 1`. Tested in `deadline.test.ts`. |
| 17 | Weekly grace budget is visible in the UI | VERIFIED | `GraceDayButton.tsx`: renders "Grace day used this week" (disabled) when `graceBudget=0`, "Invoke Grace Day (1 remaining this week)" when `graceBudget=1`. |
| 18 | Weakening a commitment sets pending_effective_at = now + 7 days — not applied immediately | VERIFIED | `deadline.ts` lines 138-149: `windowWeakening || wordMinimumWeakening` branch sets `pending_effective_at = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000)`. |
| 19 | Strengthening a commitment applies immediately with no pending period | VERIFIED | Lines 126-136: `windowStrengthening || wordMinimumStrengthening` branch updates `window_hours`/`word_minimum` directly. |
| 20 | GET /api/deadline response includes pending_* fields | VERIFIED | `GET /api/deadline` selects `pending_window_hours, pending_word_minimum, pending_effective_at` and returns them. `AkrasiaSettings.tsx` reads these props. |

**Score:** 20/20 truths verified (all must-haves pass; 3 items still need human verification for end-to-end runtime behavior)

## Required Artifacts

| Artifact | Expected | Status | Details |
|----------|----------|--------|---------|
| `apps/api/src/lib/deadline-engine.ts` | Pure engine: checkDeadlines, computeDeadlineUTC, initiateWipe, confirmWipe | VERIFIED | All 4 exports present, substantive (285 lines), wired to poller plugin |
| `apps/api/src/lib/__tests__/deadline-engine.test.ts` | Unit tests for state machine | VERIFIED | 9 test cases covering all state transitions, wipe idempotency, Akrasia promotion |
| `apps/api/src/plugins/deadline-poller.ts` | Fastify plugin: setInterval in onReady, clearInterval in onClose | VERIFIED | Uses `fp()`, registers hooks, imports `checkDeadlines` and `initVapid` |
| `apps/api/src/plugins/__tests__/deadline-poller.test.ts` | Interval lifecycle tests | VERIFIED | 2 tests: interval registered at 60_000ms, error in checkDeadlines doesn't crash server |
| `apps/api/src/routes/deadline.ts` | GET + POST settings (with correct threshold INSERT) + POST checkin + POST grace | VERIFIED | All 4 routes present. Threshold INSERT now uses `(user_id, threshold_minutes, tone)` with integer minute values 1440/240/60/15. No `hours_before`, `label`, or `urgency` references. |
| `apps/api/src/routes/__tests__/deadline.test.ts` | Route tests including gap closure assertions | VERIFIED | 17+ tests; added assertions: `thresholdInsertSqls[0]` contains "threshold_minutes" and "tone", does not contain "hours_before", "label", or "urgency" |
| `apps/api/src/routes/crypto.ts` | Updated with deadline_state gate | VERIFIED | Lines 57-67 add deadline_state check returning 403 before shard retrieval |
| `apps/api/migrations/001.do.create-schema.sql` | Unique index on notifications(user_id, subscription->>'endpoint') | VERIFIED | Line 114: `CREATE UNIQUE INDEX idx_notifications_user_endpoint ON notifications(user_id, (subscription->>'endpoint'));` |
| `apps/web/components/DeadlineBanner.tsx` | Countdown banner polling /api/deadline | VERIFIED | 'use client', fetch on mount, 60s interval, pending_wipe message, color-coded countdown |
| `apps/api/src/lib/notification-sender.ts` | sendDeadlineWarning + initVapid | VERIFIED | Both exports present, urgency mapping correct, TTL = minutesRemaining * 60 |
| `apps/api/src/lib/__tests__/notification-sender.test.ts` | Urgency and TTL unit tests | VERIFIED | Mocks web-push, 11 tests per summary |
| `apps/api/src/routes/notifications.ts` | POST + DELETE /api/notifications/subscribe | VERIFIED | ON CONFLICT clause now has backing unique index; upsert will succeed at runtime |
| `apps/api/src/routes/__tests__/notifications.test.ts` | upsert SQL references subscription->>'endpoint' expression | VERIFIED | Line 74: `expect(insertSqls.some((sql) => sql.includes("subscription->>'endpoint'"))).toBe(true)` |
| `apps/web/lib/push.ts` | subscribeIfInstalled + unsubscribe | VERIFIED | Standalone gate, re-subscribe pattern, POSTs to /api/notifications/subscribe |
| `apps/web/lib/__tests__/push.test.ts` | iOS gate and re-subscribe tests | VERIFIED | 4 tests per summary |
| `apps/web/app/sw.ts` | push + notificationclick event handlers | VERIFIED | Both handlers appended after `serwist.addEventListeners()`, use `showNotification` and `openWindow('/write')` |
| `apps/web/components/EnableNotificationsButton.tsx` | Soft-ask button | VERIFIED | Permission deferred to click handler, renders null when asked/unavailable/granted |
| `apps/web/components/GraceDayButton.tsx` | Grace day button with budget | VERIFIED | Budget-aware labels, POST /api/deadline/grace, 429/409 error display, loading state |
| `apps/web/components/AkrasiaSettings.tsx` | Settings form with pending messaging | VERIFIED | Two inputs, pending change display with effective date, POST /api/deadline/settings |
| `apps/web/components/__tests__/GraceDayButton.test.tsx` | 6 tests for error states | VERIFIED | All 6 cases: budget=0 disabled, 429/409 errors, success callback, loading state |

## Key Link Verification

| From | To | Via | Status | Details |
|------|----|-----|--------|---------|
| `deadline-poller.ts` | `deadline-engine.ts` | `import checkDeadlines; checkDeadlines(fastify.pg, ...)` | WIRED | `checkDeadlines(fastify.pg, fastify.log)` on line 13 |
| `deadline-poller.ts` | `notification-sender.ts` | `initVapid()` in onReady | WIRED | `initVapid()` called on line 10, before setInterval |
| `deadline-engine.ts` | `notification-sender.ts` | `import sendDeadlineWarning` | WIRED | Import on line 4; called in threshold-crossing loop line 265 |
| `deadline.ts` (checkin/grace) | `deadline_state` | `SELECT ... FOR UPDATE` in transaction | WIRED | Both checkin and grace routes use `pool.connect()` + `BEGIN` + `FOR UPDATE` |
| `crypto.ts` | `deadline_state.state` | `SELECT state FROM deadline_state WHERE user_id = $1` | WIRED | Lines 57-67; returns 403 if state != 'active' |
| `DeadlineBanner.tsx` | `/api/deadline` | `fetch('/api/deadline', { credentials: 'include' })` | WIRED | In `fetchDeadline()` on line 70 |
| `push.ts` | `/api/notifications/subscribe` | POST fetch after subscribe() | WIRED | Line 72: `fetch('/api/notifications/subscribe', { method: 'POST', ... })` |
| `sw.ts` | `self.registration.showNotification` | push event listener with event.waitUntil | WIRED | Line 61: `event.waitUntil(self.registration.showNotification(...))` |
| `GraceDayButton.tsx` | `/api/deadline/grace` | POST fetch on button click | WIRED | Line 23: `fetch('/api/deadline/grace', { method: 'POST', credentials: 'include' })` |
| `AkrasiaSettings.tsx` | `/api/deadline/settings` | POST fetch on form submit | WIRED | Line 44: `fetch('/api/deadline/settings', { method: 'POST', credentials: 'include', ... })` |
| `deadline.ts` | `notification_thresholds` | INSERT with (user_id, threshold_minutes, tone) | WIRED | Lines 97-103: INSERT SQL uses correct columns; values are integer minutes. Gap 1 closed. |
| `notifications.ts` | unique index idx_notifications_user_endpoint | ON CONFLICT backed by idx_notifications_user_endpoint | WIRED | Migration line 114: `CREATE UNIQUE INDEX idx_notifications_user_endpoint`. Gap 2 closed. |

## Requirements Coverage

| Requirement | Source Plan | Description | Status | Evidence |
|-------------|------------|-------------|--------|---------|
| DMS-01 | 05-01 | Configurable check-in window (default 24h, range 12h–7 days) | SATISFIED | `POST /api/deadline/settings` accepts `window_hours`; default 24 on creation; `AkrasiaSettings` input min=12 max=168 |
| DMS-02 | 05-01 | Configurable word minimum (default 50, range 25–500) | SATISFIED | `word_minimum` param in settings; default 50; `AkrasiaSettings` input min=25 max=500 |
| DMS-03 | 05-01 | Server-side deadline state machine with absolute UTC timestamps | SATISFIED | `deadline_state` schema with `deadline_at TIMESTAMPTZ`; `computeDeadlineUTC` returns UTC Date |
| DMS-04 | 05-01 | Deadline computed in user's IANA timezone via date library | SATISFIED | Luxon `DateTime.now().setZone(ianaTimezone).plus({hours}).toUTC()` |
| DMS-05 | 05-01 | Poller every 60s — not a cron scheduler | SATISFIED | `setInterval(60_000)` in Fastify `onReady` hook |
| DMS-06 | 05-01 | Two-phase wipe: mark pending → 60s settle → confirm → delete shard | SATISFIED | `initiateWipe` sets `pending_wipe`, `confirmWipe` checks 60s age, sets `shard_deleted=true` before `DELETE` |
| DMS-07 | 05-01 | Row-level locks prevent race between check-in and wipe | SATISFIED | `FOR UPDATE` in checkin, grace, initiateWipe, and confirmWipe |
| DMS-08 | 05-01 | Wipe log written BEFORE shard deletion | SATISFIED | `UPDATE wipe_log SET shard_deleted=true` before `DELETE FROM server_shards` in `confirmWipe` |
| DMS-09 | 05-03 | Grace day: one 24h reprieve per week | SATISFIED | `POST /api/deadline/grace` with 7-day rolling Luxon budget reset, `GraceDayButton` shows budget |
| DMS-10 | 05-01/03 | Akrasia Horizon: weakening requires 7-day advance; strengthening immediate | SATISFIED | Mixed-axis logic in `deadline.ts`; `checkDeadlines` promotes `pending_*` when `pending_effective_at <= now` |
| NOTIF-01 | 05-02/04 | Push notification warnings at configurable thresholds | SATISFIED | `sendDeadlineWarning` and `checkDeadlines` threshold loop exist; thresholds now seeded with correct columns (threshold_minutes, tone); subscriptions insertable via upsert with backing unique index |
| NOTIF-02 | 05-02/04 | Warning tone escalates from gentle to urgent to final | SATISFIED | `formatWarningBody` and urgency mapping correct; thresholds seeded at 1440/240/60/15 minutes with gentle/urgent/urgent/final tones |
| NOTIF-03 | 05-02 | Push gated behind Home Screen install check on iOS | SATISFIED | `isStandalone()` in `push.ts` checks `navigator.standalone` and `display-mode: standalone` |
| NOTIF-04 | 05-02 | Re-subscribe on every app launch | SATISFIED | `subscribeIfInstalled` unsubscribes existing before new subscribe |
| NOTIF-05 | 05-01 | In-app deadline banner as backup | SATISFIED | `DeadlineBanner.tsx` is the primary in-app source of truth for deadline status |
| NOTIF-06 | 05-02 | urgency: 'high' on deadline warnings | SATISFIED | `notification-sender.ts`: `urgency = tone === 'gentle' ? 'normal' : 'high'` |
| NOTIF-07 | 05-02 | Soft-ask pattern for push permission | SATISFIED | `EnableNotificationsButton` only calls `requestPermission` on explicit button click |

## Anti-Patterns Found

No blockers or warnings remain. Both prior blockers are resolved:

- `deadline.ts` INSERT now uses correct column names — no runtime column-not-found error
- `001.do.create-schema.sql` now creates `idx_notifications_user_endpoint` — ON CONFLICT clause is backed

## Human Verification Required

### 1. Push Notification End-to-End

**Test:** Install the PWA on an iOS 16.4+ device from Home Screen. Configure deadline. Enable notifications via the button. Let the deadline approach the 24h threshold.
**Expected:** Receive a push notification with title "Dead Letter Diary" and body "Your diary is waiting. 24 hours remaining." with normal urgency. At 1h remaining, receive notification with urgency 'high'.
**Why human:** Requires physical device with installed PWA, real VAPID keys, and real Web Push delivery. Cannot be automated.

### 2. Grace Day Budget Visibility and Reset

**Test:** Invoke grace day when `grace_budget=1`. Verify UI shows "Grace day used this week" (disabled). Invoke again — expect 429.
**Expected:** Budget decrements visually. After 7 days from `grace_used_at`, button re-enables.
**Why human:** Time-dependent state reset cannot be short-circuited in production UI testing.

### 3. Two-Phase Wipe Server Restart Resilience

**Test:** Let deadline expire (wait or manually set `deadline_at` to past). Verify `state=pending_wipe`. Immediately kill the server process before 60s settle window. Restart. Advance time or wait 60s.
**Expected:** Poller picks up the `pending_wipe` state on next tick and completes the wipe — `state=wiped`, `shard_deleted=true`, `server_shards` row deleted.
**Why human:** Requires deliberate process termination and restart during a live state transition.

## Gaps Summary

Both prior blockers are closed. The push notification system is now fully unblocked at the SQL/runtime level:

- **Gap 1 (NOTIF-01, NOTIF-02) — closed:** `deadline.ts` threshold INSERT uses `(user_id, threshold_minutes, tone)` with integer minute values. The wrong columns `hours_before`, `label`, `urgency` no longer appear anywhere in the file. `deadline.test.ts` has assertions confirming correct column names.

- **Gap 2 (NOTIF-01 through NOTIF-07) — closed:** `001.do.create-schema.sql` now includes `CREATE UNIQUE INDEX idx_notifications_user_endpoint ON notifications(user_id, (subscription->>'endpoint'))` at line 114. The `ON CONFLICT` clause in `notifications.ts` is backed by this index and will no longer throw at runtime. `notifications.test.ts` asserts the endpoint expression is present in upsert SQL.

All 17 requirements (DMS-01 through DMS-10, NOTIF-01 through NOTIF-07) are SATISFIED. The full test suite (12 files, 80 tests) is green per the 05-04-SUMMARY.md.

---

_Initial verified: 2026-06-07T22:00:00Z_
_Re-verified: 2026-06-07T22:30:00Z_
_Verifier: Claude (gsd-verifier)_
