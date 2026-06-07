---
phase: 07-installer-and-polish
plan: "03"
subsystem: entries-read
tags: [api, entries, encryption, e2e, read-only, client-side-decryption]

dependency_graph:
  requires: [07-01]
  provides: [read-entries-api, entries-browser-page]
  affects: [apps/api/src/routes/entries.ts, apps/web/app/entries/page.tsx]

tech_stack:
  added: []
  patterns:
    - AES-GCM client-side decryption from base64url server payload
    - Metadata-only list API (no ciphertext in list response)
    - User ownership guard (AND user_id = $2) on single-entry query

key_files:
  created:
    - apps/web/app/entries/page.tsx
  modified:
    - apps/api/src/routes/entries.ts

key_decisions:
  - Used getSessionDmk() (actual export name) not getDMK() as plan referenced — plan had a typo; actual session-dmk.ts exports getSessionDmk
  - Reused existing decryptEntry() + base64urlToUint8() helpers from lib/crypto.ts rather than inline Web Crypto calls — cleaner and consistent with write page
  - Pre-existing TypeScript errors in sw.ts, push.ts, next.config.ts are out-of-scope (present before this plan; confirmed by git stash test)

requirements_completed:
  - WRITE-06

metrics:
  duration: "~10 min"
  completed: "2026-06-07"
  tasks_completed: 2
  files_modified: 1
  files_created: 1
---

# Phase 7 Plan 3: Past Entries Browser with Client-Side Decryption Summary

GET /api/entries (metadata list) and GET /api/entries/:id (ciphertext payload) added to the API; /entries page decrypts diary entries in the browser using the in-memory DMK — server never touches plaintext.

**Duration:** ~10 min | **Completed:** 2026-06-07 | **Tasks:** 2/2 | **Files:** 2

## Tasks Completed

| # | Task | Commit | Files |
|---|------|--------|-------|
| 1 | Add GET /api/entries list and GET /api/entries/:id routes | 72d61ad | apps/api/src/routes/entries.ts |
| 2 | Past entries browser page with client-side decryption | 4b92a04 | apps/web/app/entries/page.tsx (created) |

## What Was Built

**Task 1 — API routes:**
- `GET /api/entries`: returns `{ entries: [{ id, word_count, created_at }] }` — no ciphertext in list response; authenticated via requireAuth preHandler; LIMIT 100, ordered by created_at DESC
- `GET /api/entries/:id`: returns `{ id, ciphertext, iv, aad, word_count, created_at }` with ciphertext/iv/aad as base64url strings; critical `AND user_id = $2` ownership guard prevents cross-user access; 404 on missing or unauthorized entries

**Task 2 — /entries browser page:**
- Fetches entry list on mount, populates metadata (date + word count) — no plaintext ever shown without user action
- Click-to-decrypt: fetches single entry payload, decodes base64url bytes, calls `decryptEntry()` from lib/crypto with session DMK
- DMK-null guard: if `getSessionDmk()` returns null, shows "Your diary is locked" error without crash — list still visible (metadata only)
- Inline expansion pattern: decrypted text shows in `<pre whiteSpace: pre-wrap>` block below the clicked row, not a modal
- Close button clears `selectedId`, `decryptedText`, and `decryptError`
- Wipe guard banner shown when entries exist but DMK is null
- Diary name fetched from GET /api/settings on mount; falls back to "Past Entries"
- Empty state with link to /write; 401 state with link to /unlock
- Strictly read-only — no textarea, no save, no edit affordance anywhere

## Deviations from Plan

**1. [Rule 1 - Bug] Used correct DMK accessor name**
- **Found during:** Task 2
- **Issue:** Plan referenced `getDMK()` but actual export from `apps/web/lib/session-dmk.ts` is `getSessionDmk()`. Using `getDMK()` would cause a TypeScript error.
- **Fix:** Used `getSessionDmk()` throughout the page component.
- **Files modified:** apps/web/app/entries/page.tsx
- **Impact:** None — functionally identical, just correct name

**2. [Rule 2 - Missing Critical] Reused existing crypto helpers**
- **Found during:** Task 2
- **Issue:** Plan described manual inline base64url decode + crypto.subtle.decrypt. The existing `lib/crypto.ts` already exports `decryptEntry()` and `base64urlToUint8()` which do exactly this.
- **Fix:** Imported and used the existing helpers — avoids code duplication and ensures consistent buffer handling (the `buf()` helper in crypto.ts works around TypeScript's ArrayBufferLike vs ArrayBuffer narrowing).
- **Files modified:** apps/web/app/entries/page.tsx

**Total deviations:** 2 auto-fixed (1 bug correction, 1 missing critical improvement). **Impact:** Zero — cleaner code, TypeScript compiles clean.

## Pre-existing Issues (Out of Scope)

Three TypeScript errors existed before this plan and remain unchanged:
- `apps/web/app/sw.ts(108)`: `clients` vs `Clients`
- `apps/web/lib/push.ts(69)`: Uint8Array buffer type mismatch in PushSubscription
- `apps/web/next.config.ts(2)`: `withSerwistInit` import style

Confirmed via `git stash` test — errors present in prior commit. Logged to `deferred-items.md`.

## Verification

- API TypeScript: 0 errors (`npx tsc --noEmit -p apps/api/tsconfig.json`)
- Web TypeScript: entries/page.tsx has 0 errors (3 pre-existing errors in other files unchanged)
- `grep "GET.*api/entries"` — list and single-entry routes confirmed in entries.ts
- `grep "user_id.*\$2"` — ownership guard confirmed in single-entry query
- `grep "getSessionDmk"` — DMK accessor used in page
- `grep "decryptEntry"` — Web Crypto decrypt via helper confirmed
- `grep "pre-wrap"` — read-only preformatted display confirmed

## Next

Ready for 07-04 (next plan in phase 07).

## Self-Check: PASSED

- [x] `apps/web/app/entries/page.tsx` exists on disk
- [x] `apps/api/src/routes/entries.ts` modified with GET routes
- [x] Commit 72d61ad exists: `feat(07-03): add GET /api/entries list and GET /api/entries/:id single routes`
- [x] Commit 4b92a04 exists: `feat(07-03): create /entries past entries browser with client-side decryption`
