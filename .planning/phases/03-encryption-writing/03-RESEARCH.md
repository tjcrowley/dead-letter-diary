# Phase 3: Encryption & Writing - Research

**Researched:** 2026-06-06
**Domain:** Web Crypto API (HKDF, AES-GCM, key wrapping), split-key architecture, IndexedDB auto-save, word counting
**Confidence:** HIGH

## Summary

Phase 3 implements the cryptographic core of Dead Letter Diary: a split-key architecture where a Diary Master Key (DMK) is generated at account creation, wrapped with a key derived from two shards (device + server), and used for AES-GCM 256 encryption of diary entries. The write surface provides a distraction-free editor with live word count and debounced auto-save to IndexedDB via Dexie.js.

The entire client-side crypto pipeline uses the Web Crypto API exclusively -- no third-party crypto libraries. The `SubtleCrypto` API provides `importKey` (raw HKDF material), `deriveKey` (HKDF to AES-GCM), `wrapKey`/`unwrapKey` (DMK protection), and `encrypt`/`decrypt` (entry encryption). The DMK is held as a non-extractable `CryptoKey` in memory during sessions (CRYPT-08). The word count uses `Intl.Segmenter` with `isWordLike` for CJK/Thai support (Baseline 2024, all major browsers).

A critical architectural decision: the passphrase fallback path for device shard derivation (CRYPT-03). The project constraint says "no third-party crypto libraries" for the browser encryption path, which rules out browser-side Argon2id WASM. Use PBKDF2 via Web Crypto API with 600,000 iterations (OWASP 2023 recommendation for PBKDF2-SHA256) for the passphrase-to-device-shard derivation on the client side. The server already uses Argon2id for passphrase hash verification (separate concern).

**Primary recommendation:** Implement the full crypto pipeline using only Web Crypto API (`SubtleCrypto`). Use PBKDF2 (not Argon2id) for client-side passphrase-to-shard derivation to honor the no-third-party-crypto constraint. Use Dexie.js v4 for IndexedDB with manual encryption (encrypt before storing, not dexie-encrypted plugin). Use `Intl.Segmenter` for word counting.

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|-----------------|
| CRYPT-01 | DMK generated at account creation (32 bytes random) | `crypto.getRandomValues(32)` -> `importKey("raw")` -> `generateKey("AES-GCM", 256)` with extractable=true for initial wrap |
| CRYPT-02 | DMK wrapped with AES-GCM using wrap_key from HKDF(device_shard XOR server_shard) | `importKey` XOR'd shards as HKDF -> `deriveKey` AES-GCM -> `wrapKey("raw", dmk, wrapKey)` |
| CRYPT-03 | Device shard from PRF output or PBKDF2 passphrase fallback | PRF result already captured in Phase 2 `authenticatePasskey()`; PBKDF2 via `SubtleCrypto.deriveBits` for passphrase path |
| CRYPT-04 | Server shard in PostgreSQL, returned only to authenticated good-standing sessions | New `/api/crypto/shard` endpoint behind `requireAuth`; `server_shards` table already exists |
| CRYPT-05 | Entries encrypted with AES-GCM 256 using DMK | `SubtleCrypto.encrypt({name: "AES-GCM", iv, additionalData}, dmk, plaintext)` |
| CRYPT-06 | Fresh random IV (12 bytes) per encryption | `crypto.getRandomValues(new Uint8Array(12))` per encrypt call |
| CRYPT-07 | Entry metadata bound as AES-GCM AAD | `additionalData` parameter in encrypt/decrypt; encode entry_id + user_id + word_count |
| CRYPT-08 | DMK as non-extractable CryptoKey in memory | `unwrapKey` with `extractable: false` on unlock; held in module-level variable, never serialized |
| CRYPT-09 | Per-user random HKDF salt (32 bytes) | Already generated at registration (`hkdf_salt` column in `users` table); returned during auth |
| CRYPT-10 | Timing-safe comparisons | `crypto.timingSafeEqual()` for all server-side shard/token comparisons |
| WRITE-01 | Distraction-free write surface | Single `<textarea>` with auto-focus, minimal chrome, dark theme consistent with existing UI |
| WRITE-02 | Live word count, green when minimum met | `Intl.Segmenter("en", {granularity: "word"})` with `isWordLike` filter; CSS color toggle |
| WRITE-03 | Auto-save to IndexedDB every 1-2s | Dexie.js v4 table for drafts; debounced save (1s) with encrypted content |
| WRITE-04 | Word count via Intl.Segmenter with isWordLike | Baseline 2024; supports CJK/Thai correctly; no polyfill needed |
| WRITE-05 | Server verifies word count from AAD | Server decodes AAD bytes to extract word_count, compares against minimum; rejects if below threshold |
</phase_requirements>

## Standard Stack

### Core
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| Web Crypto API (SubtleCrypto) | Browser built-in | HKDF, AES-GCM, key wrap/unwrap, PBKDF2 | Project constraint: no third-party crypto libs; available in all target browsers |
| Dexie.js | ^4.4.3 | IndexedDB wrapper for auto-save drafts and encrypted entries | Already chosen in PROJECT.md; best offline-first DX for PWA |
| Intl.Segmenter | Browser built-in | Word counting with CJK/Thai support | WRITE-04 requirement; Baseline 2024 (all major browsers) |

### Supporting
| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| crypto (Node built-in) | - | timingSafeEqual, randomBytes for server shard | Server-side shard generation and comparison (CRYPT-04, CRYPT-10) |

### Alternatives Considered
| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| PBKDF2 (Web Crypto) for passphrase shard | hash-wasm Argon2id | Stronger KDF, but violates no-third-party-crypto constraint; PBKDF2 with 600K iterations is acceptable for local-only app |
| dexie-encrypted plugin | Manual encrypt-then-store | Plugin uses tweetnacl (third-party crypto); manual approach keeps all crypto in Web Crypto API |
| Intl.Segmenter | regex split(/\s+/) | Regex undercounts CJK/Thai; Segmenter is the correct solution per WRITE-04 |

**Installation (Web):**
```bash
cd apps/web && npm install dexie
```

**No new API dependencies needed** -- all crypto is Web Crypto (built-in) and Node crypto (built-in).

## Architecture Patterns

### Recommended Project Structure
```
apps/api/src/
  routes/
    crypto.ts            # POST /api/crypto/shard (return server shard)
                         # POST /api/crypto/key-wrap (store wrapped DMK)
                         # POST /api/entries (receive + verify encrypted entry)
apps/web/
  lib/
    crypto.ts            # All Web Crypto operations: HKDF, wrapKey, unwrapKey, encrypt, decrypt
    word-count.ts        # Intl.Segmenter word counting
    db.ts                # Dexie database schema + auto-save logic
  app/
    write/
      page.tsx           # Distraction-free write surface
```

### Pattern 1: Split-Key DMK Generation and Wrapping (Account Creation)
**What:** Generate DMK, split into device + server shards, derive wrapping key, wrap DMK
**When to use:** During account setup (after account creation + WebAuthn enrollment)
**Example:**
```typescript
// Source: MDN Web Crypto API docs
// CLIENT-SIDE: Full key ceremony at account creation

// 1. Generate DMK (extractable=true for initial wrap only)
const dmk = await crypto.subtle.generateKey(
  { name: "AES-GCM", length: 256 },
  true,  // extractable -- required for wrapKey
  ["encrypt", "decrypt"]
);

// 2. Generate server shard (32 bytes random)
const serverShard = crypto.getRandomValues(new Uint8Array(32));

// 3. Derive device shard from PRF result or passphrase
// PRF path: prfResult is ArrayBuffer from authenticatePasskey()
const deviceShard = new Uint8Array(prfResult); // 32 bytes from PRF

// Passphrase path: PBKDF2 deriveBits
// const deviceShard = await deriveShardFromPassphrase(passphrase, hkdfSalt);

// 4. XOR shards to get combined material
const combined = new Uint8Array(32);
for (let i = 0; i < 32; i++) {
  combined[i] = deviceShard[i] ^ serverShard[i];
}

// 5. Import combined material as HKDF base key
const hkdfKey = await crypto.subtle.importKey(
  "raw",
  combined,
  "HKDF",
  false,  // HKDF keys must be non-extractable
  ["deriveKey"]
);

// 6. Derive wrapping key via HKDF
const wrapKey = await crypto.subtle.deriveKey(
  {
    name: "HKDF",
    hash: "SHA-256",
    salt: hkdfSalt,       // per-user salt from users.hkdf_salt
    info: new TextEncoder().encode("dead-letter-diary-dmk-wrap"),
  },
  hkdfKey,
  { name: "AES-GCM", length: 256 },
  false,  // wrapping key never needs export
  ["wrapKey", "unwrapKey"]
);

// 7. Wrap DMK with fresh IV
const wrapIv = crypto.getRandomValues(new Uint8Array(12));
const wrappedDmk = await crypto.subtle.wrapKey(
  "raw",
  dmk,
  wrapKey,
  { name: "AES-GCM", iv: wrapIv }
);

// 8. Send server shard + wrapped DMK + wrap IV to server
// Server stores shard in server_shards table
// Server stores wrappedDmk + wrapIv in key_wraps table
```

### Pattern 2: DMK Unwrapping (Session Unlock)
**What:** Reconstruct wrapping key from shards, unwrap DMK as non-extractable
**When to use:** Every unlock (biometric or passphrase)
**Example:**
```typescript
// Source: MDN SubtleCrypto.unwrapKey() docs

// 1. Get server shard (authenticated endpoint)
const { shard: serverShardB64 } = await api.get("/api/crypto/shard");
const serverShard = base64ToUint8Array(serverShardB64);

// 2. Get device shard (PRF result or passphrase derivation)
const deviceShard = new Uint8Array(prfResult); // from authenticatePasskey()

// 3. XOR + HKDF (same as creation)
const combined = xorShards(deviceShard, serverShard);
const hkdfKey = await crypto.subtle.importKey("raw", combined, "HKDF", false, ["deriveKey"]);
const wrapKey = await crypto.subtle.deriveKey(
  { name: "HKDF", hash: "SHA-256", salt: hkdfSalt, info: new TextEncoder().encode("dead-letter-diary-dmk-wrap") },
  hkdfKey,
  { name: "AES-GCM", length: 256 },
  false,
  ["wrapKey", "unwrapKey"]
);

// 4. Unwrap DMK as NON-EXTRACTABLE (CRYPT-08)
const dmk = await crypto.subtle.unwrapKey(
  "raw",
  wrappedDmk,           // ArrayBuffer from key_wraps.wrapped_dmk
  wrapKey,
  { name: "AES-GCM", iv: wrapIv },  // from key_wraps.wrap_iv
  { name: "AES-GCM", length: 256 },
  false,                 // NON-EXTRACTABLE -- cannot be exported or serialized
  ["encrypt", "decrypt"]
);

// 5. Store in module-level variable (never serializable)
// sessionDmk = dmk; // CryptoKey in memory only
```

### Pattern 3: Entry Encryption with AAD
**What:** Encrypt diary text with AES-GCM using DMK, binding metadata as AAD
**When to use:** Auto-save and final submission
**Example:**
```typescript
// Source: MDN SubtleCrypto.encrypt() AES-GCM docs

async function encryptEntry(
  dmk: CryptoKey,
  plaintext: string,
  entryId: string,
  userId: string,
  wordCount: number
): Promise<{ ciphertext: ArrayBuffer; iv: Uint8Array; aad: Uint8Array }> {
  // CRYPT-06: Fresh random IV per encryption
  const iv = crypto.getRandomValues(new Uint8Array(12));

  // CRYPT-07: Bind metadata as AAD (authenticated but not encrypted)
  const aad = new TextEncoder().encode(
    JSON.stringify({ entryId, userId, wordCount })
  );

  const ciphertext = await crypto.subtle.encrypt(
    { name: "AES-GCM", iv, additionalData: aad },
    dmk,
    new TextEncoder().encode(plaintext)
  );

  return { ciphertext, iv, aad };
}
```

### Pattern 4: Passphrase to Device Shard (PBKDF2 Fallback)
**What:** Derive 32-byte device shard from passphrase when PRF is unavailable
**When to use:** Passphrase unlock path (Windows Hello without YubiKey, older iOS)
**Example:**
```typescript
// Source: MDN SubtleCrypto.deriveBits() PBKDF2 docs

async function deriveShardFromPassphrase(
  passphrase: string,
  salt: Uint8Array
): Promise<Uint8Array> {
  const enc = new TextEncoder();
  const keyMaterial = await crypto.subtle.importKey(
    "raw",
    enc.encode(passphrase),
    "PBKDF2",
    false,
    ["deriveBits"]
  );

  const bits = await crypto.subtle.deriveBits(
    {
      name: "PBKDF2",
      salt,
      iterations: 600000,  // OWASP 2023 recommendation for PBKDF2-SHA256
      hash: "SHA-256",
    },
    keyMaterial,
    256  // 32 bytes
  );

  return new Uint8Array(bits);
}
```

### Pattern 5: Word Count with Intl.Segmenter
**What:** Count words supporting all scripts including CJK and Thai
**When to use:** Live word count display and server-side verification
**Example:**
```typescript
// Source: MDN Intl.Segmenter docs

function countWords(text: string): number {
  if (!text.trim()) return 0;
  const segmenter = new Intl.Segmenter("en", { granularity: "word" });
  let count = 0;
  for (const { isWordLike } of segmenter.segment(text)) {
    if (isWordLike) count++;
  }
  return count;
}
```

### Pattern 6: Dexie Auto-Save with Debounce
**What:** Save encrypted draft to IndexedDB with debounced writes
**When to use:** Every keystroke triggers debounced save
**Example:**
```typescript
// Source: Dexie.js v4 docs

import Dexie, { type EntityTable } from "dexie";

interface DraftEntry {
  id: string;          // entry UUID
  ciphertext: ArrayBuffer;
  iv: Uint8Array;
  aad: Uint8Array;
  wordCount: number;
  updatedAt: number;   // timestamp
}

const db = new Dexie("DeadLetterDiary") as Dexie & {
  drafts: EntityTable<DraftEntry, "id">;
};

db.version(1).stores({
  drafts: "id, updatedAt",  // indexed fields
});

// Debounced auto-save (1 second)
let saveTimeout: ReturnType<typeof setTimeout> | null = null;

function scheduleSave(draft: DraftEntry): void {
  if (saveTimeout) clearTimeout(saveTimeout);
  saveTimeout = setTimeout(async () => {
    await db.drafts.put(draft);
  }, 1000);
}
```

### Anti-Patterns to Avoid
- **Storing DMK in localStorage/sessionStorage/IndexedDB:** DMK must ONLY exist as an in-memory non-extractable CryptoKey. Serializing it defeats CRYPT-08.
- **Reusing IVs with AES-GCM:** Each encrypt call MUST generate a fresh 12-byte IV. IV reuse with the same key is catastrophic -- enables key recovery.
- **Using dexie-encrypted plugin:** It uses tweetnacl.js (third-party crypto). Encrypt manually with Web Crypto before storing in Dexie.
- **Sending plaintext word count without AAD binding:** The word count in the AAD is cryptographically bound to the ciphertext. If the client sends a separate word count, it can be faked.
- **Making the wrapping key extractable:** The wrapping key derived from HKDF should be non-extractable with usages `["wrapKey", "unwrapKey"]` only.
- **XOR-ing shards of different lengths:** Both device shard (PRF=32 bytes, PBKDF2=32 bytes) and server shard (32 bytes) MUST be the same length.

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Key derivation | Custom hash chaining | Web Crypto HKDF | HKDF is standardized, timing-safe, hardware-accelerated in browsers |
| Symmetric encryption | Custom XOR/stream cipher | Web Crypto AES-GCM | AES-GCM provides authenticated encryption; custom ciphers are always broken |
| IV generation | Math.random() | crypto.getRandomValues() | CSPRNG required; Math.random() is predictable |
| Word splitting | regex split(/\s+/) | Intl.Segmenter | Regex fails for CJK, Thai, and other non-whitespace-delimited scripts |
| IndexedDB wrapper | Raw IDB API | Dexie.js | Raw IDB API is callback-based, error-prone, verbose |
| Debounce | Custom timer logic | Simple setTimeout wrapper | Only need basic debounce; no lodash needed for this |

**Key insight:** The Web Crypto API is the correct (and required) abstraction for all crypto operations. It provides hardware-accelerated, timing-safe implementations. The only complexity is understanding the correct parameter shapes for each operation.

## Common Pitfalls

### Pitfall 1: HKDF importKey Requires Non-Extractable
**What goes wrong:** `importKey("raw", material, "HKDF", true, ...)` throws `InvalidAccessError`.
**Why it happens:** Web Crypto spec requires HKDF base keys to be non-extractable.
**How to avoid:** Always set `extractable: false` when importing raw key material as HKDF.
**Warning signs:** `DOMException: The key is not extractable` on importKey.

### Pitfall 2: wrapKey Requires Extractable Source Key
**What goes wrong:** `wrapKey("raw", nonExtractableKey, ...)` throws `InvalidAccessError`.
**Why it happens:** `wrapKey` internally calls `exportKey` then `encrypt`. The source key must be extractable.
**How to avoid:** Generate DMK with `extractable: true` during creation (for wrapping), then on unlock use `unwrapKey` with `extractable: false` so the DMK in session is non-extractable.
**Warning signs:** DMK generation succeeds but wrapKey fails.

### Pitfall 3: AES-GCM IV Reuse
**What goes wrong:** Reusing an IV with the same key enables key recovery attacks. AES-GCM is completely broken under IV reuse.
**Why it happens:** Forgetting to generate a fresh IV per encrypt call, or using a counter that wraps.
**How to avoid:** Generate `crypto.getRandomValues(new Uint8Array(12))` at every encrypt call. Store the IV alongside ciphertext. Never derive IVs from deterministic data.
**Warning signs:** The same IV appearing in multiple entries in IndexedDB or the entries table.

### Pitfall 4: PRF Result Size Assumptions
**What goes wrong:** PRF result may not be exactly 32 bytes on all platforms.
**Why it happens:** PRF output is HMAC-SHA-256 (32 bytes) per the spec, but implementations may vary.
**How to avoid:** Verify `prfResult.byteLength === 32` and reject/handle if not. Use the PRF result as HKDF input (not directly as a key), which handles variable-length inputs gracefully.
**Warning signs:** XOR fails with "different length" or HKDF produces unexpected results.

### Pitfall 5: TextEncoder UTF-8 vs Binary Data
**What goes wrong:** Using TextEncoder/TextDecoder on binary ciphertext corrupts data.
**Why it happens:** Ciphertext is arbitrary bytes, not valid UTF-8.
**How to avoid:** Always use `ArrayBuffer`/`Uint8Array` for ciphertext. Only use TextEncoder for plaintext and AAD strings. For network transport, use base64 encoding.
**Warning signs:** Decrypted text is garbled or decrypt throws "OperationError".

### Pitfall 6: AAD Must Match Exactly on Decrypt
**What goes wrong:** Decryption fails with "OperationError" even though key and IV are correct.
**Why it happens:** The AAD passed to decrypt must be byte-identical to the AAD used during encrypt. Any difference (even whitespace in JSON serialization) causes authentication failure.
**How to avoid:** Use a deterministic AAD encoding. Recommend JSON.stringify with sorted keys, or a binary format. Store the AAD alongside the ciphertext.
**Warning signs:** Decrypt fails after a code change that modifies AAD format.

### Pitfall 7: Dexie Version Upgrade Woes
**What goes wrong:** Schema changes in Dexie trigger version upgrade, which can fail if tables have data.
**Why it happens:** Dexie requires incrementing version number for schema changes.
**How to avoid:** Start with a well-planned schema in version 1. If changes are needed, use proper Dexie migration callbacks.
**Warning signs:** "VersionError" or "AbortError" on app load after schema change.

### Pitfall 8: Auto-Save Race Condition
**What goes wrong:** User saves, navigates away, and the debounced write fires after navigation unmounts the component.
**Why it happens:** setTimeout fires after component unmount, Dexie write may use stale state.
**How to avoid:** Flush the debounced save immediately on `beforeunload` and on component unmount. Use a ref to track the latest content.
**Warning signs:** Lost last few seconds of writing, or errors in console after navigation.

## Code Examples

### Server Shard Endpoint (CRYPT-04)
```typescript
// Source: Existing codebase patterns from auth.ts + requireAuth.ts

// POST /api/crypto/shard — return server shard for authenticated user
fastify.get(
  "/api/crypto/shard",
  { preHandler: [requireAuth] },
  async (request, reply) => {
    const { rows } = await fastify.pg.query(
      "SELECT shard FROM server_shards WHERE user_id = $1",
      [request.userId]
    );

    if (rows.length === 0) {
      return reply.status(404).send({ error: "No shard found" });
    }

    // TODO Phase 5+: check deadline_state.state === 'active' (good standing)
    return reply.send({
      shard: Buffer.from(rows[0].shard).toString("base64url"),
    });
  }
);
```

### Server-Side Word Count Verification (WRITE-05)
```typescript
// POST /api/entries — receive encrypted entry with AAD verification
// The word count in AAD is trusted because it's cryptographically bound
// Server cannot decrypt (no DMK) but CAN parse AAD to verify word count

async function verifyWordCount(aad: Buffer, minimumWords: number): boolean {
  const metadata = JSON.parse(aad.toString("utf-8"));
  return metadata.wordCount >= minimumWords;
}
```

### XOR Helper
```typescript
function xorShards(a: Uint8Array, b: Uint8Array): Uint8Array {
  if (a.length !== b.length) throw new Error("Shards must be same length");
  const result = new Uint8Array(a.length);
  for (let i = 0; i < a.length; i++) {
    result[i] = a[i] ^ b[i];
  }
  return result;
}
```

### Base64url Helpers
```typescript
function uint8ToBase64url(bytes: Uint8Array): string {
  const binString = Array.from(bytes, (b) => String.fromCodePoint(b)).join("");
  return btoa(binString).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function base64urlToUint8(b64: string): Uint8Array {
  const padded = b64.replace(/-/g, "+").replace(/_/g, "/");
  const binString = atob(padded);
  return Uint8Array.from(binString, (c) => c.codePointAt(0)!);
}
```

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| PBKDF2 only for KDF | HKDF for key derivation from high-entropy input | Always (RFC 5869) | HKDF is correct for deriving keys from shared secrets; PBKDF2 is for low-entropy passwords |
| Encrypt-then-MAC (separate MAC) | AES-GCM (authenticated encryption) | Widespread by 2015 | Single operation provides confidentiality + integrity + authenticity |
| Custom word splitting | Intl.Segmenter | Baseline 2024 | Correct multilingual word counting without language-specific regex |
| Raw IDB API | Dexie.js v4 | Dexie 4.x (2024) | Promise-based, typed, handles upgrade transactions correctly |
| localStorage for offline data | IndexedDB via Dexie | Always for structured data | localStorage has 5-10MB limit; IndexedDB handles binary blobs efficiently |

**Deprecated/outdated:**
- `window.crypto.subtle` is NOT available in insecure contexts (HTTP). Caddy HTTPS is required (already handled by INST-10).
- `webkitSubtle` prefix: dead since 2015. No prefix needed in any current browser.

## Open Questions

1. **When exactly does the key ceremony run?**
   - What we know: DMK must be generated at account creation (CRYPT-01). The setup page currently goes: create account -> enroll passkey -> continue.
   - What's unclear: Does the key ceremony happen after passkey enrollment (so PRF result is available), or as a separate step?
   - Recommendation: Run key ceremony immediately after passkey enrollment succeeds. The PRF result from the registration ceremony can signal support, but a full PRF eval (authentication ceremony) is needed for the actual device shard. Consider running a "silent" auth ceremony after enrollment to get the PRF result for initial key generation.

2. **Server shard at-rest encryption**
   - What we know: `SHARD_ENCRYPTION_KEY` is already generated by the secrets boot process. The `server_shards` table stores raw BYTEA.
   - What's unclear: Should the server shard be encrypted at rest with the SHARD_ENCRYPTION_KEY, or stored as raw bytes?
   - Recommendation: Encrypt at rest using Node crypto AES-256-GCM with SHARD_ENCRYPTION_KEY. This adds defense-in-depth: if the database is compromised, shards are still encrypted. Decrypt only when returning to authenticated user.

3. **Multiple key_wraps per user**
   - What we know: `key_wraps` table supports multiple entries per user (id + user_id + credential_id). `wrap_type` can be 'webauthn_prf' or 'passphrase'.
   - What's unclear: In v1 (single device), should there be one key_wrap per auth method, or just one?
   - Recommendation: Create one key_wrap per auth method that can produce a device shard (one for PRF, one for passphrase). This way the user can unlock via either method without re-enrolling.

4. **Passphrase shard derivation salt**
   - What we know: `users.hkdf_salt` exists and is used as PRF eval salt. PBKDF2 also needs a salt.
   - What's unclear: Should the same salt be used for both PRF eval and PBKDF2 passphrase derivation?
   - Recommendation: Use separate derivation contexts. The `hkdf_salt` is fine for both, but use different `info` strings in the HKDF step (e.g., "dead-letter-diary-dmk-wrap-prf" vs "dead-letter-diary-dmk-wrap-passphrase"). For PBKDF2, use the `hkdf_salt` directly as PBKDF2 salt -- it's per-user and random.

## Validation Architecture

### Test Framework
| Property | Value |
|----------|-------|
| Framework | vitest 4.1.8 (already installed in API) |
| Config file | `apps/api/vitest.config.ts` (exists) |
| Quick run command | `cd apps/api && npx vitest run --reporter=verbose` |
| Full suite command | `cd apps/api && npx vitest run` |

### Phase Requirements -> Test Map
| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| CRYPT-01 | DMK generation produces 256-bit AES-GCM key | unit | `cd apps/web && npx vitest run lib/__tests__/crypto.test.ts -t "DMK generation"` | No -- Wave 0 |
| CRYPT-02 | DMK wrap/unwrap round-trips correctly | unit | `cd apps/web && npx vitest run lib/__tests__/crypto.test.ts -t "wrap"` | No -- Wave 0 |
| CRYPT-03 | PBKDF2 passphrase derivation produces 32-byte shard | unit | `cd apps/web && npx vitest run lib/__tests__/crypto.test.ts -t "passphrase"` | No -- Wave 0 |
| CRYPT-04 | Server shard endpoint requires auth, returns shard | unit | `cd apps/api && npx vitest run src/routes/__tests__/crypto.test.ts -t "shard"` | No -- Wave 0 |
| CRYPT-05 | Entry encrypt/decrypt round-trips correctly | unit | `cd apps/web && npx vitest run lib/__tests__/crypto.test.ts -t "encrypt"` | No -- Wave 0 |
| CRYPT-06 | Each encryption uses unique IV | unit | `cd apps/web && npx vitest run lib/__tests__/crypto.test.ts -t "IV"` | No -- Wave 0 |
| CRYPT-07 | Mismatched AAD causes decrypt failure | unit | `cd apps/web && npx vitest run lib/__tests__/crypto.test.ts -t "AAD"` | No -- Wave 0 |
| CRYPT-08 | Unwrapped DMK is non-extractable | unit | `cd apps/web && npx vitest run lib/__tests__/crypto.test.ts -t "non-extractable"` | No -- Wave 0 |
| CRYPT-09 | HKDF salt is 32 bytes from users table | unit | covered by existing auth.test.ts register test | Yes (partial) |
| CRYPT-10 | Server uses timingSafeEqual for shard comparison | unit | `cd apps/api && npx vitest run src/routes/__tests__/crypto.test.ts -t "timing"` | No -- Wave 0 |
| WRITE-01 | Write surface renders with auto-focus | manual-only | Visual check of /write page | N/A |
| WRITE-02 | Word count turns green at minimum | manual-only | Visual check with word input | N/A |
| WRITE-03 | Auto-save writes to IndexedDB within 2s | integration | `cd apps/web && npx vitest run lib/__tests__/db.test.ts -t "auto-save"` | No -- Wave 0 |
| WRITE-04 | Word count handles CJK correctly | unit | `cd apps/web && npx vitest run lib/__tests__/word-count.test.ts` | No -- Wave 0 |
| WRITE-05 | Server rejects entry with word count below minimum | unit | `cd apps/api && npx vitest run src/routes/__tests__/entries.test.ts -t "word count"` | No -- Wave 0 |

### Sampling Rate
- **Per task commit:** `cd apps/api && npx vitest run --reporter=verbose && cd ../web && npx vitest run --reporter=verbose`
- **Per wave merge:** Full suite across both workspaces
- **Phase gate:** Full suite green before `/gsd:verify-work`

### Wave 0 Gaps
- [ ] `apps/web/vitest.config.ts` -- Vitest config for web workspace (needs `environment: "jsdom"` or `"happy-dom"` for Web Crypto)
- [ ] `vitest` + `happy-dom` -- install in web workspace: `cd apps/web && npm install -D vitest happy-dom`
- [ ] `apps/web/lib/__tests__/crypto.test.ts` -- covers CRYPT-01 through CRYPT-08
- [ ] `apps/web/lib/__tests__/word-count.test.ts` -- covers WRITE-04
- [ ] `apps/web/lib/__tests__/db.test.ts` -- covers WRITE-03 (may need fake-indexeddb)
- [ ] `apps/api/src/routes/__tests__/crypto.test.ts` -- covers CRYPT-04, CRYPT-10
- [ ] `apps/api/src/routes/__tests__/entries.test.ts` -- covers WRITE-05
- [ ] Note: `happy-dom` includes Web Crypto API support; `jsdom` does NOT support SubtleCrypto

## Sources

### Primary (HIGH confidence)
- [MDN SubtleCrypto.deriveKey()](https://developer.mozilla.org/en-US/docs/Web/API/SubtleCrypto/deriveKey) - HKDF + AES-GCM derivation patterns, parameter shapes
- [MDN SubtleCrypto.wrapKey()](https://developer.mozilla.org/en-US/docs/Web/API/SubtleCrypto/wrapKey) - Key wrapping with AES-GCM, extractable requirement
- [MDN SubtleCrypto.unwrapKey()](https://developer.mozilla.org/en-US/docs/Web/API/SubtleCrypto/unwrapKey) - Unwrapping with extractable=false for non-extractable keys
- [MDN Intl.Segmenter](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Intl/Segmenter) - Word segmentation API, isWordLike, Baseline 2024
- [Node.js Web Crypto API docs](https://nodejs.org/api/webcrypto.html) - Server-side Web Crypto reference

### Secondary (MEDIUM confidence)
- [Dexie.js official site](https://dexie.org/) - v4.4.3 confirmed current; API reference
- [Phase 2 Research](../02-auth-webauthn/02-RESEARCH.md) - PRF extension patterns, platform support, existing codebase context
- [OWASP Password Storage Cheat Sheet](https://cheatsheetseries.owasp.org/cheatsheets/Password_Storage_Cheat_Sheet.html) - PBKDF2 600,000 iterations recommendation

### Tertiary (LOW confidence)
- Browser-side Argon2id alternatives: hash-wasm, argon2-browser, argon2id npm. Rejected due to no-third-party-crypto constraint, but documented for future reference if constraint is relaxed.

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH - All APIs are browser built-ins (Web Crypto, Intl.Segmenter) or locked project decisions (Dexie.js)
- Architecture: HIGH - Split-key pattern is well-defined in project requirements; Web Crypto API is well-documented
- Pitfalls: HIGH - Key extractability rules, IV reuse, AAD matching are well-documented Web Crypto constraints
- Passphrase KDF choice: MEDIUM - PBKDF2 is weaker than Argon2id but necessary to honor no-third-party-crypto constraint; acceptable for local-only app

**Research date:** 2026-06-06
**Valid until:** 2026-07-06 (30 days -- Web Crypto API is stable; Dexie v4 is stable)
