# Phase 2: Auth & WebAuthn - Research

**Researched:** 2026-06-06
**Domain:** WebAuthn / FIDO2 authentication with PRF extension, passphrase hashing, session management
**Confidence:** HIGH

## Summary

Phase 2 implements the full authentication stack for Dead Letter Diary: account creation with passphrase, WebAuthn passkey enrollment with PRF extension, biometric/passphrase/PIN unlock, and persistent sessions. The critical architectural concern is that WebAuthn PRF output will be used in Phase 3 as the device shard for key derivation -- so the auth layer must correctly capture and return PRF results to the client even though encryption is not implemented yet.

SimpleWebAuthn v13 is the standard library for WebAuthn on both server and browser. It handles the complex CBOR/attestation/assertion logic but intentionally does NOT abstract PRF -- the PRF extension must be manually added to options and manually extracted from responses. Argon2id is the standard for passphrase hashing (the `argon2` npm package with native bindings, or Node.js built-in crypto since v24.7). Sessions use signed httpOnly cookies with token hashes stored in the existing `sessions` table.

**Primary recommendation:** Use @simplewebauthn/server v13 + @simplewebauthn/browser v13 for WebAuthn, the `argon2` npm package for passphrase hashing, and @fastify/cookie + @fastify/jwt for session tokens stored as httpOnly secure cookies.

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|-----------------|
| AUTH-01 | Account creation with passphrase during first-run setup | Argon2id hashing via `argon2` npm; `users` table already has `passphrase_hash` and `hkdf_salt` columns |
| AUTH-02 | WebAuthn passkey registration with PRF extension | SimpleWebAuthn v13 `generateRegistrationOptions` + manual `prf: {}` extension; `webauthn_credentials` table ready |
| AUTH-03 | Biometric unlock (Face ID, Touch ID, Windows Hello) | SimpleWebAuthn `startAuthentication` with `userVerification: 'required'`; PRF eval with salt |
| AUTH-04 | Passphrase fallback when PRF unavailable | Separate `/api/auth/unlock-passphrase` endpoint; Argon2id verify then issue session |
| AUTH-05 | PIN for quick unlock (UI lockout layer, not key source) | Client-side only -- PIN stored in sessionStorage or memory; no server round-trip |
| AUTH-06 | Passphrase/PIN fallback always visible alongside biometric | UI layout concern -- both options rendered simultaneously, not hidden behind tabs |
| AUTH-07 | Server-side UV flag verification | `verifyAuthenticationResponse` returns `authenticationInfo.userVerified`; reject if false |
| AUTH-08 | Session persists across browser refresh | JWT in httpOnly secure cookie; `sessions` table for server-side revocation |
</phase_requirements>

## Standard Stack

### Core
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| @simplewebauthn/server | ^13.3.1 | WebAuthn registration/authentication verification | De facto standard; TypeScript-first; handles CBOR, attestation, assertion parsing |
| @simplewebauthn/browser | ^13.3.0 | WebAuthn browser ceremony orchestration | Companion to server; handles navigator.credentials calls with proper error handling |
| argon2 | ^0.41.x | Argon2id passphrase hashing (server-side) | OWASP recommended; prebuilt native binaries; fastest Node.js Argon2 implementation |
| @fastify/cookie | ^11.x | Cookie parsing/setting for Fastify | Official Fastify plugin; required for httpOnly session cookies |
| @fastify/jwt | ^9.x | JWT signing/verification | Official Fastify plugin; supports cookie-based token storage |

### Supporting
| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| @simplewebauthn/types | (bundled in v13) | TypeScript types for WebAuthn | Imported from @simplewebauthn/server in v13 |
| crypto (Node built-in) | - | Random bytes, timing-safe comparison | Challenge generation, token hashing, CRYPT-10 compliance |

### Alternatives Considered
| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| argon2 (native) | @node-rs/argon2 | Smaller install (476K vs 3.7M) but less battle-tested |
| argon2 (native) | hash-wasm | Pure WASM, no native deps, but slower and less suitable for server-side |
| @fastify/jwt | @fastify/secure-session | Stateless encrypted cookies; but we need server-side revocation via sessions table |
| SimpleWebAuthn | fido2-lib | Lower-level, more control, but significantly more code to write |

**Installation (API):**
```bash
npm install @simplewebauthn/server argon2 @fastify/cookie @fastify/jwt
```

**Installation (Web):**
```bash
npm install @simplewebauthn/browser
```

## Architecture Patterns

### Recommended Project Structure
```
apps/api/src/
  routes/
    auth.ts              # POST /api/auth/register, /api/auth/login
    webauthn.ts          # POST /api/webauthn/register-options, /register-verify, /auth-options, /auth-verify
  plugins/
    db.ts                # (exists) PostgreSQL pool
    auth.ts              # JWT/cookie session plugin, authenticate hook
  middleware/
    requireAuth.ts       # Fastify preHandler that verifies session
apps/web/app/
  setup/
    page.tsx             # First-run: create account + enroll passkey
  unlock/
    page.tsx             # Returning user: biometric + passphrase/PIN
  lib/
    webauthn.ts          # Browser-side WebAuthn helpers (startRegistration, startAuthentication with PRF)
```

### Pattern 1: WebAuthn Registration with PRF
**What:** Register a passkey AND signal PRF capability in one ceremony
**When to use:** Account creation (first-run setup)
**Example:**
```typescript
// SERVER: Generate registration options
import { generateRegistrationOptions } from '@simplewebauthn/server';
import { isoBase64URL } from '@simplewebauthn/server/helpers';

const options = await generateRegistrationOptions({
  rpName: 'Dead Letter Diary',
  rpID: process.env.WEBAUTHN_RP_ID || 'localhost',
  userName: userId,
  attestationType: 'none',
  authenticatorSelection: {
    residentKey: 'required',
    userVerification: 'required',
    authenticatorAttachment: 'platform', // biometric
  },
});

// PRF is added manually -- SimpleWebAuthn does not abstract it
// Store options.challenge in Redis/memory for verification
// Send options + empty prf signal to client

// CLIENT: Start registration with PRF
import { startRegistration } from '@simplewebauthn/browser';

const attResp = await startRegistration({
  optionsJSON: {
    ...options,
    extensions: { ...options.extensions, prf: {} },
  },
});

// Check if PRF is supported
const prfEnabled = attResp.clientExtensionResults?.prf?.enabled;
// Store prfEnabled flag -- determines if Phase 3 can use PRF for key derivation
```

### Pattern 2: WebAuthn Authentication with PRF Eval
**What:** Authenticate AND derive a PRF secret in one ceremony
**When to use:** Diary unlock with biometric
**Example:**
```typescript
// CLIENT: Authentication with PRF evaluation
import { startAuthentication } from '@simplewebauthn/browser';
import { base64URLStringToBuffer } from '@simplewebauthn/browser';

// prfSalt is a stable, per-user salt stored on the server (hkdf_salt from users table)
const prfSaltBytes = base64URLStringToBuffer(prfSaltBase64URL);

const authResp = await startAuthentication({
  optionsJSON: {
    ...options,
    extensions: {
      prf: {
        eval: {
          first: prfSaltBytes,
        },
      },
    },
  },
});

// Extract PRF result (32-byte secret)
const prfResult = authResp.clientExtensionResults?.prf?.results?.first;
// prfResult is ArrayBuffer -- this becomes the device shard input in Phase 3
// NEVER send prfResult to the server -- it stays client-side only
```

### Pattern 3: Session Token Flow
**What:** Issue JWT in httpOnly cookie after successful auth
**When to use:** After any successful authentication (passphrase or WebAuthn)
**Example:**
```typescript
// SERVER: Issue session after verification
import crypto from 'crypto';

const sessionToken = crypto.randomBytes(32).toString('hex');
const tokenHash = crypto.createHash('sha256').update(sessionToken).digest('hex');

// Store hash in sessions table (never store raw token)
await pg.query(
  'INSERT INTO sessions (user_id, token_hash, expires_at) VALUES ($1, $2, $3)',
  [userId, tokenHash, new Date(Date.now() + 7 * 24 * 60 * 60 * 1000)]
);

// Sign JWT containing session ID
const jwt = fastify.jwt.sign({ sub: userId, sid: sessionId }, { expiresIn: '7d' });

// Set as httpOnly secure cookie
reply.setCookie('session', jwt, {
  httpOnly: true,
  secure: true,
  sameSite: 'strict',
  path: '/',
  maxAge: 7 * 24 * 60 * 60, // 7 days
});
```

### Pattern 4: UV Flag Verification (AUTH-07)
**What:** Server rejects authentication assertions without biometric confirmation
**When to use:** Every WebAuthn authentication verification
**Example:**
```typescript
// SERVER: Verify authentication response with UV check
import { verifyAuthenticationResponse } from '@simplewebauthn/server';

const verification = await verifyAuthenticationResponse({
  response: authResp,
  expectedChallenge: storedChallenge,
  expectedOrigin: `https://${process.env.WEBAUTHN_RP_ID}`,
  expectedRPID: process.env.WEBAUTHN_RP_ID,
  credential: {
    id: storedCredential.id,
    publicKey: storedCredential.public_key,
    counter: Number(storedCredential.counter),
    transports: storedCredential.transports,
  },
});

// AUTH-07: Reject if user verification did not occur
if (!verification.authenticationInfo.userVerified) {
  throw new Error('Biometric confirmation required');
}

// Update counter to prevent replay
await pg.query(
  'UPDATE webauthn_credentials SET counter = $1 WHERE id = $2',
  [verification.authenticationInfo.newCounter, credentialId]
);
```

### Anti-Patterns to Avoid
- **Storing PRF output on the server:** PRF result is the device shard -- it MUST stay client-side. Sending it to the server defeats the split-key architecture.
- **Using userVerification: 'preferred':** Must be 'required' for AUTH-07. 'preferred' allows UV=false on some authenticators.
- **Storing raw session tokens in DB:** Always hash with SHA-256 before storage. Compare with `crypto.timingSafeEqual()` (CRYPT-10).
- **Using localStorage for session tokens:** XSS-vulnerable. Use httpOnly cookies exclusively.
- **Hardcoding RP ID:** Must come from WEBAUTHN_RP_ID env var. Changing RP ID after passkey enrollment breaks all passkeys permanently.

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| WebAuthn CBOR/attestation parsing | Custom CBOR decoder | @simplewebauthn/server | CBOR parsing has dozens of edge cases across authenticator types |
| Passphrase hashing | Custom bcrypt/scrypt wrapper | argon2 npm package | Argon2id is OWASP recommended; side-channel resistance matters |
| Challenge generation | Math.random() based | crypto.randomBytes(32) | WebAuthn challenges must be cryptographically random |
| Cookie signing/verification | Manual HMAC cookies | @fastify/jwt + @fastify/cookie | Timing attacks, algorithm confusion, key rotation |
| WebAuthn browser ceremony | Raw navigator.credentials calls | @simplewebauthn/browser | Error handling, AbortController, browser compat |

**Key insight:** WebAuthn has a massive surface area of authenticator behaviors, transport types, and attestation formats. SimpleWebAuthn abstracts all of this correctly. The only manual work is PRF extension handling, which SimpleWebAuthn intentionally does not simplify due to the security risks of tying encryption to passkeys.

## Common Pitfalls

### Pitfall 1: RP ID Mismatch
**What goes wrong:** Passkeys registered with one RP ID cannot authenticate with a different RP ID. This is permanent and irreversible.
**Why it happens:** RP ID is bound into the credential during registration. Changing WEBAUTHN_RP_ID after first enrollment = all passkeys break.
**How to avoid:** Read WEBAUTHN_RP_ID from env. Default to 'localhost'. Add a startup warning if the value changes from what's in the database. The .env.example already has the prominent warning (Phase 1 decision).
**Warning signs:** WebAuthn authentication fails with "credential not found" after an env change.

### Pitfall 2: PRF Not Supported on Platform
**What goes wrong:** User's browser/OS doesn't support PRF extension, so `prf.enabled` is false or `prf.results.first` is undefined.
**Why it happens:** Windows Hello does NOT support PRF. iOS < 18 does not support PRF. Some Android browsers lack support.
**How to avoid:** Always check `clientExtensionResults.prf?.enabled` after registration. If false, the user MUST use passphrase fallback for key derivation in Phase 3. Store a `prf_capable` flag per credential.
**Warning signs:** `prfResult` is undefined after authentication on Windows or older iOS.

### Pitfall 3: Challenge Replay
**What goes wrong:** Attacker captures a WebAuthn challenge and replays the response.
**Why it happens:** Challenge not invalidated after use, or stored too long.
**How to avoid:** Store challenges in Redis with short TTL (60 seconds). Delete immediately after verification. Never reuse.
**Warning signs:** Same challenge appearing in multiple verification requests.

### Pitfall 4: Counter Rollback
**What goes wrong:** Authenticator counter is not updated, allowing cloned credential replay.
**Why it happens:** Forgetting to UPDATE webauthn_credentials.counter after successful authentication.
**How to avoid:** Always update counter in the same transaction as session creation.
**Warning signs:** Counter value in DB is lower than counter in assertion.

### Pitfall 5: PIN Confused with Auth
**What goes wrong:** PIN is treated as a security credential instead of a UI convenience layer.
**Why it happens:** AUTH-05 explicitly says PIN is "UI lockout layer, not a key source."
**How to avoid:** PIN is client-side only. It gates access to the already-authenticated session. No server validation. No PIN hash in the database. Stored in sessionStorage (cleared on tab close) or in-memory.
**Warning signs:** PIN verification endpoint on the server, PIN hash in users table.

### Pitfall 6: Origin Mismatch in Verification
**What goes wrong:** `verifyRegistrationResponse` or `verifyAuthenticationResponse` fails with origin mismatch.
**Why it happens:** expectedOrigin must include the protocol and port. For local Caddy HTTPS, the origin is `https://localhost` (port 443 is implicit).
**How to avoid:** Construct origin from WEBAUTHN_RP_ID: `https://${WEBAUTHN_RP_ID}`. Do NOT include port 443.
**Warning signs:** "Unexpected origin" errors during WebAuthn verification.

## Code Examples

### Account Creation (AUTH-01)
```typescript
// POST /api/auth/register
import argon2 from 'argon2';
import crypto from 'crypto';

async function registerHandler(request, reply) {
  // Single-user app: check if any user exists
  const { rows } = await fastify.pg.query('SELECT COUNT(*) FROM users');
  if (parseInt(rows[0].count) > 0) {
    return reply.status(409).send({ error: 'Account already exists' });
  }

  const { passphrase } = request.body;

  // Hash passphrase with Argon2id (OWASP recommended params)
  const passphraseHash = await argon2.hash(passphrase, {
    type: argon2.argon2id,
    memoryCost: 65536,  // 64 MB
    timeCost: 3,
    parallelism: 4,
  });

  // Generate per-user HKDF salt (CRYPT-09)
  const hkdfSalt = crypto.randomBytes(32);

  const result = await fastify.pg.query(
    'INSERT INTO users (passphrase_hash, hkdf_salt) VALUES ($1, $2) RETURNING id',
    [passphraseHash, hkdfSalt]
  );

  const userId = result.rows[0].id;
  // Issue session (Pattern 3 above)
  // ...
}
```

### Passphrase Unlock (AUTH-04)
```typescript
// POST /api/auth/unlock
import argon2 from 'argon2';

async function unlockHandler(request, reply) {
  const { passphrase } = request.body;

  // Single-user: get the one user
  const { rows } = await fastify.pg.query(
    'SELECT id, passphrase_hash FROM users LIMIT 1'
  );
  if (rows.length === 0) {
    return reply.status(404).send({ error: 'No account found' });
  }

  const user = rows[0];
  const valid = await argon2.verify(user.passphrase_hash, passphrase);
  if (!valid) {
    return reply.status(401).send({ error: 'Invalid passphrase' });
  }

  // Issue session token (Pattern 3)
  // Return hkdf_salt for client-side key derivation in Phase 3
}
```

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| navigator.credentials.create() raw | SimpleWebAuthn v13 abstractions | 2024 | Handles all attestation formats, CBOR, error cases |
| bcrypt for passwords | Argon2id | OWASP 2023 recommendation | Memory-hard; resists GPU attacks |
| localStorage JWT | httpOnly cookie JWT | Industry standard | Prevents XSS token theft |
| hmac-secret extension | prf extension | WebAuthn L3 (2023+) | PRF is the standardized successor to hmac-secret |
| SimpleWebAuthn v10 types package | v13 bundled types | 2024 | @simplewebauthn/types deprecated; types bundled in main packages |

**Deprecated/outdated:**
- `@simplewebauthn/types` package: deprecated in v13, types bundled into server/browser packages
- `hmac-secret` extension: replaced by `prf` in WebAuthn Level 3; SimpleWebAuthn only supports `prf`
- `userVerification: 'preferred'`: not acceptable for this project; AUTH-07 requires 'required'

## PRF Platform Support (as of June 2026)

| Platform | Browser | Platform Auth PRF | YubiKey PRF |
|----------|---------|-------------------|-------------|
| macOS 15+ | Safari 18+ | YES (iCloud Keychain) | Chrome: YES, Safari: NO |
| iOS/iPadOS 18.4+ | Safari 18+ | YES (iCloud Keychain) | NO (Apple limitation) |
| Windows 11 | Chrome, Edge | NO (Windows Hello) | YES |
| Android | Chrome | YES (Google Password Manager) | USB: YES, NFC: NO |

**Critical implication:** Windows Hello does NOT support PRF. Users on Windows without a YubiKey MUST use passphrase fallback (AUTH-04) for key derivation. The passphrase fallback path is not optional -- it is required for platform coverage.

## Open Questions

1. **Challenge storage: Redis vs in-memory Map**
   - What we know: Challenges need short TTL (60s) and must be one-use
   - What's unclear: Redis is available in Docker Compose but adds a dependency for simple key-value; in-memory Map is simpler but doesn't survive API restart
   - Recommendation: Use Redis -- it's already in the stack and challenges must survive potential API hot-reload during development

2. **Session duration**
   - What we know: AUTH-08 requires persistence across browser refresh; sessions table has expires_at
   - What's unclear: Exact session lifetime not specified in requirements
   - Recommendation: 7-day sessions with sliding expiration. Cookie maxAge = 7 days. Background: this is a local-only app, so long sessions are acceptable.

3. **Argon2id memory cost for Docker**
   - What we know: OWASP recommends 64MB minimum; Docker containers may have memory limits
   - What's unclear: Whether the default Docker Compose config has memory constraints
   - Recommendation: Use 64MB (65536 KB) -- standard OWASP recommendation. No memory limits are set in the current docker-compose.yml.

## Validation Architecture

### Test Framework
| Property | Value |
|----------|-------|
| Framework | vitest (not yet installed) |
| Config file | none -- see Wave 0 |
| Quick run command | `npx vitest run --reporter=verbose` |
| Full suite command | `npx vitest run` |

### Phase Requirements to Test Map
| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| AUTH-01 | Passphrase account creation inserts user with argon2id hash | unit | `npx vitest run apps/api/src/routes/__tests__/auth.test.ts -t "register"` | No -- Wave 0 |
| AUTH-02 | WebAuthn registration options include correct RP ID and challenge | unit | `npx vitest run apps/api/src/routes/__tests__/webauthn.test.ts -t "register"` | No -- Wave 0 |
| AUTH-03 | WebAuthn authentication verifies assertion and issues session | unit | `npx vitest run apps/api/src/routes/__tests__/webauthn.test.ts -t "authenticate"` | No -- Wave 0 |
| AUTH-04 | Passphrase unlock verifies hash and issues session | unit | `npx vitest run apps/api/src/routes/__tests__/auth.test.ts -t "unlock"` | No -- Wave 0 |
| AUTH-05 | PIN is client-side only (no server endpoint) | manual-only | Verify no /api/auth/pin endpoint exists | N/A |
| AUTH-06 | Both unlock methods visible simultaneously | manual-only | Visual check of unlock page | N/A |
| AUTH-07 | Server rejects assertion with UV=false | unit | `npx vitest run apps/api/src/routes/__tests__/webauthn.test.ts -t "UV"` | No -- Wave 0 |
| AUTH-08 | Session cookie persists across requests | integration | `npx vitest run apps/api/src/routes/__tests__/session.test.ts` | No -- Wave 0 |

### Sampling Rate
- **Per task commit:** `npx vitest run --reporter=verbose`
- **Per wave merge:** `npx vitest run`
- **Phase gate:** Full suite green before `/gsd:verify-work`

### Wave 0 Gaps
- [ ] `vitest` -- install in API workspace: `npm install -D vitest @vitest/coverage-v8`
- [ ] `apps/api/vitest.config.ts` -- Vitest config for API
- [ ] `apps/api/src/routes/__tests__/auth.test.ts` -- covers AUTH-01, AUTH-04
- [ ] `apps/api/src/routes/__tests__/webauthn.test.ts` -- covers AUTH-02, AUTH-03, AUTH-07
- [ ] `apps/api/src/routes/__tests__/session.test.ts` -- covers AUTH-08
- [ ] `apps/api/src/test-helpers/` -- shared fixtures (mock pg pool, mock Fastify instance)

## Sources

### Primary (HIGH confidence)
- [@simplewebauthn/server npm](https://www.npmjs.com/package/@simplewebauthn/server) - v13.3.1 confirmed current
- [@simplewebauthn/browser npm](https://www.npmjs.com/package/@simplewebauthn/browser) - v13.3.0 confirmed current
- [SimpleWebAuthn PRF docs](https://simplewebauthn.dev/docs/advanced/prf) - PRF extension handling patterns
- [SimpleWebAuthn server docs](https://simplewebauthn.dev/docs/packages/server/) - Full API reference
- [Yubico PRF Developer Guide](https://developers.yubico.com/WebAuthn/Concepts/PRF_Extension/Developers_Guide_to_PRF.html) - PRF code examples, platform support matrix, HKDF derivation
- [web.dev userVerification deep dive](https://web.dev/articles/webauthn-user-verification) - UV flag verification best practices

### Secondary (MEDIUM confidence)
- [Corbado PRF blog](https://www.corbado.com/blog/passkeys-prf-webauthn) - Platform support matrix, iOS 18.4+ fixes
- [argon2 npm](https://www.npmjs.com/package/argon2) - Current version, native bindings, OWASP params
- [Fastify testing guide](https://fastify.dev/docs/v5.3.x/Guides/Testing/) - inject() method for route testing

### Tertiary (LOW confidence)
- Windows Hello PRF status: multiple sources agree it's unsupported, but no official Microsoft documentation found confirming or denying. Verified via Yubico and Corbado.

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH - SimpleWebAuthn v13 verified on npm, argon2 verified, Fastify plugins are official
- Architecture: HIGH - Patterns follow SimpleWebAuthn official docs and Yubico PRF guide
- Pitfalls: HIGH - RP ID permanence documented in project (Phase 1 decision), PRF gaps verified by multiple sources
- PRF platform support: MEDIUM - Multiple sources agree but landscape changing rapidly (iOS 18.4 fixes were recent)

**Research date:** 2026-06-06
**Valid until:** 2026-07-06 (30 days -- WebAuthn ecosystem is mature; PRF support may change faster on Apple platforms)
