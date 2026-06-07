---
phase: 07-installer-and-polish
plan: "02"
subsystem: setup-and-settings
tags: [setup, settings, streak, diary-name, notifications, ui]
dependency_graph:
  requires: [07-01]
  provides: [extended-setup-flow, settings-page, streak-endpoint, diary-name-migration]
  affects: [apps/web, apps/api]
tech_stack:
  added: []
  patterns:
    - 5-step first-run setup wizard with inline-style dark theme
    - Per-section independent save in settings page
    - Streak computed server-side via consecutive calendar-day GROUP BY
    - Transaction-wrapped threshold replacement (DELETE + bulk INSERT)
key_files:
  created:
    - apps/api/migrations/003.do.add-diary-name.sql
    - apps/api/src/routes/settings.ts
    - apps/web/app/settings/page.tsx
    - apps/web/components/StreakCounter.tsx
  modified:
    - apps/api/src/routes/entries.ts
    - apps/api/src/server.ts
    - apps/web/app/setup/page.tsx
    - apps/web/app/layout.tsx
    - apps/web/lib/api.ts
key_decisions:
  - "Streak computation uses epoch-day arithmetic (ms / 86400000) rather than timezone-aware library to keep it simple and avoid luxon dependency in a DB query context"
  - "Settings page saves each section independently (not one global save) per plan spec — clearer UX for users who only want to change one thing"
  - "api.patch() added to web lib as Rule 3 auto-fix — was missing but required by both setup and settings pages"
requirements_completed: [SETUP-01, SETUP-02, SETUP-03, SETUP-04, SETUP-05]
metrics:
  duration: "~25 min"
  completed: "2026-06-07"
  tasks: 2
  files_changed: 9
---

# Phase 7 Plan 02: Setup Ritual Completion and Settings UI Summary

Extended first-run setup to 5 steps (passphrase → passkey → diary name → commitment → irreversibility acknowledgment), added GET/PATCH settings API with notification threshold management, added streak counter fetching consecutive calendar-day entry runs, and wired DeadlineBanner + nav into the global layout.

## Duration

~25 minutes. Start: 2026-06-07T22:55:00Z. End: 2026-06-07T23:20:27Z.

## Tasks Completed

| # | Name | Commit | Key Files |
|---|------|--------|-----------|
| 1 | Settings API route, diary name migration, streak endpoint | 76974e2 | 003.do.add-diary-name.sql, routes/settings.ts, routes/entries.ts (streak), server.ts |
| 2 | Extended setup page and settings UI | 5990bb2 | setup/page.tsx (5 steps), settings/page.tsx, StreakCounter.tsx, layout.tsx, lib/api.ts |

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] Added missing `api.patch()` method to web API lib**
- **Found during:** Task 2 — both setup/page.tsx (diary name step) and settings/page.tsx call `api.patch()` but the method did not exist
- **Issue:** `api` object in `apps/web/lib/api.ts` had `get`, `post`, `delete` but no `patch`
- **Fix:** Added `patch<T>()` method following the same pattern as `post()`
- **Files modified:** `apps/web/lib/api.ts`
- **Commit:** 5990bb2

**Total deviations:** 1 auto-fixed (1 blocking). **Impact:** Minimal — additive only, no behavior changed.

## Success Criteria Review

- [x] First-run setup walks through all 5 steps — passphrase, passkey, diary name, commitment, acknowledgment
- [x] Cannot proceed past step 5 without checking the acknowledgment box (button disabled until checked)
- [x] Settings page loads with 4 sections, each saves independently
- [x] Streak counter appears via StreakCounter component in layout nav (0 for new user)
- [x] DeadlineBanner visible on all pages via layout.tsx
- [x] Zero TypeScript errors in API (`npx tsc --noEmit -p apps/api/tsconfig.json` — 0 errors)
- [x] Zero TypeScript errors in web files added by this plan (pre-existing errors in sw.ts, push.ts, next.config.ts are out of scope)

## Self-Check: PASSED

Files verified:
- apps/api/migrations/003.do.add-diary-name.sql — FOUND
- apps/api/src/routes/settings.ts — FOUND
- apps/web/app/settings/page.tsx — FOUND
- apps/web/components/StreakCounter.tsx — FOUND
- Commits 76974e2, 5990bb2 — verified in git log
