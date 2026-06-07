---
phase: 05-dead-mans-switch
plan: 01
subsystem: api
tags: [deadline, state-machine, fastify, luxon, postgres, tdd, dms]

# Dependency graph
requires:
  - phase: 03-encryption-writing
    provides: server_shards table, crypto routes, entries table, word_count AAD validation
  - phase: 04-offline-pwa
    provides: full api/server.ts plugin registration pattern
provides:
  - Deadline state machine: computeDeadlineUTC, initiateWipe, confirmWipe, checkDeadlines
  - Deadline poller plugin: 60s interval via onReady/onClose lifecycle
  - Deadline HTTP routes: GET /api/deadline, POST /api/deadline/settings, POST /api/deadline/checkin
  - Shard gate: GET /api/crypto/shard returns 403 when state != active
  - DeadlineBanner component: client-side countdown from /api/deadline
affects: [05-dead-mans-switch plan 02, 05-dead-mans-switch plan 03]

# Tech tracking
tech-stack:
  added:
    - luxon 3.7.x (DST-safe timezone arithmetic for deadline computation)
    - "@types/luxon 3.7.x"
  patterns:
    - Two-phase wipe: wipe_log.shard_deleted=true BEFORE DELETE (crash-safe DMS-08)
    - FOR UPDATE lock on deadline_state in both checkin route and poller (race prevention DMS-07)
    - Akrasia weakening: 7-day pending_effective_at delay for setting relaxations
    - Fastify plugin lifecycle: setInterval in onReady, clearInterval in onClose

key-files:
  created:
    - apps/api/src/lib/deadline-engine.ts
    - apps/api/src/lib/__tests__/deadline-engine.test.ts
    - apps/api/src/plugins/deadline-poller.ts
    - apps/api/src/plugins/__tests__/deadline-poller.test.ts
    - apps/api/src/routes/deadline.ts
    - apps/api/src/routes/__tests__/deadline.test.ts
    - apps/web/components/DeadlineBanner.tsx
  modified:
    - apps/api/src/routes/crypto.ts
    - apps/api/src/server.ts
    - apps/api/src/routes/__tests__/crypto.test.ts
    - apps/api/package.json

key-decisions:
  - "luxon used for computeDeadlineUTC — DateTime.now().setZone(tz).plus({hours}).toUTC() handles DST correctly"
  - "Two-phase wipe order: wipe_log.shard_deleted=true then DELETE server_shards — if server crashes between steps, recovery can retry DELETE safely"
  - "Akrasia: only weakening (longer window or lower word_minimum) triggers 7-day pending delay; strengthening is immediate"
  - "Shard gate permissive when no deadline_state row exists — user hasn't configured deadline yet, onboarding flow must still work"
  - "Checkin uses pool.connect() transaction with FOR UPDATE to prevent poller race condition"

patterns-established:
  - "deadline-engine exports pure async functions testable without Fastify — all DB logic isolated from plugin layer"
  - "Poller errors caught and logged, never crash the server (errors in setInterval callback are swallowed with log.error)"
  - "Mock pool with connect() support required for routes that use pool.connect() transactions — mockPoolWithConnect pattern in deadline.test.ts"

requirements-completed:
  - DMS-01
  - DMS-02
  - DMS-03
  - DMS-04
  - DMS-05
  - DMS-06
  - DMS-07
  - DMS-08
  - NOTIF-05

# Metrics
duration: 5min
completed: 2026-06-07
---

# Phase 5 Plan 01: Dead Man's Switch — Core Engine Summary

**Deadline state machine with Luxon DST-safe computation, two-phase crash-safe wipe, FOR UPDATE checkin/poller race prevention, and shard gate enforcing 403 on non-active deadline state**

## Performance

- **Duration:** 5 min
- **Started:** 2026-06-07T14:11:00Z
- **Completed:** 2026-06-07T14:16:00Z
- **Tasks:** 2
- **Files modified:** 11 (7 created, 4 modified)

## Accomplishments
- Pure deadline engine library with computeDeadlineUTC (Luxon DST handling), initiateWipe, confirmWipe, checkDeadlines — all covered by 9 unit tests
- Fastify poller plugin with 60s setInterval lifecycle registered in onReady/cleared in onClose
- Three deadline HTTP routes with Akrasia weakening protection (7-day pending delay) and FOR UPDATE locking on checkin
- GET /api/crypto/shard gated: returns 403 if deadline_state.state is pending_wipe or wiped; permissive when no row
- DeadlineBanner React component polling /api/deadline every 60s with green/yellow/red countdown colors

## Task Commits

1. **Task 1: Deadline engine library and unit tests** - `a74d10b` (feat)
2. **Task 2: Poller plugin, deadline routes, shard gate, DeadlineBanner** - `d30b899` (feat)

**Plan metadata:** (final commit — see below)

## Files Created/Modified
- `apps/api/src/lib/deadline-engine.ts` - computeDeadlineUTC, initiateWipe, confirmWipe, checkDeadlines
- `apps/api/src/lib/__tests__/deadline-engine.test.ts` - 9 unit tests for state machine transitions
- `apps/api/src/plugins/deadline-poller.ts` - Fastify plugin: 60s setInterval in onReady, clearInterval in onClose
- `apps/api/src/plugins/__tests__/deadline-poller.test.ts` - interval lifecycle tests with fake timers
- `apps/api/src/routes/deadline.ts` - GET /api/deadline, POST /api/deadline/settings, POST /api/deadline/checkin
- `apps/api/src/routes/__tests__/deadline.test.ts` - 9 route tests covering GET 404, Akrasia weakening/strengthening, checkin 409, FOR UPDATE
- `apps/web/components/DeadlineBanner.tsx` - Client component: countdown from /api/deadline, 60s refresh, color thresholds
- `apps/api/src/routes/crypto.ts` - Added deadline_state gate before shard retrieval (replaced Phase 5 TODO comment)
- `apps/api/src/routes/__tests__/crypto.test.ts` - Updated query sequence for new deadline_state check
- `apps/api/src/server.ts` - Registered deadlinePollerPlugin and deadlineRoutes
- `apps/api/package.json` - Added luxon + @types/luxon

## Decisions Made
- **Luxon for DST-safe deadlines:** `DateTime.now().setZone(tz).plus({ hours: windowHours }).toUTC()` — naive Date arithmetic would shift deadlines by 1h across DST transitions
- **Two-phase wipe crash safety:** `wipe_log.shard_deleted = true` is set BEFORE `DELETE FROM server_shards`. If the server crashes between the UPDATE and DELETE, recovery can find `shard_deleted=true, confirmed_at IS NOT NULL` and retry the DELETE safely without re-inserting a wipe_log row
- **Akrasia direction detection:** Weakening = `newWindowHours > current.window_hours` OR `newWordMinimum < current.word_minimum`. Strengthening is the inverse. Mixed changes (one stronger, one weaker) default to weakening path to be conservative
- **Shard gate permissive on missing row:** No deadline_state row = user hasn't configured deadline. Blocking here would prevent onboarding
- **mockPoolWithConnect pattern:** `buildTestApp`'s `mockPool` doesn't support `pool.connect()`. Routes using transactions need a pool mock with `connect()` returning a client. Added `mockPoolWithConnect()` helper in deadline.test.ts

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Updated crypto.test.ts for new deadline_state query**
- **Found during:** Task 2 (full test suite verification)
- **Issue:** Adding the deadline_state query to GET /api/crypto/shard broke 2 existing crypto tests — their mock query sequences were offset by 1
- **Fix:** Added deadline_state query response (empty rows = permissive, active row = passes gate) to both affected tests
- **Files modified:** `apps/api/src/routes/__tests__/crypto.test.ts`
- **Verification:** All 53 tests passing after fix
- **Committed in:** d30b899 (Task 2 commit)

**2. [Rule 1 - Bug] Fixed poller test infinite loop with vi.runAllTimersAsync**
- **Found during:** Task 2 (test execution)
- **Issue:** `vi.runAllTimersAsync()` hit the 10,000 timer limit because the async checkDeadlines callback re-triggers on each async tick
- **Fix:** Changed to `vi.advanceTimersByTimeAsync(60_000)` which advances time by exactly 60s without recursive loop
- **Files modified:** `apps/api/src/plugins/__tests__/deadline-poller.test.ts`
- **Verification:** Poller test passes
- **Committed in:** d30b899 (Task 2 commit)

---

**Total deviations:** 2 auto-fixed (both Rule 1 bugs)
**Impact on plan:** Both fixes necessary for test correctness. No scope change.

## Issues Encountered
- None beyond the two auto-fixed test issues above

## User Setup Required
None - no external service configuration required.

## Next Phase Readiness
- Deadline engine is fully wired and tested — Plans 02 and 03 can build on top
- Plan 02 will replace the notification stub in checkDeadlines with real push/email sender
- Plan 03 will add the wipe screen (currently DeadlineBanner renders nothing for `wiped` state)
- All 53 API tests green, no regressions from prior phases

---
*Phase: 05-dead-mans-switch*
*Completed: 2026-06-07*
