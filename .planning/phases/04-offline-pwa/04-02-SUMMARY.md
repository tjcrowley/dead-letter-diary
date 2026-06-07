---
phase: 04-offline-pwa
plan: "02"
subsystem: offline
tags: [dexie, indexeddb, pwa, sync, outbox, react, vitest, dexie-react-hooks]

# Dependency graph
requires:
  - phase: 04-01
    provides: Serwist service worker, PWA manifest, offline page foundation
  - phase: 03-encryption-writing
    provides: DraftEntry interface, saveDraft, db.ts version 1

provides:
  - Dexie DB version 2 with outbox table (id, queuedAt indexes)
  - OutboxEntry interface exported from db.ts
  - sync.ts with queueForSync, flushOutbox, getSyncStatus, registerSyncListener
  - SyncStatus React component with live useLiveQuery reactive updates
  - write/page.tsx wired with outbox queue and online flush listener

affects: [05-deadline-enforcement, 06-shard-security]

# Tech tracking
tech-stack:
  added: [dexie-react-hooks@4.4.0]
  patterns:
    - Outbox pattern for offline-first entry sync
    - Dexie version migration (v1 → v2) with both versions declared
    - useLiveQuery for reactive IndexedDB state in React components
    - Online event listener + Background Sync API (Chromium) for flush-on-reconnect
    - OutboxEntry defined in db.ts (source of truth) to avoid circular imports

key-files:
  created:
    - apps/web/lib/sync.ts
    - apps/web/components/SyncStatus.tsx
    - apps/web/lib/__tests__/sync.test.ts
    - apps/web/components/__tests__/SyncStatus.test.tsx
  modified:
    - apps/web/lib/db.ts
    - apps/web/app/write/page.tsx
    - apps/web/vitest.config.ts

key-decisions:
  - "OutboxEntry defined in db.ts (not sync.ts) to avoid circular import between sync.ts and db.ts"
  - "vitest.config.ts extended with @/ path alias to match Next.js tsconfig paths"
  - "flushOutbox continues processing remaining entries even when one fails (non-throwing loop)"
  - "Immediate server submit attempted after queueForSync; failures stay in outbox for online retry"

patterns-established:
  - "Outbox pattern: queue → immediate attempt → leave on failure → retry on online event"
  - "TDD with fake-indexeddb: import fake-indexeddb/auto at test top, clear tables in beforeEach"
  - "SyncStatus component: offline label uses singular/plural based on pendingCount"

requirements-completed:
  - OFFLINE-01
  - OFFLINE-02
  - OFFLINE-03

# Metrics
duration: 12min
completed: 2026-06-07
---

# Phase 4 Plan 02: Offline PWA Sync Queue Summary

**Dexie outbox pattern with flush-on-online: entries queue locally when offline, sync to server on reconnect via online event listener and Chromium Background Sync API**

## Performance

- **Duration:** ~12 min
- **Started:** 2026-06-07T13:17:00Z
- **Completed:** 2026-06-07T13:20:30Z
- **Tasks:** 2 (both TDD)
- **Files modified:** 7

## Accomplishments

- Extended Dexie DB to version 2 with outbox table, preserving version 1 for migration compatibility
- Implemented full sync.ts outbox pattern: queue, flush (ordered by queuedAt, per-entry error handling), status, listener
- SyncStatus React component uses useLiveQuery for reactive outbox count; renders Synced / Saving... / Offline labels
- Wired write/page.tsx to call queueForSync after local save and register online flush listener on mount
- All 56 tests pass (9 test files) including 8 new sync tests and 4 new SyncStatus tests

## Task Commits

Each task was committed atomically:

1. **Task 1 RED: sync.ts failing tests** - `a307fd8` (test)
2. **Task 1 GREEN: db.ts v2 + sync.ts implementation** - `797145c` (feat)
3. **Task 2 RED: SyncStatus.test.tsx failing tests** - `0077580` (test)
4. **Task 2 GREEN: SyncStatus component + write page integration** - `98b9b5e` (feat)

_TDD tasks have separate RED and GREEN commits per plan spec._

## Files Created/Modified

- `apps/web/lib/db.ts` - Bumped to version 2, added OutboxEntry interface and outbox table
- `apps/web/lib/sync.ts` - New: queueForSync, flushOutbox, getSyncStatus, registerSyncListener
- `apps/web/components/SyncStatus.tsx` - New: reactive sync state label with useLiveQuery
- `apps/web/app/write/page.tsx` - Added queueForSync, registerSyncListener, SyncStatus integration
- `apps/web/vitest.config.ts` - Added @/ path alias to match Next.js tsconfig paths
- `apps/web/lib/__tests__/sync.test.ts` - New: 8 behavior tests for sync module
- `apps/web/components/__tests__/SyncStatus.test.tsx` - New: 4 label tests for SyncStatus component

## Decisions Made

- **OutboxEntry in db.ts, not sync.ts:** The plan suggested defining OutboxEntry in sync.ts and importing it into db.ts, but that creates a circular import since sync.ts imports from db.ts. Defined OutboxEntry in db.ts (alongside the Dexie table) and re-exported from sync.ts for clean consumer imports.
- **@/ alias in vitest:** The existing vitest.config.ts lacked the `resolve.alias` for `@/`, which caused import failures in component tests. Added `path.resolve(__dirname, ".")` alias (Rule 3 — blocking fix).
- **flushOutbox non-throwing per-entry:** Each entry is wrapped in its own try/catch; failures increment `attempts` and processing continues to remaining entries.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Circular import: OutboxEntry defined in db.ts instead of sync.ts**
- **Found during:** Task 1 (implementing sync.ts)
- **Issue:** Plan said to define OutboxEntry in sync.ts and import into db.ts, but sync.ts imports db.ts — circular dependency
- **Fix:** Defined OutboxEntry in db.ts (source of truth for schema types), added `export type { OutboxEntry }` re-export in sync.ts
- **Files modified:** apps/web/lib/db.ts, apps/web/lib/sync.ts
- **Verification:** All 8 sync tests pass
- **Committed in:** 797145c (Task 1 feat commit)

**2. [Rule 3 - Blocking] Added @/ path alias to vitest.config.ts**
- **Found during:** Task 2 (running SyncStatus component tests)
- **Issue:** vitest could not resolve @/lib/db import in SyncStatus.tsx — alias missing from vitest config
- **Fix:** Added `resolve.alias: { "@": path.resolve(__dirname, ".") }` to vitest.config.ts
- **Files modified:** apps/web/vitest.config.ts
- **Verification:** All 4 SyncStatus tests pass
- **Committed in:** 98b9b5e (Task 2 feat commit)

---

**Total deviations:** 2 auto-fixed (1 circular-import fix, 1 blocking alias config)
**Impact on plan:** Both fixes necessary for correctness and test execution. No scope creep.

## Issues Encountered

None beyond the auto-fixed deviations above.

## User Setup Required

None — no external service configuration required. The outbox flush sends to the existing `/api/entries` endpoint established in Phase 3.

## Next Phase Readiness

- Outbox sync infrastructure complete and tested; ready for Phase 5 deadline enforcement
- SyncStatus component available for reuse in other surfaces
- Online/offline detection pattern established for the app

---
*Phase: 04-offline-pwa*
*Completed: 2026-06-07*
