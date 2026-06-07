---
phase: 04-offline-pwa
plan: "03"
subsystem: pwa
tags: [indexeddb, storage-api, private-mode, pwa, react, vitest, tdd]

# Dependency graph
requires:
  - phase: 04-offline-pwa-01
    provides: PwaShell, InstallPrompt, WkWebViewGuard components
provides:
  - detectPrivateMode() via SecurityError on IDB open (lib/storage.ts)
  - callPersist() wrapping navigator.storage.persist() (lib/storage.ts)
  - getStorageInfo() returning MB usage/quota/percent (lib/storage.ts)
  - PrivateModeGuard component blocking diary in private mode
  - StorageInfo component with progressbar for settings display
  - callPersist wired into InstallPrompt (appinstalled, beforeinstallprompt, standalone)
affects: [05-polish-release, 07-installer]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - SecurityError-based private mode detection (not quota thresholds — Chrome 2024+ artificiality)
    - Storage API safe-access pattern (navigator?.storage?.persist null guard)
    - TDD: 8 storage unit tests + 3 StorageInfo + 1 InstallPrompt wiring test

key-files:
  created:
    - apps/web/lib/storage.ts
    - apps/web/components/StorageInfo.tsx
    - apps/web/components/PrivateModeGuard.tsx
    - apps/web/lib/__tests__/storage.test.ts
    - apps/web/components/__tests__/StorageInfo.test.tsx
  modified:
    - apps/web/components/InstallPrompt.tsx
    - apps/web/components/PwaShell.tsx
    - apps/web/components/__tests__/InstallPrompt.test.tsx

key-decisions:
  - "detectPrivateMode uses SecurityError on IDB open — NOT quota thresholds (Chrome 2024+ artificial quota applies in all modes)"
  - "PrivateModeGuard renders null during detection to avoid flash, then shows absolute refusal screen (no dismiss)"
  - "callPersist fires on appinstalled, beforeinstallprompt, and standalone launch — covers all install vectors"
  - "StorageInfo renders null when StorageManager API unavailable (no error state exposed to user)"

patterns-established:
  - "Storage guard pattern: null during async check → refusal or passthrough — same approach as WkWebViewGuard"
  - "lib/storage.ts is the single-source for all Storage API interactions — no direct navigator.storage calls in components"

requirements-completed: [OFFLINE-04, OFFLINE-05, OFFLINE-06]

# Metrics
duration: 3min
completed: 2026-06-07
---

# Phase 4 Plan 03: Storage Persistence, Private Mode Guard, Quota Monitor Summary

**Storage persistence via navigator.storage.persist(), SecurityError-based private mode detection, quota monitoring via StorageManager, all TDD-verified with 16 new tests passing alongside 52 existing**

## Performance

- **Duration:** ~3 min
- **Started:** 2026-06-07T20:22:30Z
- **Completed:** 2026-06-07T20:24:46Z
- **Tasks:** 2
- **Files modified:** 8

## Accomplishments
- `lib/storage.ts` exports three functions: `detectPrivateMode` (SecurityError/IDB), `callPersist` (navigator.storage.persist with fallback), `getStorageInfo` (MB usage/quota/percent, zero-quota guard)
- `PrivateModeGuard` blocks diary content on private mode detection — shows absolute refusal screen, no dismiss path, renders null during async check to avoid flash
- `StorageInfo` component displays "X MB used of Y MB (Z%)" with ARIA progressbar role, returns null when StorageManager unavailable
- `PwaShell` updated: WkWebViewGuard > PrivateModeGuard > children (correct guard layering)
- `InstallPrompt` calls `callPersist()` on three install vectors: appinstalled event, beforeinstallprompt event, standalone launch via matchMedia

## Task Commits

Each task was committed atomically:

1. **Task 1: storage.ts — detectPrivateMode, callPersist, getStorageInfo** - `df57cb4` (feat)
2. **Task 2: PrivateModeGuard and StorageInfo components; wire callPersist into install flow** - `ad28289` (feat)

**Plan metadata:** (docs commit follows)

_Note: Both tasks used TDD (RED → GREEN pattern)_

## Files Created/Modified
- `apps/web/lib/storage.ts` — Three exported storage utilities
- `apps/web/lib/__tests__/storage.test.ts` — 8 unit tests (SecurityError mock, success+cleanup, quota math, null guards)
- `apps/web/components/PrivateModeGuard.tsx` — Client component blocking private mode access
- `apps/web/components/StorageInfo.tsx` — Client component for settings-level storage visibility
- `apps/web/components/PwaShell.tsx` — Added PrivateModeGuard between WkWebViewGuard and children
- `apps/web/components/InstallPrompt.tsx` — Added callPersist() on all three install vectors
- `apps/web/components/__tests__/StorageInfo.test.tsx` — 3 tests (text render, null render, progressbar)
- `apps/web/components/__tests__/InstallPrompt.test.tsx` — Added callPersist wiring test (1 new test)

## Decisions Made
- SecurityError on IDB open is the detection mechanism — not quota thresholds. Chrome 2024+ reports artificial quota in all modes, making quota-based detection unreliable.
- PrivateModeGuard shows an absolute refusal (no close button) per OFFLINE-05 requirement: "refuse to open diary with clear message."
- callPersist fires on all three install vectors to maximize coverage across platforms (Android, iOS, desktop Chrome/Edge).

## Deviations from Plan
None - plan executed exactly as written.

## Issues Encountered
None.

## User Setup Required
None - no external service configuration required.

## Next Phase Readiness
- Phase 4 (Offline PWA) is now complete: SW caching (04-01), outbox sync queue (04-02), storage persistence + private mode guard (04-03)
- Phase 5 (Polish & Release) can proceed — all OFFLINE requirements met
- StorageInfo component is ready to import into the settings page (Phase 7)

---
*Phase: 04-offline-pwa*
*Completed: 2026-06-07*
