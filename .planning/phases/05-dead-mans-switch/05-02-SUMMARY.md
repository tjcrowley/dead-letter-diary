---
phase: 05-dead-mans-switch
plan: 02
subsystem: api, web
tags: [push-notifications, web-push, vapid, service-worker, pwa, tdd, notif]

# Dependency graph
requires:
  - phase: 05-dead-mans-switch
    plan: 01
    provides: deadline-engine checkDeadlines stub, deadline-poller plugin, DB notifications table
provides:
  - sendDeadlineWarning() with urgency escalation (NOTIF-01, NOTIF-06)
  - POST/DELETE /api/notifications/subscribe (NOTIF-02)
  - subscribeIfInstalled() with iOS standalone gate (NOTIF-03, NOTIF-04)
  - SW push + notificationclick handlers (NOTIF-01, NOTIF-02)
  - EnableNotificationsButton — soft-ask UI (NOTIF-07)
affects: [05-dead-mans-switch plan 03]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "initVapid() no-op when VAPID keys absent — safe in test/dev before first run"
    - "vi.resetModules() in beforeEach for navigator/window stub isolation in push tests"
    - "Re-subscribe on every launch: getSubscription() + unsubscribe() before subscribe() (iOS expiry)"
    - "urgency:'high' for urgent/final tone — survives iOS low-power mode"

key-files:
  created:
    - apps/api/src/lib/notification-sender.ts
    - apps/api/src/lib/__tests__/notification-sender.test.ts
    - apps/api/src/routes/notifications.ts
    - apps/api/src/routes/__tests__/notifications.test.ts
    - apps/web/lib/push.ts
    - apps/web/lib/__tests__/push.test.ts
    - apps/web/components/EnableNotificationsButton.tsx
  modified:
    - apps/api/src/lib/deadline-engine.ts
    - apps/api/src/plugins/deadline-poller.ts
    - apps/api/src/server.ts
    - apps/web/app/sw.ts
    - .env.example

key-decisions:
  - "initVapid() is a no-op when VAPID_PUBLIC_KEY/VAPID_PRIVATE_KEY are absent — allows poller tests to call ready() without real keys"
  - "ON CONFLICT uses subscription->>'endpoint' JSONB extraction — avoids adding endpoint TEXT column to notifications table"
  - "vi.resetModules() required in push.test.ts to isolate navigator stubs between tests — vitest caches module imports"
  - "formatWarningBody exported separately for unit testability (pure function, no side effects)"

# Metrics
duration: 5min
completed: 2026-06-07
---

# Phase 5 Plan 02: Web Push Notification System Summary

**VAPID push sender with urgency escalation, subscribe/unsubscribe API routes, iOS standalone gate, re-subscribe on launch, SW push/click handlers, and soft-ask Enable Notifications button**

## Performance

- **Duration:** 5 min
- **Started:** 2026-06-07T14:19:00Z
- **Completed:** 2026-06-07T14:24:00Z
- **Tasks:** 2
- **Files modified:** 12 (7 created, 5 modified)

## Accomplishments

- `notification-sender.ts`: `initVapid()` (one-time VAPID setup) + `sendDeadlineWarning()` (urgency mapping) + `formatWarningBody()` (tone-specific copy)
- Urgency 'high' for urgent/final tones so notifications survive iOS low-power mode (NOTIF-06)
- TTL = minutesRemaining × 60 seconds; stale 410/404 subscriptions auto-deleted in `checkDeadlines`
- POST/DELETE `/api/notifications/subscribe` routes with `requireAuth` guard; upsert uses JSONB `subscription->>'endpoint'` for deduplication
- `deadline-engine.ts` stub replaced with real threshold-crossing push delivery + stale subscription cleanup
- `deadline-poller.ts` calls `initVapid()` in `onReady` before `setInterval` (one-time VAPID init)
- `push.ts`: `subscribeIfInstalled()` checks `navigator.standalone` (iOS) and `display-mode: standalone` (Android) before subscribing
- Re-subscribes on every launch (unsubscribe existing → subscribe new) to handle iOS silent expiry (NOTIF-04)
- `sw.ts`: push event listener with `showNotification()` + `notificationclick` listener opening `/write`
- `EnableNotificationsButton`: 'use client' component, never requests permission on mount, defers to user gesture (NOTIF-07)

## Task Commits

1. **Task 1: Server-side push sender and notifications routes** — `337238d`
2. **Task 2: Client push subscription, SW push handler, soft-ask button** — `0787a70`

## Files Created/Modified

- `apps/api/src/lib/notification-sender.ts` — initVapid, sendDeadlineWarning, formatWarningBody
- `apps/api/src/lib/__tests__/notification-sender.test.ts` — 11 tests: urgency, TTL, 410/404 propagation
- `apps/api/src/routes/notifications.ts` — POST + DELETE /api/notifications/subscribe
- `apps/api/src/routes/__tests__/notifications.test.ts` — 5 tests: upsert SQL, delete, auth guards
- `apps/api/src/lib/deadline-engine.ts` — replaced log.info stub with real push sends + stale cleanup
- `apps/api/src/plugins/deadline-poller.ts` — added initVapid() call in onReady
- `apps/api/src/server.ts` — registered notificationsRoutes
- `apps/web/lib/push.ts` — subscribeIfInstalled, unsubscribe, urlBase64ToUint8Array
- `apps/web/lib/__tests__/push.test.ts` — 4 tests: standalone gate, re-subscribe, POST body, base64
- `apps/web/app/sw.ts` — appended push + notificationclick event handlers
- `apps/web/components/EnableNotificationsButton.tsx` — soft-ask button component
- `.env.example` — added VAPID_CONTACT_EMAIL and NEXT_PUBLIC_VAPID_PUBLIC_KEY entries

## Decisions Made

- **initVapid no-op on missing keys:** `webpush.setVapidDetails` throws if public/private key empty strings. Made `initVapid` skip the call when keys aren't set — safe for test environments before `ensureSecrets()` has run
- **JSONB endpoint extraction:** The `notifications` table stores the full subscription as `JSONB` with no separate `endpoint` column. Used `subscription->>'endpoint'` for the `ON CONFLICT` and `DELETE WHERE` clauses — avoids a schema migration while satisfying the deduplication requirement
- **vi.resetModules() for push tests:** `subscribeIfInstalled` reads `navigator` at call time, not module import time. vitest caches modules between tests in the same file. `vi.resetModules()` in `beforeEach` forces a fresh import per test, making navigator stubs effective
- **formatWarningBody exported:** Pure function with no side effects — exported separately so tests can verify message content without going through `sendDeadlineWarning`

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 2 - Missing critical functionality] initVapid no-op guard for missing VAPID keys**
- **Found during:** Task 1 (full test suite run after implementing deadline-poller update)
- **Issue:** `deadline-poller.test.ts` calls `app.ready()` which triggers `initVapid()`. Without VAPID keys in test env, `webpush.setVapidDetails` throws "No key set vapidDetails.publicKey" — breaking 2 poller tests
- **Fix:** Added guard in `initVapid()` to return early if `VAPID_PUBLIC_KEY` or `VAPID_PRIVATE_KEY` are empty. Also added a test case for the no-op behavior
- **Files modified:** `apps/api/src/lib/notification-sender.ts`, `apps/api/src/lib/__tests__/notification-sender.test.ts`
- **Commit:** 337238d

**2. [Rule 1 - Bug] vi.resetModules() required for push test isolation**
- **Found during:** Task 2 (TDD GREEN phase)
- **Issue:** `subscribeIfInstalled` module was cached from first test with one navigator stub; subsequent tests with different stubs had no effect on the cached module
- **Fix:** Added `vi.resetModules()` to `beforeEach` in push.test.ts; restructured tests to create fresh push manager mocks per test
- **Files modified:** `apps/web/lib/__tests__/push.test.ts`
- **Commit:** 0787a70

---

**Total deviations:** 2 auto-fixed (both correctness issues)
**Impact on plan:** No scope change — both fixes required for test correctness

## Issues Encountered
None beyond the two auto-fixed issues above.

## User Setup Required
None — push notifications are activated via the EnableNotificationsButton in the UI.

## Next Phase Readiness
- Push system is complete end-to-end: server sends → client receives → SW shows notification
- Plan 03 (wipe screen) can build on top without changes to push infrastructure
- All 144 tests green (72 API + 72 web), no regressions
