---
phase: 02-auth-webauthn
plan: "01"
subsystem: auth
tags: [argon2id, fastify-jwt, fastify-cookie, vitest, jwt, session, passphrase]

requires:
  - phase: 01-foundation
    provides: "Fastify server, pg pool plugin, DB schema with users/sessions/webauthn_credentials tables"
provides:
  - "Auth plugin (cookie + JWT session handling)"
  - "requireAuth middleware (preHandler with DB session validation)"
  - "POST /api/auth/register (single-user passphrase account creation)"
  - "POST /api/auth/unlock (passphrase verification + session issuance)"
  - "GET /api/auth/me (session validation)"
  - "DELETE /api/auth/session (logout)"
  - "Vitest test infrastructure"
  - "Test helpers (buildTestApp, mockPool, createMockSession)"
  - "Migration 002: prf_capable column on webauthn_credentials"
affects: [02-webauthn-registration, 02-webauthn-authentication, 03-encryption]

tech-stack:
  added: [argon2, "@fastify/cookie", "@fastify/jwt", "@simplewebauthn/server", vitest, "@vitest/coverage-v8"]
  patterns: [fastify-plugin-with-dependencies, preHandler-middleware, mock-pg-pool-testing, jwt-cookie-sessions, sha256-token-hashing]

key-files:
  created:
    - apps/api/src/plugins/auth.ts
    - apps/api/src/middleware/requireAuth.ts
    - apps/api/src/routes/auth.ts
    - apps/api/src/test-helpers/index.ts
    - apps/api/vitest.config.ts
    - apps/api/migrations/002.do.add-prf-capable.sql
    - apps/api/migrations/002.undo.add-prf-capable.sql
  modified:
    - apps/api/src/server.ts
    - apps/api/package.json
    - package-lock.json

key-decisions:
  - "Argon2id with memoryCost=65536, timeCost=3, parallelism=4 for passphrase hashing"
  - "Session tokens SHA-256 hashed before DB storage, never stored raw"
  - "httpOnly secure sameSite=strict cookie named 'session' with 7-day expiry"
  - "Mock argon2 in tests to avoid native binary overhead, validate behavior not hashing"

patterns-established:
  - "TDD with mock pg pool: buildTestApp() creates Fastify with mocked DB, tests register routes before inject"
  - "Session creation helper: shared between register and unlock to avoid duplication"
  - "preHandler middleware pattern: requireAuth decorates request.userId for downstream handlers"

requirements-completed: [AUTH-01, AUTH-04, AUTH-08]

duration: 4min
completed: 2026-06-07
---

# Phase 02 Plan 01: Passphrase Auth and Session Layer Summary

**Argon2id passphrase auth with JWT session cookies, requireAuth middleware, and vitest infrastructure for API testing**

## Performance

- **Duration:** 4 min
- **Started:** 2026-06-07T05:10:43Z
- **Completed:** 2026-06-07T05:15:02Z
- **Tasks:** 2
- **Files modified:** 12

## Accomplishments
- Passphrase-based account creation with Argon2id hashing and HKDF salt generation
- Session layer using JWT cookies with SHA-256 token hashing in DB (never raw)
- requireAuth middleware validates cookie, JWT, and DB session row with expiry check
- Vitest test infrastructure with mock pg pool helpers (13 tests passing)

## Task Commits

Each task was committed atomically:

1. **Task 1: Install deps, vitest, test helpers, auth plugin, migration** - `303da8a` (feat)
2. **Task 2 RED: Failing tests for auth endpoints** - `a7eda1b` (test)
3. **Task 2 GREEN: Implement auth register, unlock, session, logout** - `ec7c83c` (feat)

## Files Created/Modified
- `apps/api/src/plugins/auth.ts` - Fastify plugin registering @fastify/cookie and @fastify/jwt
- `apps/api/src/middleware/requireAuth.ts` - preHandler hook validating session cookie + DB row
- `apps/api/src/routes/auth.ts` - Register, unlock, me, and logout endpoints
- `apps/api/src/test-helpers/index.ts` - buildTestApp, mockPool, createMockSession helpers
- `apps/api/vitest.config.ts` - Vitest configuration for API tests
- `apps/api/src/server.ts` - Updated to register auth plugin and routes
- `apps/api/migrations/002.do.add-prf-capable.sql` - Adds prf_capable boolean to webauthn_credentials
- `apps/api/migrations/002.undo.add-prf-capable.sql` - Undo migration

## Decisions Made
- Argon2id with memoryCost=65536, timeCost=3, parallelism=4 for passphrase hashing
- Session tokens SHA-256 hashed before DB storage -- raw token never persisted
- httpOnly secure sameSite=strict cookie named "session" with 7-day expiry
- Mock argon2 in tests to avoid native binary overhead; tests validate behavior not hashing specifics

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] buildTestApp called app.ready() too early**
- **Found during:** Task 1 (requireAuth tests)
- **Issue:** Tests needed to register routes after buildTestApp, but app.ready() prevented adding routes
- **Fix:** Removed app.ready() from buildTestApp, let fastify.inject() auto-ready
- **Files modified:** apps/api/src/test-helpers/index.ts
- **Verification:** All 4 middleware tests pass
- **Committed in:** 303da8a (Task 1 commit)

---

**Total deviations:** 1 auto-fixed (1 blocking)
**Impact on plan:** Minor test helper adjustment. No scope creep.

## Issues Encountered
None beyond the auto-fixed deviation above.

## User Setup Required
None - no external service configuration required.

## Next Phase Readiness
- Auth plugin and session layer ready for WebAuthn registration (Plan 02)
- requireAuth middleware available for protecting all future endpoints
- Test infrastructure (vitest + helpers) ready for all subsequent API tests
- prf_capable column ready for WebAuthn credential registration

---
*Phase: 02-auth-webauthn*
*Completed: 2026-06-07*
