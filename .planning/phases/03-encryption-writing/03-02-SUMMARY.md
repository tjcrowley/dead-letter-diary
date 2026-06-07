---
phase: 03-encryption-writing
plan: 02
subsystem: ui
tags: [dexie, indexeddb, auto-save, textarea, word-count, encrypted-storage]

# Dependency graph
requires:
  - phase: 03-encryption-writing
    provides: "Client-side crypto module (encryptEntry/decryptEntry), word count (countWords)"
provides:
  - "Dexie IndexedDB schema with DraftEntry type and saveDraft/loadDraft/loadLatestDraft"
  - "Session DMK holder module (setSessionDmk/getSessionDmk/clearSessionDmk)"
  - "Distraction-free /write page with live word count and encrypted auto-save"
affects: [03-03, 04-deadline-engine, 05-polish-release]

# Tech tracking
tech-stack:
  added: [dexie, fake-indexeddb]
  patterns: [Encrypted-before-storage IndexedDB pattern, debounced auto-save with flush-on-unload]

key-files:
  created:
    - apps/web/lib/db.ts
    - apps/web/lib/session-dmk.ts
    - apps/web/app/write/page.tsx
    - apps/web/lib/__tests__/db.test.ts
  modified:
    - apps/web/lib/crypto.ts
    - apps/web/package.json

key-decisions:
  - "Plain textarea only -- no rich text editor (project out-of-scope constraint)"
  - "Session DMK in separate module (not page export) -- Next.js forbids non-page exports from page files"
  - "Auto-save debounce 1 second, flush on beforeunload and component unmount"
  - "50-word minimum default, word count turns green (#22c55e) when met"

patterns-established:
  - "Encrypt before IndexedDB: all content encrypted via encryptEntry before saveDraft"
  - "Inline styles (no Tailwind): consistent with existing page components"
  - "buf() helper in crypto.ts: wraps Uint8Array for TypeScript BufferSource compatibility"

requirements-completed: [WRITE-01, WRITE-02, WRITE-03, WRITE-04]

# Metrics
duration: 4min
completed: 2026-06-07
---

# Phase 3 Plan 2: Write Surface Summary

**Distraction-free /write page with live word count, Dexie-backed encrypted auto-save to IndexedDB, and session DMK holder**

## Performance

- **Duration:** 4 min
- **Started:** 2026-06-07T05:54:57Z
- **Completed:** 2026-06-07T05:58:57Z
- **Tasks:** 2
- **Files modified:** 6

## Accomplishments
- Dexie IndexedDB schema with saveDraft/loadDraft/loadLatestDraft for encrypted draft storage
- Full-viewport distraction-free textarea with auto-focus, serif font, minimal chrome
- Live word count display that turns green at 50-word minimum threshold
- Debounced 1-second auto-save encrypts content before writing to IndexedDB
- Session DMK holder module for unlock flow integration
- 20 tests passing (3 db + 6 word-count + 11 crypto)

## Task Commits

Each task was committed atomically:

1. **Task 1: Dexie database schema and auto-save logic with tests** - `a806e73` (feat)
2. **Task 2: Write surface page with live word count and debounced auto-save** - `9aa5ede` (feat)

## Files Created/Modified
- `apps/web/lib/db.ts` - Dexie database schema: DraftEntry interface, saveDraft/loadDraft/loadLatestDraft
- `apps/web/lib/session-dmk.ts` - Module-level DMK holder: setSessionDmk/getSessionDmk/clearSessionDmk
- `apps/web/app/write/page.tsx` - Distraction-free write page with live word count and encrypted auto-save
- `apps/web/lib/__tests__/db.test.ts` - 3 tests for IndexedDB save/load/upsert/latest using fake-indexeddb
- `apps/web/lib/crypto.ts` - Added buf() helper for TypeScript Uint8Array/BufferSource type compatibility
- `apps/web/package.json` - Added dexie dependency and fake-indexeddb devDependency

## Decisions Made
- Plain textarea only (no rich text editor) per project constraints
- Session DMK holder extracted to separate module since Next.js page files cannot have non-default exports
- Auto-save debounce at 1 second with immediate flush on beforeunload and component unmount
- 50-word minimum with green (#22c55e) color indicator when met
- Inline styles used consistently with existing pages (no Tailwind in project)

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] Extracted setSessionDmk to separate module**
- **Found during:** Task 2 (Write page build verification)
- **Issue:** Next.js build fails when page files export non-page fields -- setSessionDmk was exported from page.tsx
- **Fix:** Created apps/web/lib/session-dmk.ts as separate module, page imports getSessionDmk from it
- **Files modified:** apps/web/lib/session-dmk.ts, apps/web/app/write/page.tsx
- **Verification:** Next.js build passes
- **Committed in:** 9aa5ede (Task 2 commit)

**2. [Rule 3 - Blocking] Fixed TypeScript Uint8Array/BufferSource type mismatch in crypto.ts**
- **Found during:** Task 2 (Write page build verification)
- **Issue:** TypeScript 5 types Uint8Array.buffer as ArrayBufferLike (includes SharedArrayBuffer), but Web Crypto APIs expect BufferSource with plain ArrayBuffer. Build fails with type errors across all crypto.subtle calls.
- **Fix:** Added buf() helper that creates fresh Uint8Array copy with proper ArrayBuffer backing, applied to all crypto.subtle call sites
- **Files modified:** apps/web/lib/crypto.ts
- **Verification:** All 20 tests pass, Next.js build succeeds
- **Committed in:** 9aa5ede (Task 2 commit)

---

**Total deviations:** 2 auto-fixed (2 blocking)
**Impact on plan:** Both fixes necessary for build to succeed. No scope creep.

## Issues Encountered
None beyond the auto-fixed deviations above.

## User Setup Required
None - no external service configuration required.

## Next Phase Readiness
- Write surface complete, ready for server key endpoints (03-03)
- Session DMK holder ready for unlock flow wiring
- All Dexie exports match planned interfaces
- Crypto module type-safe for production builds

---
*Phase: 03-encryption-writing*
*Completed: 2026-06-07*
