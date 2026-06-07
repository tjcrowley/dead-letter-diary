---
phase: 05-dead-mans-switch
plan: 03
subsystem: api, ui
tags: [grace-days, akrasia, deadline, luxon, react, vitest, testing-library]

requires:
  - phase: 05-dead-mans-switch
    provides: deadline_state schema with grace_budget/grace_used_at and pending_* Akrasia columns; scaffolded deadline.ts routes

provides:
  - POST /api/deadline/grace — full grace day endpoint with FOR UPDATE lock, 7-day budget reset, 429/409/404 guards
  - GraceDayButton React component with budget-aware UI, loading state, and error display
  - AkrasiaSettings React component with pending change messaging and effective date display
  - Full grace day test coverage (17 deadline tests including all edge cases)
  - GraceDayButton.test.tsx (6 tests covering all error states and success callback)

affects: [phase-06-shard-security, phase-07-installer-ux]

tech-stack:
  added:
    - "@testing-library/user-event (dev dependency for web tests)"
  patterns:
    - "Grace day budget reset: Luxon diff >= 7 days from grace_used_at resets budget to 1"
    - "FOR UPDATE transaction pattern in grace route mirrors checkin route (DMS-07)"
    - "Mixed Akrasia axis: each axis handled independently — stronger immediately, weaker pending"
    - "UI fetch error handling: map HTTP status codes to user-facing error strings client-side"

key-files:
  created:
    - apps/web/components/GraceDayButton.tsx
    - apps/web/components/AkrasiaSettings.tsx
    - apps/web/components/__tests__/GraceDayButton.test.tsx
  modified:
    - apps/api/src/routes/deadline.ts
    - apps/api/src/routes/__tests__/deadline.test.ts

key-decisions:
  - "Mixed Akrasia axis logic: each axis evaluated independently — word_minimum strengthening writes immediately even when window_hours weakens (and vice versa); results in up to 2 UPDATE statements"
  - "Grace budget reset uses Luxon diff in days (>= 7) not calendar week — rolling 7-day window, not Mon-Sun reset"
  - "@testing-library/user-event installed as missing dev dep (Rule 3 auto-fix)"

patterns-established:
  - "GraceDayButton: parent passes graceBudget from GET /api/deadline response; onGraceUsed callback triggers parent refetch"
  - "AkrasiaSettings: server determines strengthen vs weaken — client reflects pending_* fields back as 'N pending — effective [date]' messaging"

requirements-completed:
  - DMS-09
  - DMS-10

duration: 15min
completed: 2026-06-07
---

# Phase 5 Plan 3: Grace Days and Akrasia UI Summary

**POST /api/deadline/grace with FOR UPDATE lock + 7-day Luxon budget reset + GraceDayButton and AkrasiaSettings React components with full test coverage**

## Performance

- **Duration:** ~15 min
- **Started:** 2026-06-07T21:25:00Z
- **Completed:** 2026-06-07T21:40:00Z
- **Tasks:** 2
- **Files modified:** 5 (3 created, 2 modified)

## Accomplishments

- POST /api/deadline/grace implemented with transaction-level FOR UPDATE lock (DMS-07 race prevention), Luxon-based 7-day rolling budget reset, and 409/429/404 guards
- Akrasia mixed-axis bug fixed: each commitment axis (word_minimum, window_hours) now evaluated independently so strengthening one axis is never blocked by weakening the other
- GraceDayButton component with disabled/enabled states, 429/409 inline errors, loading state, and onGraceUsed callback
- AkrasiaSettings component with two number inputs and "Change to N pending — effective [date]" messaging when weakening is queued
- 17 API deadline tests pass; 78 web tests pass (6 new GraceDayButton tests)

## Task Commits

1. **Task 1: Grace day route and full test coverage** - `6528ca5` (feat)
2. **Task 2: GraceDayButton and AkrasiaSettings UI components** - `cb3be83` (feat)

**Plan metadata:** (docs commit follows)

## Files Created/Modified

- `apps/api/src/routes/deadline.ts` - Added POST /api/deadline/grace route; fixed mixed-axis Akrasia logic
- `apps/api/src/routes/__tests__/deadline.test.ts` - Added 8 new tests: grace 401/404/409/429/reset/200/FOR-UPDATE, Akrasia weaken/mixed
- `apps/web/components/GraceDayButton.tsx` - Grace day invocation button with budget display and error handling
- `apps/web/components/AkrasiaSettings.tsx` - Settings form with pending change display
- `apps/web/components/__tests__/GraceDayButton.test.tsx` - 6 tests covering all button states and error paths

## Decisions Made

- Mixed Akrasia axis: plan spec said "treat each axis independently" — the prior implementation collapsed everything into a single conditional. Fixed to run up to two UPDATE statements when axes diverge in direction.
- Grace budget reset uses a rolling 7-day window (Luxon diff >= 7 days from grace_used_at), not a Mon-Sun calendar week.
- @testing-library/user-event was missing from devDependencies — installed as a Rule 3 blocking auto-fix.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Fixed mixed-axis Akrasia logic collapse**
- **Found during:** Task 1 (writing mixed-axis test)
- **Issue:** The existing settings route used a single `if (windowWeakening || wordMinimumWeakening)` branch that would send ALL axes to pending even if only one was weakening — strengthening on one axis was suppressed
- **Fix:** Rewrote to evaluate each axis independently: strengthening axes run an immediate UPDATE; weakening axes run a separate pending UPDATE
- **Files modified:** apps/api/src/routes/deadline.ts
- **Verification:** Mixed-axis test passes; all 17 deadline tests pass; full API suite green
- **Committed in:** 6528ca5 (Task 1 commit)

**2. [Rule 3 - Blocking] Installed missing @testing-library/user-event**
- **Found during:** Task 2 (running RED test for GraceDayButton)
- **Issue:** @testing-library/user-event not in devDependencies; import fails at test run
- **Fix:** `npm install --save-dev @testing-library/user-event --workspace=apps/web`
- **Files modified:** package.json, package-lock.json
- **Verification:** GraceDayButton tests run and pass
- **Committed in:** cb3be83 (Task 2 commit)

---

**Total deviations:** 2 auto-fixed (1 bug, 1 blocking)
**Impact on plan:** Both necessary for correctness and test execution. No scope creep.

## Issues Encountered

None beyond the deviations documented above.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

- Grace day mechanics complete and tested; ready for Phase 6 shard security
- DeadlineBanner can now import GraceDayButton and pass graceBudget from GET /api/deadline response
- AkrasiaSettings can be mounted in any settings page with the pending_* fields from GET /api/deadline

---
*Phase: 05-dead-mans-switch*
*Completed: 2026-06-07*
