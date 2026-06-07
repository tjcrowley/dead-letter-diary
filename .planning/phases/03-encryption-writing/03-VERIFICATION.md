---
phase: 03-encryption-writing
verified: 2026-06-07T06:30:00Z
status: gaps_found
score: 14/15 must-haves verified
re_verification: false
gaps:
  - truth: "Server uses timingSafeEqual for shard comparisons (CRYPT-10)"
    status: failed
    reason: "crypto.timingSafeEqual is not called anywhere in the API source. The plan required it in apps/api/src/routes/crypto.ts as a key_link, the test file for CRYPT-10 does not test for its presence, and the implementation has no buffer comparisons at all in Phase 3 code."
    artifacts:
      - path: "apps/api/src/routes/crypto.ts"
        issue: "No call to crypto.timingSafeEqual — import from node:crypto is present for other operations but timingSafeEqual is unused. Current shard operations are store-only (no comparison), but the requirement states all shard comparisons must use timingSafeEqual and the plan explicitly required it as a named key_link."
      - path: "apps/api/src/routes/__tests__/crypto.test.ts"
        issue: "No test for timingSafeEqual usage — the test file covers shard CRUD but never verifies the timing-safe comparison requirement that CRYPT-10 mandates."
    missing:
      - "Either add a shard verification/comparison endpoint that uses crypto.timingSafeEqual for any buffer equality checks, or document that no shard comparisons exist in Phase 3 and update CRYPT-10 scope accordingly."
      - "The test for CRYPT-10 should assert timingSafeEqual is used — the current test verifies auth enforcement and shard storage but not timing-safe comparison."
human_verification:
  - test: "Open /write page in browser"
    expected: "Full-viewport distraction-free textarea auto-focuses immediately on page load; no toolbar, no sidebar, only a word count indicator in bottom-right corner"
    why_human: "autoFocus behavior and visual chrome cannot be verified programmatically"
  - test: "Type fewer than 50 words in the write editor, then type until 50+ words"
    expected: "Word count displays as muted color below 50, transitions to green (#22c55e) at exactly 50 words"
    why_human: "Color transition is a visual behavior that requires a browser rendering context"
---

# Phase 3: Encryption & Writing Verification Report

**Phase Goal:** Diary entries are end-to-end encrypted with split-key architecture and the write surface works
**Verified:** 2026-06-07T06:30:00Z
**Status:** gaps_found (1 gap)
**Re-verification:** No — initial verification

## Goal Achievement

### Observable Truths

| # | Truth | Status | Evidence |
|---|-------|--------|----------|
| 1 | DMK can be generated, wrapped, and unwrapped with a round-trip producing identical encrypt/decrypt behavior | VERIFIED | `generateDmk`, `wrapDmk`, `unwrapDmk` implemented in crypto.ts; round-trip test at crypto.test.ts:28 |
| 2 | Unwrapped DMK is non-extractable | VERIFIED | `unwrapDmk` passes `extractable: false` to `unwrapKey`; test at crypto.test.ts:75 verifies `dmk.extractable === false` and export throws |
| 3 | Entry encrypt/decrypt round-trips correctly with matching AAD | VERIFIED | `encryptEntry`/`decryptEntry` in crypto.ts; test at crypto.test.ts:106 |
| 4 | Mismatched AAD causes decryption to fail | VERIFIED | Test at crypto.test.ts:155 uses tampered AAD and expects rejection |
| 5 | Each encryption produces a unique IV | VERIFIED | `crypto.getRandomValues(new Uint8Array(12))` per call; test at crypto.test.ts:135 asserts IVs differ |
| 6 | PBKDF2 passphrase path produces a 32-byte device shard | VERIFIED | `deriveShardFromPassphrase` with 600,000 iterations; test at crypto.test.ts:182 checks length === 32 |
| 7 | Word count handles CJK, Thai, and English correctly via Intl.Segmenter | VERIFIED | `countWords` uses `new Intl.Segmenter("en", { granularity: "word" })` with `isWordLike` filter; tests cover empty, whitespace, English, CJK, mixed |
| 8 | User sees a distraction-free editor with auto-focus and minimal chrome | ? HUMAN | `<textarea autoFocus>` present in write/page.tsx; visual verification required |
| 9 | Live word count is visible and turns green when minimum (default 50) is met | ? HUMAN | `meetsMinimum ? "#22c55e" : "#888"` logic present; visual verification required |
| 10 | Content auto-saves to IndexedDB within 1-2 seconds of last keystroke | VERIFIED | 1-second debounce via `setTimeout(doSave, AUTOSAVE_DELAY_MS)` in write/page.tsx; `saveDraft` called in `doSave` |
| 11 | Auto-save stores encrypted content (not plaintext) in IndexedDB | VERIFIED | `doSave` calls `encryptEntry(dmk, content, ...)` then `saveDraft({ ciphertext, iv, aad, ... })` — plaintext never reaches IndexedDB |
| 12 | Content persists across page refresh (decrypted on load from IndexedDB) | VERIFIED | `useEffect` calls `loadLatestDraft()` then `decryptEntry(dmk, draft.ciphertext, ...)` on mount |
| 13 | Authenticated user can retrieve their server shard (CRYPT-04) | VERIFIED | `GET /api/crypto/shard` with `preHandler: [requireAuth]`; decrypts at-rest encrypted shard; test at crypto.test.ts:78 |
| 14 | Server shard is encrypted at rest with SHARD_ENCRYPTION_KEY | VERIFIED | `encryptShard`/`decryptShard` helpers use `createCipheriv("aes-256-gcm", key, iv)` with iv(12)+authTag(16)+ciphertext format |
| 15 | Server uses timingSafeEqual for shard comparisons (CRYPT-10) | FAILED | `crypto.timingSafeEqual` is not called anywhere in any API source file. The implementation has no buffer comparison operations in Phase 3 routes. |
| 16 | User can submit an encrypted entry with AAD-bound word count | VERIFIED | `POST /api/entries` parses AAD, checks `wordCount >= wordMinimum`, stores ciphertext+iv+aad+word_count |
| 17 | Server rejects entries where AAD word count is below the user's minimum | VERIFIED | Returns 400 with `{ error: "Word count below minimum", required, actual }`; test at entries.test.ts:83 |

**Score:** 14/15 automated truths verified (+ 2 human-needed)

---

## Required Artifacts

### Plan 03-01 Artifacts

| Artifact | Expected | Status | Details |
|----------|----------|--------|---------|
| `apps/web/lib/crypto.ts` | All Web Crypto operations | VERIFIED | 261 lines; exports `generateDmk`, `wrapDmk`, `unwrapDmk`, `encryptEntry`, `decryptEntry`, `deriveShardFromPassphrase`, `xorShards`, `uint8ToBase64url`, `base64urlToUint8` |
| `apps/web/lib/word-count.ts` | Intl.Segmenter word counting | VERIFIED | 29 lines; exports `countWords` |
| `apps/web/vitest.config.ts` | Vitest config with happy-dom | VERIFIED | `environment: "happy-dom"` confirmed |
| `apps/web/lib/__tests__/crypto.test.ts` | Tests for CRYPT-01—CRYPT-08 | VERIFIED | 219 lines (min 80); 11 tests covering all specified behaviors |
| `apps/web/lib/__tests__/word-count.test.ts` | Tests for WRITE-04 | VERIFIED | 36 lines (min 20); 6 tests covering empty, whitespace, English, CJK, mixed |

### Plan 03-02 Artifacts

| Artifact | Expected | Status | Details |
|----------|----------|--------|---------|
| `apps/web/lib/db.ts` | Dexie schema and auto-save | VERIFIED | 64 lines; exports `db`, `saveDraft`, `loadDraft`, `loadLatestDraft`, `DraftEntry` |
| `apps/web/app/write/page.tsx` | Distraction-free write surface | VERIFIED | 219 lines (min 60); full viewport textarea, live word count, debounced auto-save |
| `apps/web/lib/__tests__/db.test.ts` | Tests for IndexedDB auto-save | VERIFIED | 59 lines (min 20); 3 tests using fake-indexeddb |

### Plan 03-03 Artifacts

| Artifact | Expected | Status | Details |
|----------|----------|--------|---------|
| `apps/api/src/routes/crypto.ts` | Shard retrieval, storage, key-wrap | VERIFIED | 151 lines; GET/POST shard, POST/GET key-wrap, all with `preHandler: [requireAuth]` |
| `apps/api/src/routes/entries.ts` | Encrypted entry submission | VERIFIED | 83 lines; AAD word count verification, userId spoofing protection, DB INSERT |
| `apps/api/src/routes/__tests__/crypto.test.ts` | Tests for CRYPT-04, CRYPT-10 | PARTIAL | 252 lines (min 50); tests cover auth enforcement and shard CRUD but no `timingSafeEqual` verification |
| `apps/api/src/routes/__tests__/entries.test.ts` | Tests for WRITE-05 | VERIFIED | 203 lines (min 30); 5 tests covering auth, word count validation, DB storage, userId mismatch |

---

## Key Link Verification

### Plan 03-01 Key Links

| From | To | Via | Status | Details |
|------|----|-----|--------|---------|
| `apps/web/lib/crypto.ts` | Web Crypto API | `crypto.subtle.*` | WIRED | `crypto.subtle.generateKey`, `importKey`, `deriveKey`, `wrapKey`, `unwrapKey`, `encrypt`, `decrypt`, `deriveBits` all present |
| `apps/web/lib/word-count.ts` | Intl.Segmenter | `new Intl.Segmenter` with isWordLike | WIRED | `new Intl.Segmenter("en", { granularity: "word" })` at module level; `segment.isWordLike` in loop |

### Plan 03-02 Key Links

| From | To | Via | Status | Details |
|------|----|-----|--------|---------|
| `apps/web/app/write/page.tsx` | `apps/web/lib/crypto.ts` | `encryptEntry`/`decryptEntry` | WIRED | `import { encryptEntry, decryptEntry } from "@/lib/crypto"` — both used in `doSave` and `useEffect` |
| `apps/web/app/write/page.tsx` | `apps/web/lib/word-count.ts` | `countWords` | WIRED | `import { countWords } from "@/lib/word-count"` — used in `handleChange` and `doSave` |
| `apps/web/app/write/page.tsx` | `apps/web/lib/db.ts` | `saveDraft`/`loadDraft` | WIRED | `import { saveDraft, loadLatestDraft } from "@/lib/db"` — both used in `doSave` and `useEffect` |
| `apps/web/lib/db.ts` | dexie | Dexie class | WIRED | `import Dexie, { type Table } from "dexie"` — class extends Dexie |

### Plan 03-03 Key Links

| From | To | Via | Status | Details |
|------|----|-----|--------|---------|
| `apps/api/src/routes/crypto.ts` | requireAuth middleware | `preHandler` hook | WIRED | `{ preHandler: [requireAuth] }` on all four endpoints |
| `apps/api/src/routes/crypto.ts` | `crypto.timingSafeEqual` | Node crypto for shard comparison | NOT WIRED | `timingSafeEqual` is not imported or called anywhere in the file |
| `apps/api/src/routes/crypto.ts` | `SHARD_ENCRYPTION_KEY` | AES-256-GCM encrypt/decrypt | WIRED | `process.env.SHARD_ENCRYPTION_KEY!` used in both `encryptShard` and `decryptShard` helpers |
| `apps/api/src/routes/entries.ts` | entries table | `INSERT INTO entries` | WIRED | `INSERT INTO entries (id, user_id, ciphertext, iv, aad, word_count) VALUES ($1,$2,$3,$4,$5,$6)` |
| `apps/api/src/server.ts` | `apps/api/src/routes/crypto.ts` | `fastify.register(cryptoRoutes)` | WIRED | `fastify.register(cryptoRoutes)` at line 61 |
| `apps/api/src/server.ts` | `apps/api/src/routes/entries.ts` | `fastify.register(entriesRoutes)` | WIRED | `fastify.register(entriesRoutes)` at line 62 |

---

## Requirements Coverage

| Requirement | Source Plan | Description | Status | Evidence |
|-------------|-------------|-------------|--------|----------|
| CRYPT-01 | 03-01 | DMK generated at account creation (32 bytes random) | SATISFIED | `generateDmk()` generates AES-GCM 256-bit key via `crypto.subtle.generateKey` |
| CRYPT-02 | 03-01 | DMK wrapped with AES-GCM using HKDF(device XOR server shard) | SATISFIED | `wrapDmk` derives wrapping key via HKDF from XOR'd shards; `wrapKey` with AES-GCM |
| CRYPT-03 | 03-01 | Device shard from WebAuthn PRF or Argon2id/PBKDF2 passphrase | SATISFIED | `deriveShardFromPassphrase` uses PBKDF2-SHA256 600k iterations; PRF path uses raw PRF output from Phase 2 |
| CRYPT-04 | 03-03 | Server shard in PostgreSQL, returned only to authenticated sessions | SATISFIED | `GET /api/crypto/shard` requires auth; stores in server_shards table |
| CRYPT-05 | 03-01 | All diary entries encrypted with AES-GCM 256 using DMK | SATISFIED | `encryptEntry` uses `crypto.subtle.encrypt` with AES-GCM and the DMK |
| CRYPT-06 | 03-01 | Fresh random IV (12 bytes) per encryption — never reused | SATISFIED | `crypto.getRandomValues(new Uint8Array(12))` inside `encryptEntry` per call |
| CRYPT-07 | 03-01 | Entry metadata bound as AES-GCM AAD | SATISFIED | `JSON.stringify({ entryId, userId, wordCount })` encoded as UTF-8 AAD |
| CRYPT-08 | 03-01 | DMK held as non-extractable CryptoKey in memory during session | SATISFIED | `unwrapDmk` passes `extractable: false`; test verifies export throws |
| CRYPT-09 | 03-01 | Per-user random HKDF salt (32 bytes) stored at registration | SATISFIED | Phase 2 auth.ts creates `crypto.randomBytes(32)` hkdf_salt at registration |
| CRYPT-10 | 03-03 | All shard/token/challenge comparisons use crypto.timingSafeEqual() | BLOCKED | `timingSafeEqual` is not called anywhere in any API source file. No buffer comparisons exist in Phase 3 crypto routes — but the requirement mandates its use and the plan required it as a named implementation detail. |
| WRITE-01 | 03-02 | Distraction-free write surface with auto-focus, minimal chrome | SATISFIED | `<textarea autoFocus>` with no toolbar or sidebar; only word count indicator visible |
| WRITE-02 | 03-02 | Live word count visible, turns green when minimum is met | SATISFIED | `meetsMinimum ? "#22c55e" : "#888"` CSS color toggle; `{wordCount} / {WORD_MINIMUM} words` displayed |
| WRITE-03 | 03-02 | Auto-save to IndexedDB every 1-2 seconds (debounced) | SATISFIED | 1-second debounce in `scheduleSave`; flushes on `beforeunload` and unmount |
| WRITE-04 | 03-02 | Word count via Intl.Segmenter with isWordLike (CJK/Thai) | SATISFIED | `new Intl.Segmenter("en", { granularity: "word" })` with `isWordLike` filter |
| WRITE-05 | 03-03 | Server verifies word count from AAD on check-in submission | SATISFIED | `POST /api/entries` parses AAD JSON, compares `wordCount` against `word_minimum` from `deadline_state` |

**Coverage:** 14/15 requirements SATISFIED, 1 BLOCKED (CRYPT-10)

---

## Anti-Patterns Found

| File | Line | Pattern | Severity | Impact |
|------|------|---------|----------|--------|
| `apps/api/src/routes/crypto.ts` | 50 | `// TODO: Phase 5 will add deadline_state.state === 'active' check` | Info | Intentional deferral; documented in STATE.md decisions. Server shard is accessible to any authenticated session regardless of deadline standing in Phase 3. By design — good-standing gate is Phase 5 scope. |
| `apps/web/app/write/page.tsx` | 15 | `const PLACEHOLDER_USER_ID = "local-user"` | Warning | Entries auto-saved locally use this placeholder userId in AAD. Server submission (WRITE-05) requires the real userId — the write surface cannot submit to the server without the unlock flow wiring real user context. This is a known incomplete integration, not a blocking gap for Phase 3 (server submission is tested separately). |

---

## Human Verification Required

### 1. Distraction-Free Editor Auto-Focus

**Test:** Open the app and navigate to `/write`
**Expected:** The textarea receives focus immediately on page load without clicking — cursor appears in the text field, keyboard input goes directly to the textarea
**Why human:** `autoFocus` attribute is present in JSX but browser auto-focus behavior can be suppressed by focus policies, and cannot be verified without a rendered browser environment

### 2. Word Count Color Transition

**Test:** In the `/write` editor, type content and observe the word count indicator in the bottom-right corner
**Expected:** Count displays in muted grey below 50 words; at exactly 50 words the count text transitions to green (#22c55e); format is "{count} / 50 words"
**Why human:** Color rendering and CSS transition require visual inspection in a browser — `meetsMinimum ? "#22c55e" : "#888"` is implemented but visual correctness cannot be confirmed programmatically

---

## Gaps Summary

**1 gap blocking full CRYPT-10 compliance:**

`crypto.timingSafeEqual` is required by CRYPT-10 ("all shard/token/challenge comparisons use crypto.timingSafeEqual()") and was explicitly named in the 03-03-PLAN key_links as a required implementation detail. The implementation has no calls to `timingSafeEqual` anywhere in the API source.

The Phase 3 crypto routes do not perform shard-to-shard comparisons (they store and retrieve shards, not compare them), which may explain why it was omitted. However:
- The PLAN states "Use `crypto.timingSafeEqual` for any shard comparison operations" — implying the comparison context should exist
- The test file for CRYPT-10 does not verify timing-safe comparison behavior
- The requirement is marked "Complete" in REQUIREMENTS.md, which is premature

Resolution options: (a) add a shard verification endpoint that performs timing-safe comparison when checking shard integrity, or (b) clarify that Phase 3 has no shard comparison operations and defer CRYPT-10 to the Phase 5 good-standing gate where the shard is actively compared server-side.

**No other blocking gaps.** All 14 other truths verified. The write surface is substantively implemented, the crypto module is complete, and server-side entry storage with AAD word count verification is working.

---

_Verified: 2026-06-07T06:30:00Z_
_Verifier: Claude (gsd-verifier)_
