---
phase: 06-wipe-and-ceremony
plan: "03"
subsystem: api
tags: [postgres, schema, migration, backup, epitaph, shell]

# Dependency graph
requires:
  - phase: 06-01
    provides: wipe routes plugin with POST /api/wipe/panic
  - phase: 01-foundation
    provides: users table with epitaph column, server_shards table in public schema

provides:
  - GET /api/account/epitaph — returns epitaph or null for authenticated user
  - POST /api/account/epitaph — immutable epitaph write with 409 on second write
  - Migration 002: shards schema containing server_shards (isolated from backups)
  - scripts/backup.sh with --exclude-schema=shards and set -euo pipefail

affects:
  - 06-02 (ceremony screen reads epitaph via GET /api/account/epitaph)
  - 07-installer (backup.sh is the operational backup script)

# Tech tracking
tech-stack:
  added: []
  patterns:
    - rowCount === 0 guard for immutable fields (epitaph POST returns 409 if no row updated)
    - PostgreSQL schema isolation for sensitive key material (shards schema)
    - Two-schema pg_dump pattern: --exclude-schema=shards keeps backups safe

key-files:
  created:
    - apps/api/migrations/002.do.shard-schema.sql
    - scripts/backup.sh
  modified:
    - apps/api/src/routes/wipe.ts
    - apps/api/src/routes/__tests__/wipe.test.ts
    - apps/api/src/lib/deadline-engine.ts
    - apps/api/src/routes/crypto.ts

key-decisions:
  - "rowCount === 0 on UPDATE users SET epitaph WHERE epitaph IS NULL is the 409 guard — SQL atomically enforces immutability"
  - "Migration 002 moves server_shards to shards schema so --exclude-schema=shards in pg_dump cleanly omits it"
  - "backup.sh uses set -euo pipefail so any missing env var or pg_dump failure exits loudly"

patterns-established:
  - "Immutable field pattern: UPDATE ... WHERE field IS NULL; rowCount === 0 → 409"
  - "Sensitive schema isolation: shards schema excluded from all pg_dump backups by flag"

requirements-completed: [WIPE-04, INST-07, INST-08]

# Metrics
duration: 2min
completed: 2026-06-07
---

# Phase 06 Plan 03: Wipe and Ceremony — Shard Schema + Epitaph API Summary

**Epitaph API (GET/POST with immutability enforcement), server_shards moved to shards PostgreSQL schema via migration 002, and backup.sh that explicitly excludes the shards schema**

## Performance

- **Duration:** 2 min
- **Started:** 2026-06-07T22:45:27Z
- **Completed:** 2026-06-07T22:47:42Z
- **Tasks:** 2
- **Files modified:** 6

## Accomplishments

- Epitaph routes (GET + POST) added to wipe plugin with full test coverage (14 total wipe tests pass)
- `server_shards` table moved to `shards` PostgreSQL schema via idempotent migration 002
- All 4 SQL query sites updated: `deadline-engine.ts`, `crypto.ts` (2 queries), `wipe.ts` panic route
- `scripts/backup.sh` created with `--exclude-schema=shards` and `set -euo pipefail`, ensuring shards never appear in backups
- Full API test suite: 97 tests pass

## Task Commits

1. **Task 1: Epitaph API routes (WIPE-04)** - `5d56679` (feat)
2. **Task 2: Shard schema migration + query updates + backup.sh (INST-07, INST-08)** - `78f1128` (feat)

## Files Created/Modified

- `apps/api/migrations/002.do.shard-schema.sql` — `CREATE SCHEMA shards; ALTER TABLE public.server_shards SET SCHEMA shards;`
- `apps/api/src/routes/wipe.ts` — Added GET/POST /api/account/epitaph; updated panic DELETE to `shards.server_shards`
- `apps/api/src/routes/__tests__/wipe.test.ts` — 7 new epitaph test cases (GET null, GET set, POST sets, POST 409, POST 400)
- `apps/api/src/lib/deadline-engine.ts` — `confirmWipe` DELETE updated to `shards.server_shards`
- `apps/api/src/routes/crypto.ts` — All 3 `server_shards` queries updated to `shards.server_shards`
- `scripts/backup.sh` — pg_dump with `--exclude-schema=shards`, `set -euo pipefail`, env var defaults

## Decisions Made

- `rowCount === 0` on `UPDATE users SET epitaph = $2 WHERE id = $1 AND epitaph IS NULL` is the atomic immutability guard — SQL enforces the single-write constraint, no separate SELECT needed
- Migration 002 uses `ALTER TABLE public.server_shards SET SCHEMA shards` — PostgreSQL cross-schema foreign keys work without any constraint changes
- `backup.sh` uses `PGPASSWORD` env var pattern with `--no-password` flag — avoids interactive prompts while remaining env-configurable

## Deviations from Plan

None — plan executed exactly as written.

## Issues Encountered

None — all test mock responses wired correctly, shard schema rename required no test changes beyond one comment update.

## User Setup Required

None — no external service configuration required. Migration 002 runs automatically via the migration runner at startup.

## Next Phase Readiness

- GET /api/account/epitaph is ready for the ceremony screen (06-02) to consume
- shards schema isolation complete — pg_dump exclusion is operational
- All 97 API tests green — no regressions

---
*Phase: 06-wipe-and-ceremony*
*Completed: 2026-06-07*
