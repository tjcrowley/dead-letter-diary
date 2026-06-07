---
phase: 05-dead-mans-switch
plan: "04"
subsystem: api
tags: [postgres, push-notifications, sql, migration, vitest]

# Dependency graph
requires:
  - phase: 05-dead-mans-switch
    provides: notification_thresholds table and notifications table with push subscription upsert route
provides:
  - Correct notification_thresholds INSERT using (user_id, threshold_minutes, tone)
  - Unique index idx_notifications_user_endpoint backing ON CONFLICT upsert for push subscriptions
affects: [05-dead-mans-switch, push-sender, notification-poller]

# Tech tracking
tech-stack:
  added: []
  patterns: []

key-files:
  created: []
  modified:
    - apps/api/src/routes/deadline.ts
    - apps/api/migrations/001.do.create-schema.sql
    - apps/api/src/routes/__tests__/deadline.test.ts
    - apps/api/src/routes/__tests__/notifications.test.ts

key-decisions:
  - "notification_thresholds columns are threshold_minutes (INT) and tone (TEXT) — not hours_before/label/urgency"
  - "ON CONFLICT DO NOTHING on notification_thresholds INSERT is defensive only — no unique constraint exists on threshold_minutes, conflicts never occur in practice"
  - "idx_notifications_user_endpoint kept alongside idx_notifications_user — both serve different query patterns"

patterns-established: []

requirements-completed:
  - NOTIF-01
  - NOTIF-02
  - NOTIF-03
  - NOTIF-04
  - NOTIF-05
  - NOTIF-06
  - NOTIF-07
  - DMS-01
  - DMS-02
  - DMS-03
  - DMS-04
  - DMS-05
  - DMS-06
  - DMS-07
  - DMS-08
  - DMS-09
  - DMS-10

# Metrics
duration: 2min
completed: 2026-06-07
---

# Phase 5 Plan 04: Gap Closure — Column Names and Unique Index Summary

**Two surgical fixes: corrected notification_thresholds INSERT from wrong columns (hours_before/label/urgency) to schema-correct (threshold_minutes/tone), and added idx_notifications_user_endpoint UNIQUE INDEX to back the push subscription upsert ON CONFLICT clause**

## Performance

- **Duration:** 2 min
- **Started:** 2026-06-07T21:42:54Z
- **Completed:** 2026-06-07T21:44:01Z
- **Tasks:** 2
- **Files modified:** 4

## Accomplishments

- Fixed Gap 1: notification_thresholds INSERT now uses correct column names (threshold_minutes, tone) with minutes as integers (1440/240/60/15)
- Fixed Gap 2: migration now creates idx_notifications_user_endpoint UNIQUE INDEX so the ON CONFLICT clause in notifications.ts works at runtime
- Added test assertions verifying both fixes are structurally correct in SQL

## Task Commits

1. **Task 1: Fix notification_thresholds INSERT column names** - `20b9f2a` (fix)
2. **Task 2: Add unique index for push subscription upsert** - `28e08ec` (fix)

## Files Created/Modified

- `apps/api/src/routes/deadline.ts` - Corrected thresholds array and INSERT SQL to use threshold_minutes/tone
- `apps/api/migrations/001.do.create-schema.sql` - Added CREATE UNIQUE INDEX idx_notifications_user_endpoint
- `apps/api/src/routes/__tests__/deadline.test.ts` - Added assertion that threshold INSERT SQL uses threshold_minutes/tone, not hours_before/label/urgency
- `apps/api/src/routes/__tests__/notifications.test.ts` - Added assertion that upsert SQL references subscription->>'endpoint' expression

## Decisions Made

None — followed plan as specified. The plan provided exact SQL and code to use.

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered

None. Both fixes were clean one-line / one-block changes. Full test suite: 12 files, 80 tests — all green.

## User Setup Required

None - no external service configuration required. The migration file change will apply automatically on next `npm run migrate` or fresh DB setup.

## Next Phase Readiness

- Push notification system is now fully unblocked: subscriptions insertable via upsert, thresholds seeded correctly on first settings write
- NOTIF-01 (subscribe endpoint) and NOTIF-02 (threshold seeding) are unblocked
- Phase 5 verification can now confirm end-to-end push flow works at the SQL level

---
*Phase: 05-dead-mans-switch*
*Completed: 2026-06-07*
