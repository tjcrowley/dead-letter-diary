# Phase 1: Foundation - Context

**Gathered:** 2026-06-06
**Status:** Ready for planning

<domain>
## Phase Boundary

Set up the local dev environment that all future phases build on: Docker Compose (PostgreSQL, Redis, Fastify, Next.js, Caddy), local HTTPS via Caddy + mkcert, comprehensive database schema for the full app, Fastify API skeleton, Next.js app shell, and secret auto-generation. Nothing user-facing ships in this phase — this is the foundation.

</domain>

<decisions>
## Implementation Decisions

### Local hostname & WebAuthn RP ID
- RP ID must be user-settable via `.env` before first run (e.g., `WEBAUTHN_RP_ID=diary.local` or `WEBAUTHN_RP_ID=localhost`)
- Once WebAuthn enrollment happens (Phase 2), changing RP ID breaks all passkeys — no migration path
- Phase 1 must make this a prominent, documented `.env` variable with a clear warning in `.env.example`
- Caddy config must read the hostname from this env var so it serves the right domain
- Default should work out of the box (`localhost`) but the var must be visible and easy to set before setup

### Database migrations tool
- Raw SQL files with a lightweight SQL runner (not an ORM)
- Research/planning to select the specific runner (node-pg-migrate, Flyway, or similar)
- Migration files live in a `migrations/` directory under the API app
- No ORM — queries are written by hand

### Schema scope in Phase 1
- Comprehensive: scaffold ALL tables for all 7 phases in Phase 1
- This means users, sessions, key_wraps, entries, shards, deadline_state, wipe_log, notifications, etc.
- All tables must have `user_id` on them (multi-user-ready) even though the app is single-user in v1
- Later phases add columns/indexes as needed, but no table creation in later phases if avoidable

### Repo structure
- Monorepo: `apps/web` (Next.js 15 PWA) + `apps/api` (Fastify)
- Shared types/utilities can live in `packages/` if needed
- Docker Compose references the two apps by their `apps/` paths

### Claude's Discretion
- Specific raw SQL runner library selection (research which fits best with Node/TypeScript)
- Docker Compose service naming conventions
- Internal port assignments (Fastify, Next.js, Postgres, Redis)
- Exact `.env.example` structure beyond the RP ID variable
- Health check endpoint implementation details

</decisions>

<specifics>
## Specific Ideas

- The RP ID env var warning in `.env.example` should be the most prominent comment in the file — something like `# IMPORTANT: Set this before first run. Cannot be changed after WebAuthn enrollment.`
- All secrets (VAPID keys, session secret, shard encryption key) auto-generate on first boot — no manual secret generation step

</specifics>

<code_context>
## Existing Code Insights

### Reusable Assets
- None — greenfield project, no existing code

### Established Patterns
- None yet — Phase 1 establishes the patterns all later phases follow

### Integration Points
- Caddy → Next.js (reverse proxy for frontend)
- Caddy → Fastify (reverse proxy for `/api/*`)
- Fastify → PostgreSQL (via raw SQL runner + pg client)
- Fastify → Redis (session/queue, exact usage defined in later phases)

</code_context>

<deferred>
## Deferred Ideas

None — discussion stayed within phase scope.

</deferred>

---

*Phase: 01-foundation*
*Context gathered: 2026-06-06*
