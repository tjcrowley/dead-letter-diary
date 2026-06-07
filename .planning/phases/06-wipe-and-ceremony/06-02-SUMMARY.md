---
phase: 06-wipe-and-ceremony
plan: 02
subsystem: ui
tags: [service-worker, indexeddb, cache-api, next-js, vitest, react, tailwind]

# Dependency graph
requires:
  - phase: 06-wipe-and-ceremony
    provides: "Plan 01: server-side wipe (POST /api/wipe/panic, wipe_log table, sendWipeNotification)"
  - phase: 04-offline-pwa
    provides: "Dexie db (DeadLetterDiary), Cache Storage, Service Worker setup via Serwist"
  - phase: 05-dead-mans-switch
    provides: "DeadlineBanner component, /api/deadline endpoint with state field"

provides:
  - "performClientWipe() in apps/web/lib/wipe.ts — deletes IDB, clears caches, expires cookie"
  - "SW push handler type:'wipe' branch — navigates clients to /wiped then deletes IDB in worker context"
  - "/wiped route (apps/web/app/wiped/page.tsx) — gravestone ceremony screen, fetches epitaph only"
  - "PanicEncryptButton — typed DESTROY confirmation gate before POST /api/wipe/panic"
  - "DeadlineBanner wipe guard — calls performClientWipe + router.replace('/wiped') on state=wiped"

affects:
  - 07-installer-ux
  - any page importing DeadlineBanner (banner now redirects on wiped state)

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "SW wipe ordering: navigate clients before deleteDatabase to avoid onblocked deadlock"
    - "Belt-and-suspenders wipe: SW push fires wipe, DeadlineBanner polls and redirects, /wiped page re-clears cookie"
    - "Typed confirmation gate: user must type DESTROY (exact match) before destructive API call"

key-files:
  created:
    - apps/web/lib/wipe.ts
    - apps/web/lib/__tests__/wipe.test.ts
    - apps/web/app/wiped/page.tsx
    - apps/web/app/wiped/__tests__/page.test.tsx
    - apps/web/components/PanicEncryptButton.tsx
    - apps/web/components/__tests__/PanicEncryptButton.test.tsx
  modified:
    - apps/web/app/sw.ts
    - apps/web/components/DeadlineBanner.tsx

key-decisions:
  - "SW wipe branch navigates clients to /wiped BEFORE indexedDB.deleteDatabase — prevents onblocked deadlock from open connections"
  - "performClientWipe wraps db.delete() in try/catch — repeated calls are safe (already-deleted DB is not an error)"
  - "DeadlineBanner wipe redirect happens in fetchDeadline callback before setDeadlineState, preventing any wiped-state render"
  - "PanicEncryptButton uses named export (not default) to match existing component convention in tests"

patterns-established:
  - "Wipe ceremony order: (1) clear caches, (2) navigate clients, (3) delete IDB, (4) show notification"
  - "SSR guard: 'typeof caches !== undefined' check before any Cache Storage API call"
  - "Two-step destructive action: show dialog → require typed confirmation → call API → wipe locally → redirect"

requirements-completed: [WIPE-02, WIPE-03, WIPE-05, WIPE-06]

# Metrics
duration: 18min
completed: 2026-06-07
---

# Phase 06 Plan 02: Wipe Ceremony Client Side Summary

**Service Worker type:'wipe' push handler, performClientWipe() lib, /wiped gravestone page, PanicEncryptButton with typed DESTROY gate, and DeadlineBanner wipe redirect — 95 tests passing**

## Performance

- **Duration:** 18 min
- **Started:** 2026-06-07T15:45:00Z
- **Completed:** 2026-06-07T15:48:00Z
- **Tasks:** 2
- **Files modified:** 8 (6 created, 2 modified)

## Accomplishments
- performClientWipe() deletes Dexie IDB, clears all Cache Storage keys, and expires the session cookie — safe to call repeatedly
- SW push handler extended with type:'wipe' branch: navigates open clients to /wiped, then deletes IDB (navigate-first ordering avoids onblocked deadlock), then shows wipe notification with requireInteraction:true
- /wiped page renders only title + epitaph (fetched from /api/account/epitaph); no imports from entries or crypto modules; clears session cookie on mount
- PanicEncryptButton requires user to type "DESTROY" before the confirm button enables; on 200 calls performClientWipe then redirects; on non-200 shows error in dialog
- DeadlineBanner now calls performClientWipe + router.replace('/wiped') when API returns state=wiped, instead of returning null

## Task Commits

Each task was committed atomically:

1. **Task 1: performClientWipe() lib + SW type:'wipe' push handler** - `31fdca3` (feat)
2. **Task 2: /wiped page, PanicEncryptButton, DeadlineBanner wipe guard** - `1bd41e3` (feat)

**Plan metadata:** (docs commit — this summary)

## Files Created/Modified
- `apps/web/lib/wipe.ts` - Three-step client wipe: IDB delete, cache clear, session cookie expire
- `apps/web/lib/__tests__/wipe.test.ts` - 5 tests: db.delete called, error resilience, caches cleared, cookie set, SSR guard
- `apps/web/app/sw.ts` - Extended push handler with type:'wipe' branch (navigate → deleteIDB → notification)
- `apps/web/app/wiped/page.tsx` - Gravestone ceremony screen — title, optional epitaph, no diary content
- `apps/web/app/wiped/__tests__/page.test.tsx` - 4 tests: title renders, epitaph shown/not-shown, no forbidden endpoints
- `apps/web/components/PanicEncryptButton.tsx` - Dialog with DESTROY confirmation gate and POST /api/wipe/panic
- `apps/web/components/__tests__/PanicEncryptButton.test.tsx` - 8 tests: dialog visibility, confirm disable/enable, API sequencing, cancel, error display
- `apps/web/components/DeadlineBanner.tsx` - Wipe redirect via performClientWipe + router.replace in fetchDeadline callback

## Decisions Made
- SW wipe branch navigates clients to /wiped BEFORE deleteDatabase — this prevents the onblocked event by closing all open IDB connections first
- performClientWipe wraps db.delete() in try/catch so repeated calls (e.g., SW wipes then /wiped page mounts) don't throw
- DeadlineBanner redirect happens inside fetchDeadline before setDeadlineState so the wiped state is never rendered as a banner
- PanicEncryptButton uses named export to match the test import style already established in the component test files

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered
None.

## User Setup Required
None - no external service configuration required.

## Next Phase Readiness
- Phase 06 complete: server wipe (Plan 01) and client wipe ceremony (Plan 02) both done
- Phase 07 (installer UX) can proceed — all wipe infrastructure is in place
- PanicEncryptButton is ready to be placed on a settings/account page in Phase 07
- /wiped route is live and will serve as the landing page after any wipe trigger

---
*Phase: 06-wipe-and-ceremony*
*Completed: 2026-06-07*
