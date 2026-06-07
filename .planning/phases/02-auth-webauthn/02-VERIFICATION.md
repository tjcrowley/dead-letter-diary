---
phase: 02-auth-webauthn
verified: 2026-06-06T00:00:00Z
status: gaps_found
score: 4/5 success criteria verified
gaps:
  - truth: "User can unlock the diary with biometric (Face ID, Touch ID, Windows Hello) and passphrase/PIN fallback is always visible"
    status: failed
    reason: "Client-side WebAuthn authenticatePasskey() destructures { options, hkdfSalt } from auth-options response, but server returns a flat object { challenge, allowCredentials, ..., hkdfSalt }. The `options` variable is always undefined at runtime, causing the biometric auth flow to break when PRF eval is applied."
    artifacts:
      - path: "apps/web/lib/webauthn.ts"
        issue: "Line 85-88: destructures { options, hkdfSalt } but server sends flat spread of options + hkdfSalt. `options` will be undefined, then `...options` on line 95 spreads undefined."
      - path: "apps/api/src/routes/webauthn.ts"
        issue: "Line 181: `return reply.send({ ...options, hkdfSalt })` — options fields are at root level, not nested under `options` key."
    missing:
      - "Either: server should return { options: { challenge, allowCredentials, ... }, hkdfSalt } OR client should destructure the flat shape: const { hkdfSalt, ...options } = await api.post(...)"
human_verification:
  - test: "End-to-end biometric unlock flow in a real browser"
    expected: "User visits /unlock, clicks 'Unlock with Biometric', OS biometric prompt appears, on success redirects to /"
    why_human: "Cannot verify browser WebAuthn ceremony (navigator.credentials.get), biometric hardware interaction, or PRF eval result without a real browser and authenticator"
  - test: "End-to-end setup flow in a real browser"
    expected: "User visits /setup, creates passphrase account, clicks 'Register Passkey', OS passkey enrollment prompt appears, PRF support status is displayed"
    why_human: "Cannot verify startRegistration() browser ceremony or PRF extension negotiation programmatically"
  - test: "Session persists across browser refresh"
    expected: "After unlocking (passphrase or biometric), refreshing the page does not require re-authentication"
    why_human: "Requires real browser session cookie behavior; cannot verify httpOnly cookie persistence via code inspection alone"
---

# Phase 2: Auth & WebAuthn Verification Report

**Phase Goal:** Users can create an account and unlock their diary with biometric, passphrase, or PIN
**Verified:** 2026-06-06
**Status:** gaps_found
**Re-verification:** No — initial verification

## Goal Achievement

### Observable Truths (from ROADMAP.md Success Criteria)

| # | Truth | Status | Evidence |
|---|-------|--------|----------|
| 1 | User can create an account with a passphrase on the first-run setup page | VERIFIED | `apps/api/src/routes/auth.ts` POST /api/auth/register: Argon2id hash, single-user check, session cookie issuance. `apps/web/app/setup/page.tsx`: form calls `api.post('/api/auth/register', { passphrase })`. |
| 2 | User can register a WebAuthn passkey (biometric or hardware key) with PRF extension | VERIFIED | `apps/api/src/routes/webauthn.ts`: register-options + register-verify endpoints. `apps/web/lib/webauthn.ts` registerPasskey(): injects `prf: {}` extension, extracts prfEnabled from clientExtensionResults. `apps/web/app/setup/page.tsx`: calls registerPasskey() in step 2. |
| 3 | User can unlock the diary with biometric and passphrase/PIN fallback is always visible | FAILED | The unlock page layout is correct (biometric + passphrase side-by-side + PIN below). However, `authenticatePasskey()` in `apps/web/lib/webauthn.ts:85-88` destructures `{ options, hkdfSalt }` from the auth-options response, but the server returns `{ ...options, hkdfSalt }` (flat spread). At runtime, `options` is `undefined`, causing `...options` on line 95 to throw. The biometric auth path is broken. |
| 4 | Session persists across browser refresh without re-authentication | VERIFIED (needs human) | `requireAuth` middleware validates session cookie + DB session row + expiry. JWT httpOnly secure sameSite=strict cookie with 7-day expiry set on both passphrase and WebAuthn unlock. Architecture is correct; browser behavior needs human confirmation. |
| 5 | Server rejects WebAuthn assertions that lack biometric confirmation (UV flag) | VERIFIED | `apps/api/src/routes/webauthn.ts:249-253`: explicit UV check `if (!verification.authenticationInfo.userVerified)` returns 403. Tested in `webauthn.test.ts` "rejects UV=false assertion with 403 (AUTH-07)". |

**Score:** 4/5 truths verified (1 failed, 1 verified but needs human confirmation for browser behavior)

---

### Required Artifacts

| Artifact | Status | Details |
|----------|--------|---------|
| `apps/api/src/plugins/auth.ts` | VERIFIED | Registers @fastify/cookie and @fastify/jwt with httpOnly cookie extraction. Exported as fastify-plugin with `dependencies: ['db']`. |
| `apps/api/src/routes/auth.ts` | VERIFIED | POST /api/auth/register (Argon2id, single-user, session), POST /api/auth/unlock, GET /api/auth/me, DELETE /api/auth/session. All substantive. |
| `apps/api/src/middleware/requireAuth.ts` | VERIFIED | Verifies JWT, queries sessions table with expiry check, decorates request.userId. |
| `apps/api/vitest.config.ts` | VERIFIED | Configures vitest with `include: ['src/**/*.test.ts']`, node environment. |
| `apps/api/src/test-helpers/index.ts` | VERIFIED | mockPool(), buildTestApp(), createMockSession() all implemented and substantive. |
| `apps/api/src/plugins/redis.ts` | VERIFIED | ioredis plugin with decorate, onClose cleanup, TypeScript declaration merging. |
| `apps/api/src/routes/webauthn.ts` | VERIFIED | Four WebAuthn endpoints: register-options, register-verify, auth-options, auth-verify. UV enforcement present. |
| `apps/api/src/routes/__tests__/webauthn.test.ts` | VERIFIED | 7 tests covering registration, auth, UV rejection, challenge replay. In-memory Redis mock, vi.mock for @simplewebauthn/server. |
| `apps/web/lib/api.ts` | VERIFIED | Typed fetch wrapper with get/post/delete, credentials: include, error handling. |
| `apps/web/lib/webauthn.ts` | STUB (wiring gap) | registerPasskey() is correct. authenticatePasskey() has a response shape mismatch — destructures `{ options, hkdfSalt }` but server sends flat object. |
| `apps/web/app/setup/page.tsx` | VERIFIED | Two-step flow: passphrase account creation + WebAuthn enrollment. Calls api.post and registerPasskey(). PRF status displayed. Error handling present. |
| `apps/web/app/unlock/page.tsx` | VERIFIED (layout) | Biometric + passphrase side-by-side + PIN below (AUTH-06 satisfied). authenticatePasskey() called on biometric button. PIN in sessionStorage, validated client-side. |
| `apps/api/migrations/002.do.add-prf-capable.sql` | VERIFIED | `ALTER TABLE webauthn_credentials ADD COLUMN prf_capable BOOLEAN NOT NULL DEFAULT false;` |

---

### Key Link Verification

| From | To | Via | Status | Details |
|------|----|-----|--------|---------|
| `apps/api/src/routes/auth.ts` | `apps/api/src/plugins/auth.ts` | `fastify.jwt.sign` | WIRED | Line 36: `fastify.jwt.sign({ sub: userId, sid: sessionId }, { expiresIn: '7d' })` |
| `apps/api/src/routes/auth.ts` | argon2 | `argon2.hash` and `argon2.verify` | WIRED | Lines 83-88: hash with argon2id params. Line 135: `argon2.verify(user.passphrase_hash, passphrase)`. |
| `apps/api/src/middleware/requireAuth.ts` | sessions table | SHA-256 token lookup | WIRED | Line 27-30: `SELECT id FROM sessions WHERE id = $1 AND user_id = $2 AND expires_at > NOW()`. Uses `sid` from JWT (session ID, not token hash). Note: session lookup is by session ID (UUID), which is correct — the SHA-256 hash is the `token_hash` column used for a different purpose; the session ID is used here via the JWT `sid` claim. |
| `apps/api/src/routes/webauthn.ts` | `@simplewebauthn/server` | import of generate/verify functions | WIRED | Lines 2-8: `import { generateRegistrationOptions, verifyRegistrationResponse, generateAuthenticationOptions, verifyAuthenticationResponse } from '@simplewebauthn/server'`. |
| `apps/api/src/routes/webauthn.ts` | `apps/api/src/plugins/auth.ts` | `fastify.jwt.sign` for session after WebAuthn auth | WIRED | Lines 276-279: session issued after successful auth-verify. |
| `apps/api/src/routes/webauthn.ts` | redis | Challenge storage with 60s TTL | WIRED | Lines 60-65: `fastify.redis.set(key, options.challenge, 'EX', 60)`. |
| `apps/web/lib/webauthn.ts` | `@simplewebauthn/browser` | startRegistration, startAuthentication with PRF | WIRED | Lines 1-5: import present. Lines 56, 103: called with PRF extension injected. |
| `apps/web/app/setup/page.tsx` | `apps/web/lib/api.ts` | POST /api/auth/register | WIRED | Line 34: `await api.post('/api/auth/register', { passphrase })`. |
| `apps/web/app/unlock/page.tsx` | `apps/web/lib/webauthn.ts` | authenticatePasskey for biometric unlock | WIRED | Lines 6, 36: import and call present. |
| `apps/web/lib/webauthn.ts` (authenticatePasskey) | `apps/api/src/routes/webauthn.ts` (auth-options) | Response shape | NOT WIRED | Server: `return reply.send({ ...options, hkdfSalt })` — flat. Client: `const { options, hkdfSalt } = await api.post(...)` — expects nested. `options` will be `undefined` at runtime. |

---

### Requirements Coverage

| Requirement | Source Plan | Description | Status | Evidence |
|-------------|-------------|-------------|--------|----------|
| AUTH-01 | 02-01 | User can create account with passphrase during first-run setup | SATISFIED | POST /api/auth/register in auth.ts + setup page form |
| AUTH-02 | 02-02, 02-03 | User can register a WebAuthn passkey (biometric or hardware key) with PRF extension | SATISFIED | register-options + register-verify endpoints + registerPasskey() browser helper |
| AUTH-03 | 02-02, 02-03 | User can unlock the diary with biometric (Face ID, Touch ID, Windows Hello, fingerprint) | BLOCKED | auth-verify endpoint is correct (server side), but authenticatePasskey() client code has response shape mismatch — biometric auth flow broken |
| AUTH-04 | 02-01 | User can unlock with passphrase as fallback when PRF is unavailable | SATISFIED | POST /api/auth/unlock in auth.ts + passphrase section in unlock page |
| AUTH-05 | 02-03 | User can set a PIN for quick unlock (UI lockout layer, not a key source) | SATISFIED | sessionStorage PIN in unlock/page.tsx; validated client-side only, no server endpoint |
| AUTH-06 | 02-03 | Passphrase/PIN fallback is always visible alongside biometric prompt | SATISFIED | unlock/page.tsx renders biometric card + passphrase card side-by-side plus PIN section below, not behind tabs |
| AUTH-07 | 02-02 | Server-side UV flag verification rejects assertions without biometric confirmation | SATISFIED | webauthn.ts:249-253 + webauthn.test.ts UV=false rejection test |
| AUTH-08 | 02-01 | Session persists across browser refresh (JWT or secure cookie) | SATISFIED (code-level) | httpOnly secure sameSite=strict cookie + DB session row validation in requireAuth |

**Coverage:** 7/8 AUTH requirements satisfied at code level. AUTH-03 blocked by client-side wiring gap.

No orphaned requirements — all 8 AUTH requirements appear in plan frontmatter and are accounted for.

---

### Anti-Patterns Found

| File | Pattern | Severity | Impact |
|------|---------|----------|--------|
| `apps/web/lib/webauthn.ts:85-88` | Response shape mismatch — destructures `{ options, hkdfSalt }` from flat server response | Blocker | Biometric authentication flow fails at runtime; `options` is undefined, spread throws |

No TODO/FIXME/placeholder comments found in implementation files. No empty return stubs. No console.log-only implementations.

---

### Human Verification Required

#### 1. End-to-End Biometric Unlock (after wiring gap fixed)

**Test:** Fix the authenticatePasskey response shape mismatch, then: docker compose up, visit https://localhost/unlock, click "Unlock with Biometric", complete biometric prompt.
**Expected:** OS Face ID/Touch ID/Windows Hello dialog appears, on success redirects to /
**Why human:** Browser WebAuthn ceremony (navigator.credentials.get), biometric hardware, and PRF eval cannot be verified programmatically.

#### 2. End-to-End Setup Flow

**Test:** Visit https://localhost/setup, create passphrase account, click "Register Passkey".
**Expected:** OS passkey enrollment prompt appears, PRF support status is displayed, "Continue to Diary" button appears.
**Why human:** startRegistration() browser ceremony requires real authenticator; PRF negotiation result depends on device capability.

#### 3. Session Persistence Across Refresh

**Test:** Unlock via passphrase at /unlock, refresh the page, verify no re-authentication prompt.
**Expected:** Session is maintained; page loads without redirecting back to /unlock.
**Why human:** httpOnly cookie persistence requires real browser session; cannot verify via code inspection.

---

### Gaps Summary

**One blocking gap** prevents full goal achievement.

**Root cause:** `authenticatePasskey()` in `apps/web/lib/webauthn.ts` destructures the response from `/api/webauthn/auth-options` as `{ options, hkdfSalt }`, expecting a nested `options` object. However, the server (webauthn.ts line 181) returns `{ ...options, hkdfSalt }` — a flat spread where all WebAuthn options fields are at the root level alongside `hkdfSalt`.

At runtime, `options` is `undefined`. The subsequent `...options` spread on line 95 will throw a TypeError, breaking the biometric authentication path entirely. The passphrase unlock and PIN paths are unaffected.

**Fix options:**

Option A (change server): Return `{ options: rawOptions, hkdfSalt }` — requires the client destructuring pattern to remain `{ options, hkdfSalt }`.

Option B (change client): Destructure the flat shape:
```typescript
const { hkdfSalt, ...options } = await api.post<...>('/api/webauthn/auth-options');
```

Option B is simpler and doesn't change the server contract that the test already validates (test checks `body.hkdfSalt` on the flat response).

This gap blocks AUTH-03 (biometric unlock) and Success Criterion 3. All other auth requirements are satisfied at the code level.

---

*Verified: 2026-06-06*
*Verifier: Claude (gsd-verifier)*
