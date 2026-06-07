---
phase: 01-foundation
plan: "01"
subsystem: infra
tags: [docker, docker-compose, postgres, caddy, next.js, fastify, typescript, sql, migrations]

# Dependency graph
requires: []
provides:
  - Docker Compose orchestration of 5 services (postgres, redis, api, web, caddy)
  - Caddyfile with HTTPS via local_certs and env-var hostname
  - .env.example with prominent WEBAUTHN_RP_ID warning
  - Comprehensive PostgreSQL schema covering all 7 phases (10 tables, 8 indexes)
  - apps/api scaffold with TypeScript, Fastify, Dockerfile
  - apps/web scaffold with Next.js 15 standalone output, Dockerfile
affects: [02-api, 03-auth, 04-encryption, 05-deadline, 06-notifications, 07-installer]

# Tech tracking
tech-stack:
  added:
    - postgres:17-alpine
    - redis:7-alpine
    - caddy:2-alpine
    - next@15.5.19
    - fastify@5.x (declared, not yet installed)
    - pg@8.x (declared, not yet installed)
    - postgrator@8.x (declared, not yet installed)
    - web-push@3.x (declared, not yet installed)
    - typescript@5.x
    - tsx (declared, not yet installed)
  patterns:
    - Docker Compose multi-stage build with standalone Next.js output
    - Caddy env-var hostname {$SITE_HOSTNAME:localhost} for WebAuthn RP alignment
    - Named volumes with deadletter_ prefix and data-loss warning comments
    - Plain SQL migrations with postgrator naming convention (001.do / 001.undo)
    - All tables include user_id FK for multi-user readiness

key-files:
  created:
    - docker-compose.yml
    - Caddyfile
    - .env.example
    - .gitignore
    - package.json
    - apps/api/package.json
    - apps/api/tsconfig.json
    - apps/api/Dockerfile
    - apps/api/src/server.ts
    - apps/api/migrations/001.do.create-schema.sql
    - apps/api/migrations/001.undo.create-schema.sql
    - apps/web/Dockerfile
    - apps/web/next.config.ts
    - apps/web/app/layout.tsx
    - apps/web/app/page.tsx
  modified:
    - apps/web/package.json (name set to @dead-letter-diary/web)
    - apps/web/next.config.ts (output: standalone added)

key-decisions:
  - "Caddy uses local_certs for HTTPS — no mkcert required at this stage; browser cert trust handled per-platform"
  - "WEBAUTHN_RP_ID warning is the most prominent comment in .env.example per locked user decision"
  - "All 10 tables scaffolded in Phase 1 migration (locked decision) — no table creation in later phases"
  - "apps/web bootstrapped via create-next-app@15 then key files overwritten for consistency"
  - "Volume naming: deadletter_ prefix with explicit WARNING comments about docker compose down -v"

patterns-established:
  - "Pattern: Docker named volumes named deadletter_{service} with WARNING comments about -v flag"
  - "Pattern: env_file: .env on all services that need secrets; .env.example is the template"
  - "Pattern: migrations use postgrator naming (001.do.create-schema.sql / 001.undo.create-schema.sql)"
  - "Pattern: user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE on every table"

requirements-completed: [INST-01, INST-02, INST-06, INST-09]

# Metrics
duration: 3min
completed: "2026-06-07"
---

# Phase 1 Plan 01: Foundation Scaffold Summary

**Five-service Docker Compose with Caddy HTTPS, Next.js 15 standalone, Fastify API scaffold, and comprehensive 10-table PostgreSQL schema covering all 7 phases**

## Performance

- **Duration:** ~3 minutes
- **Started:** 2026-06-07T01:49:00Z
- **Completed:** 2026-06-07T01:52:30Z
- **Tasks:** 2
- **Files modified:** 25 created, 2 modified

## Accomplishments
- Monorepo structure with apps/api (Fastify) and apps/web (Next.js 15) under npm workspaces
- docker-compose.yml with all 5 services, restart: always, healthchecks on postgres/redis, named volumes with data-loss warnings
- Caddyfile using {$SITE_HOSTNAME:localhost} for WebAuthn RP alignment, local_certs for HTTPS
- .env.example with WEBAUTHN_RP_ID warning as the most prominent comment (locked user requirement)
- 10-table PostgreSQL schema in a single migration, wrapping all 7 phases, every table with user_id FK

## Task Commits

Each task was committed atomically:

1. **Task 1: Monorepo structure, Docker Compose, Caddyfile, and env files** - `34c996f` (feat)
2. **Task 2: Comprehensive database schema migration** - `bdbbb86` (feat)

**Plan metadata:** (docs commit — see below)

## Files Created/Modified
- `docker-compose.yml` - Five-service compose with postgres, redis, api, web, caddy
- `Caddyfile` - HTTPS reverse proxy with {$SITE_HOSTNAME:localhost} and local_certs
- `.env.example` - Template env with prominent WEBAUTHN_RP_ID warning block
- `.gitignore` - Excludes .env but not .env.example
- `package.json` - Root npm workspace config
- `apps/api/package.json` - Fastify API dependencies (fastify, pg, postgrator, web-push, dotenv)
- `apps/api/tsconfig.json` - ES2022, NodeNext module, strict
- `apps/api/Dockerfile` - Multi-stage node:22-alpine build
- `apps/api/src/server.ts` - Placeholder (replaced in Plan 02)
- `apps/api/migrations/001.do.create-schema.sql` - 10 tables, 8 indexes, BEGIN/COMMIT
- `apps/api/migrations/001.undo.create-schema.sql` - Drops all tables in reverse order
- `apps/web/Dockerfile` - Multi-stage Next.js standalone build
- `apps/web/package.json` - Name updated to @dead-letter-diary/web
- `apps/web/next.config.ts` - output: standalone added
- `apps/web/app/layout.tsx` - Minimal root layout (placeholder)
- `apps/web/app/page.tsx` - Minimal "Dead Letter Diary" page (placeholder)

## Decisions Made
- **Caddy local_certs** chosen over mkcert — works automatically for localhost. Custom hostname support documented in RESEARCH.md for Phase 7 installer.
- **create-next-app@15** used to scaffold apps/web, then key files overwritten (package.json name, next.config.ts output, Dockerfile, layout, page). Preserves all generated tooling.
- **All 10 tables in one migration** — locked user decision. Later phases add columns/indexes, never create new tables.
- **SITE_HOSTNAME** env var name chosen (not $HOSTNAME) to avoid Docker container ID collision (Pitfall 5 from RESEARCH.md).

## Deviations from Plan

None — plan executed exactly as written.

## Issues Encountered
- `docker compose config` with `env_file: .env` requires .env to exist for validation. Used temporary copy of .env.example for verification, removed after. Not a real issue — expected behavior.

## User Setup Required
None — no external service configuration required at this stage. Users will copy `.env.example` to `.env` before first run.

## Next Phase Readiness
- All infrastructure files in place for Plan 02 (Fastify API wiring, health endpoint, migration runner)
- Placeholder `apps/api/src/server.ts` and `apps/web/app/page.tsx` ready to be replaced
- Named volumes configured — users must be warned never to use `docker compose down -v`
- Blocker: `.env` must be created from `.env.example` before `docker compose up` (user action)

---
*Phase: 01-foundation*
*Completed: 2026-06-07*
