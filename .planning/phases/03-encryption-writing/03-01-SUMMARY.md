---
phase: 03-encryption-writing
plan: 01
subsystem: crypto
tags: [web-crypto, aes-gcm, hkdf, pbkdf2, intl-segmenter, vitest]

# Dependency graph
requires:
  - phase: 02-auth-webauthn
    provides: "WebAuthn PRF output (device shard), HKDF salt, key_wraps/server_shards tables"
provides:
  - "Client-side crypto module: DMK generation, wrap/unwrap, entry encrypt/decrypt"
  - "PBKDF2 passphrase shard derivation (600k iterations)"
  - "XOR shard combiner and base64url transport helpers"
  - "Intl.Segmenter word count utility"
  - "Vitest web config with happy-dom environment"
affects: [03-02, 03-03, 04-deadline-engine, 05-polish-release]

# Tech tracking
tech-stack:
  added: [vitest, happy-dom]
  patterns: [Web Crypto API only (no third-party crypto), HKDF key derivation, AAD-bound entry encryption]

key-files:
  created:
    - apps/web/lib/crypto.ts
    - apps/web/lib/word-count.ts
    - apps/web/vitest.config.ts
    - apps/web/lib/__tests__/crypto.test.ts
    - apps/web/lib/__tests__/word-count.test.ts
  modified:
    - apps/web/package.json

key-decisions:
  - "HKDF info string: 'dead-letter-diary-dmk-wrap' — domain separation for wrapping key derivation"
  - "AAD format: JSON.stringify({entryId, userId, wordCount}) — deterministic key order binds ciphertext to metadata"
  - "PBKDF2 600,000 iterations per OWASP 2024 recommendation"
  - "Intl.Segmenter with 'en' locale — UAX #29 boundaries apply universally across scripts"

patterns-established:
  - "Web Crypto only: all crypto ops use crypto.subtle, zero third-party deps"
  - "DMK extractable on generation (for wrapKey), non-extractable after unwrap (session use)"
  - "Fresh 12-byte IV per encryption operation"
  - "TDD workflow: RED (failing tests) -> GREEN (implementation) -> commit separately"

requirements-completed: [CRYPT-01, CRYPT-02, CRYPT-03, CRYPT-05, CRYPT-06, CRYPT-07, CRYPT-08, CRYPT-09]

# Metrics
duration: 3min
completed: 2026-06-07
---

# Phase 3 Plan 1: Crypto Foundation Summary

**AES-GCM 256-bit DMK lifecycle with HKDF shard wrapping, AAD-bound entry encryption, and Intl.Segmenter word counting -- all via Web Crypto API**

## Performance

- **Duration:** 3 min
- **Started:** 2026-06-07T05:49:22Z
- **Completed:** 2026-06-07T05:52:32Z
- **Tasks:** 2
- **Files modified:** 6

## Accomplishments
- Complete DMK lifecycle: generate (extractable) -> wrap with HKDF-derived key from XOR'd shards -> unwrap as non-extractable
- Entry encrypt/decrypt with AAD binding (entryId, userId, wordCount) and fresh IV per operation
- PBKDF2-SHA256 passphrase shard derivation with 600k iterations
- Intl.Segmenter word counting with universal Unicode script support
- 17 tests passing across both modules

## Task Commits

Each task was committed atomically:

1. **Task 1: Crypto module (RED)** - `18da9c6` (test)
2. **Task 1: Crypto module (GREEN)** - `02270c8` (feat)
3. **Task 2: Word count (RED)** - `a827385` (test)
4. **Task 2: Word count (GREEN)** - `3124ae8` (feat)

_TDD tasks committed separately for RED and GREEN phases_

## Files Created/Modified
- `apps/web/lib/crypto.ts` - All Web Crypto operations: DMK gen, wrap/unwrap, entry encrypt/decrypt, PBKDF2, XOR, base64url
- `apps/web/lib/word-count.ts` - Intl.Segmenter word counting with isWordLike filter
- `apps/web/vitest.config.ts` - Vitest config with happy-dom environment
- `apps/web/lib/__tests__/crypto.test.ts` - 11 crypto tests (DMK, wrap/unwrap, encrypt/decrypt, PBKDF2, XOR)
- `apps/web/lib/__tests__/word-count.test.ts` - 6 word count tests (empty, whitespace, English, CJK, mixed)
- `apps/web/package.json` - Added vitest, happy-dom devDependencies

## Decisions Made
- HKDF info string set to "dead-letter-diary-dmk-wrap" for domain separation
- AAD uses JSON.stringify with fixed key order ({entryId, userId, wordCount}) for deterministic binding
- PBKDF2 iterations set to 600,000 per OWASP 2024 guidance
- Intl.Segmenter initialized with "en" locale; UAX #29 word boundaries handle CJK/Thai universally

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Fixed incorrect word count test expectation**
- **Found during:** Task 2 (Word count GREEN phase)
- **Issue:** Plan specified test sentence "with seven words" but the sentence actually contains 8 words
- **Fix:** Changed test to "with eight words" and expected count to 8
- **Files modified:** apps/web/lib/__tests__/word-count.test.ts
- **Verification:** All 6 word-count tests pass
- **Committed in:** 3124ae8 (Task 2 commit)

---

**Total deviations:** 1 auto-fixed (1 bug in test expectation)
**Impact on plan:** Trivial correction to a miscounted test case. No scope creep.

## Issues Encountered
None

## User Setup Required
None - no external service configuration required.

## Next Phase Readiness
- Crypto module ready for import by write surface (03-02) and server key endpoints (03-03)
- Word count ready for AAD wordCount field population in write UI
- All exports match the interfaces specified in the plan

---
*Phase: 03-encryption-writing*
*Completed: 2026-06-07*
