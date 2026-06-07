---
phase: 03-encryption-writing
plan: 03
subsystem: api
tags: [aes-256-gcm, shard-encryption, key-wrap, fastify, vitest, node-crypto]

# Dependency graph
requires:
  - phase: 02-auth-webauthn
    provides: "requireAuth middleware, session management, test-helpers (buildTestApp, mockPool, createMockSession)"
  - phase: 03-encryption-writing
    provides: "Client-side crypto module (DMK lifecycle, AAD format), word count utility"
provides:
  - "Server-side shard storage with AES-256-GCM at-rest encryption"
  - "Key-wrap CRUD endpoints for wrapped DMK per auth method"
  - "Encrypted entry submission with AAD word count verification"
affects: [04-deadline-engine, 05-polish-release]

# Tech tracking
tech-stack:
  added: []
  patterns: [Node crypto AES-256-GCM for at-rest shard encryption, AAD word count server-side verification]

key-files:
  created:
    - apps/api/src/routes/crypto.ts
    - apps/api/src/routes/entries.ts
    - apps/api/src/routes/__tests__/crypto.test.ts
    - apps/api/src/routes/__tests__/entries.test.ts
  modified:
    - apps/api/src/server.ts

key-decisions:
  - "Shard at-rest format: iv(12) + authTag(16) + ciphertext -- concatenated into single BYTEA column"
  - "AAD userId verified server-side to prevent spoofing (403 on mismatch)"
  - "Default word_minimum 50 when no deadline_state row exists"
  - "Key wraps stored with credential_id null for passphrase type"

patterns-established:
  - "Crypto route pattern: Fastify plugin with preHandler requireAuth on all endpoints"
  - "At-rest encryption: encryptShard/decryptShard helpers using SHARD_ENCRYPTION_KEY from env"
  - "AAD parsing: base64url -> JSON -> validate userId match -> extract wordCount"

requirements-completed: [CRYPT-04, CRYPT-10, WRITE-05]

# Metrics
duration: 3min
completed: 2026-06-07
---

# Phase 3 Plan 3: Server Crypto & Entries Summary

**AES-256-GCM at-rest shard encryption, key-wrap CRUD, and encrypted entry submission with AAD-bound word count verification**

## Performance

- **Duration:** 3 min
- **Started:** 2026-06-07T05:54:52Z
- **Completed:** 2026-06-07T05:58:15Z
- **Tasks:** 2
- **Files modified:** 5

## Accomplishments
- Server shard endpoints with AES-256-GCM at-rest encryption using SHARD_ENCRYPTION_KEY
- Key-wrap CRUD supporting multiple wraps per user (webauthn_prf and passphrase types)
- Encrypted entry submission with AAD word count verification against user's deadline_state minimum
- AAD userId mismatch detection prevents cross-user spoofing
- 11 new tests passing (6 crypto + 5 entries), 31 total API tests green

## Task Commits

Each task was committed atomically:

1. **Task 1: Crypto routes (RED)** - `33ea8a7` (test)
2. **Task 1: Crypto routes (GREEN)** - `3b1bb72` (feat)
3. **Task 2: Entries endpoint (RED)** - `19da927` (test)
4. **Task 2: Entries endpoint (GREEN)** - `9722fe2` (feat)

_TDD tasks committed separately for RED and GREEN phases_

## Files Created/Modified
- `apps/api/src/routes/crypto.ts` - Shard GET/POST with at-rest encryption, key-wrap GET/POST
- `apps/api/src/routes/entries.ts` - Encrypted entry submission with AAD word count verification
- `apps/api/src/routes/__tests__/crypto.test.ts` - 6 tests: auth enforcement, shard CRUD, key-wrap CRUD
- `apps/api/src/routes/__tests__/entries.test.ts` - 5 tests: auth, word count validation, DB storage, userId mismatch
- `apps/api/src/server.ts` - Registered cryptoRoutes and entriesRoutes plugins

## Decisions Made
- Shard at-rest encryption format: iv(12 bytes) + authTag(16 bytes) + ciphertext in single BYTEA column
- AAD userId verified server-side with 403 response on mismatch (prevents spoofing even though AES-GCM would fail on decrypt)
- Default word_minimum set to 50 when user has no deadline_state row yet
- Key wraps use credential_id = null for passphrase type wraps

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered
None

## User Setup Required
None - no external service configuration required.

## Next Phase Readiness
- All server-side crypto endpoints ready for client integration
- Entry submission endpoint ready for write surface to call
- Phase 5 TODO noted in crypto.ts for good-standing gate on shard retrieval

---
*Phase: 03-encryption-writing*
*Completed: 2026-06-07*
