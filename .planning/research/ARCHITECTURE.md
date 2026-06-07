# Architecture Research: Dead Letter Diary

**Domain:** Encrypted PWA diary with cryptographic dead man's switch
**Researched:** 2026-06-06
**Confidence:** HIGH on WebAuthn PRF / Web Crypto / data model; MEDIUM on iOS push reliability; LOW on long-term cross-platform PRF coverage (still maturing in 2026).

---

## Component Map

```
┌─────────────────────────────────────────────────────────────────┐
│                          BROWSER (PWA)                          │
│                                                                 │
│  ┌──────────────┐    ┌──────────────┐    ┌──────────────────┐   │
│  │ React UI     │◄──►│ Crypto Core  │◄──►│ Dexie (IndexedDB)│   │
│  │ (Next.js 15) │    │ (Web Crypto) │    │  - entries       │   │
│  │  - Editor    │    │  - HKDF      │    │  - meta          │   │
│  │  - Settings  │    │  - AES-GCM   │    │  - sync_queue    │   │
│  │  - Status    │    │  - PRF eval  │    │  - key_wraps     │   │
│  └──────┬───────┘    └──────┬───────┘    └────────┬─────────┘   │
│         │                   │                    │             │
│         └───────────┬───────┴────────────────────┘             │
│                     │                                          │
│             ┌───────▼────────┐                                 │
│             │ Service Worker │  (push, background sync, cache) │
│             └───────┬────────┘                                 │
└─────────────────────┼──────────────────────────────────────────┘
                      │ HTTPS (mTLS optional)
              ┌───────▼────────┐
              │  Fastify API   │
              │  - /session    │
              │  - /shard      │   ← deadline-gated
              │  - /checkin    │
              │  - /sync       │   ← ciphertext only
              │  - /push       │
              └───────┬────────┘
                      │
              ┌───────▼────────┐     ┌──────────────────┐
              │  PostgreSQL    │     │  Job Scheduler   │
              │  - users       │◄────┤  (pg-boss /      │
              │  - shards      │     │   BullMQ)        │
              │  - deadlines   │     │  - tick deadline │
              │  - entries     │     │  - send warning  │
              │    (cipher)    │     │  - run wipe      │
              │  - audit       │     └──────────────────┘
              └────────────────┘
```

**Trust boundaries:**
- Server NEVER sees: plaintext entries, device shard, derived encryption key.
- Server holds: server shard (in PostgreSQL, deletion-on-deadline), encrypted entry blobs, deadline state, user account, push subscription.
- Client holds: device shard (wrapped by WebAuthn PRF), IndexedDB ciphertext mirror, plaintext entries only in memory during a session.

---

## Key Derivation Flow (WebAuthn → symmetric shard)

**Decision: Use the WebAuthn PRF extension (`hmac-secret` on CTAP2 authenticators).**

WebAuthn itself returns a credential ID and a public key — neither is symmetric key material. The correct (and now broadly supported) pattern is the **PRF extension**, which lets the authenticator evaluate HMAC-SHA-256(secret_bound_to_credential, salt) and return a 32-byte result the server never sees.

### Enrollment flow (first device)

```
1. navigator.credentials.create({
     publicKey: { …, extensions: { prf: { eval: { first: SALT } } } }
   })
2. If clientExtensionResults.prf.enabled !== true → fall back to passphrase path.
3. Generate a *Diary Master Key* (DMK): crypto.getRandomValues(32 bytes).
   - The DMK is the long-lived secret that actually encrypts entries.
   - It exists so we can rotate WebAuthn credentials without re-encrypting the diary.
4. On a SECOND authentication ceremony (PRF result is only returned in get(),
   not create(), in most platforms), obtain prf_output_device.
5. Compute device_shard = HKDF-SHA256(prf_output_device, salt=server_salt,
                                      info="dld-device-shard-v1", L=32).
6. Fetch server_shard (32 bytes random, persisted server-side).
7. Compute wrap_key = HKDF(device_shard XOR server_shard,
                           info="dld-wrap-v1", L=32).
8. Wrap DMK with AES-GCM(wrap_key) → store wrapped_dmk in IndexedDB
   AND in Postgres (server holds only the ciphertext + IV + AAD).
```

**Why a separate DMK rather than using XOR(shard) directly as the AES key:**
- Lets you add/remove authenticators without re-encrypting entries.
- Lets the server rotate its shard (wrap is re-derived; DMK ciphertext is rewrapped).
- Matches the Bitwarden/1Password PRF pattern (verified industry practice).

### Unlock flow (every session)

```
1. POST /session/challenge → server returns challenge + server_salt.
2. navigator.credentials.get({ publicKey: { …, extensions: { prf: { eval: { first: SALT } } } } })
3. POST assertion to /session/verify → server validates signature, opens session.
4. If session is "in good standing" (deadline not breached), server returns
   server_shard + wrapped_dmk.
5. Client recomputes wrap_key, AES-GCM-unwraps DMK in memory.
6. DMK lives only in a non-extractable CryptoKey for the session.
```

**Why server-side gating works:** the server shard is the choke point. No matter what the client does, without it the wrap_key cannot be derived, so the wrapped_dmk in IndexedDB is useless. When the deadline passes, the server deletes its shard and the client-side ciphertext becomes mathematically inert.

### Fallbacks (when PRF is unavailable)

PRF is solid in 2026 on Chrome/Edge desktop, Safari 18+/iOS 18.4+, Firefox 139+, Windows Hello (Firefox 148+/Chrome 147+) — but coverage is not 100%. Fallback ladder:
1. **PRF** (preferred, HIGH confidence on supported platforms).
2. **Passphrase + Argon2id** (libsodium-js Argon2id → device_shard). Required for unsupported browsers.
3. **PIN** is *not* a key source — it's UI lockout only, layered atop PRF/passphrase.

---

## Multi-Device Key Sync

Adding device B without ever exposing plaintext DMK requires a **wrap-per-device** model.

### Data model addition

```sql
CREATE TABLE key_wraps (
  user_id        UUID NOT NULL,
  credential_id  BYTEA PRIMARY KEY,         -- WebAuthn credential ID
  wrapped_dmk    BYTEA NOT NULL,            -- AES-GCM(wrap_key_per_device, DMK)
  iv             BYTEA NOT NULL,
  created_at     TIMESTAMPTZ NOT NULL,
  device_label   TEXT
);
```

Each authenticator gets its own (server_shard, device_shard) pair? **No** — simpler:
- One **server_shard per user** (rotated as a whole).
- One **prf_output per credential** → one **wrap_key per credential** → one **wrapped_dmk row per credential**.

### Add-device flow (out-of-band confirmation)

```
On Device A (already unlocked, DMK in memory):
  1. User → "Add device" → server creates pairing_token (one-time, 10 min TTL).
  2. Server displays QR / 6-digit code.

On Device B (new):
  3. User scans QR / enters code → POST /pair with pairing_token.
  4. Server marks pairing_token "awaiting credential".
  5. navigator.credentials.create() on Device B → new credential registered.
  6. Device B does navigator.credentials.get() with PRF → prf_output_B.
  7. Device B computes its candidate wrap_key_B = HKDF(device_shard_B XOR server_shard).
  8. Device B POSTs wrap_key_B (NOT the DMK!) to /pair/handshake.
     - Sent over TLS; server holds it transiently; never logged.

On Device A (still online):
  9. Server pushes "Device B wants to join" to Device A via SSE/WebSocket.
 10. User confirms on Device A (biometric re-prompt).
 11. Device A AES-GCM-encrypts DMK with wrap_key_B → wrapped_dmk_B.
 12. Device A POSTs wrapped_dmk_B to /pair/complete.
 13. Server stores wrapped_dmk_B in key_wraps, drops the cached wrap_key_B.
```

**Why the server can hold wrap_key_B transiently without breaking the model:**
- The server already holds the server_shard. wrap_key_B alone is useless — it can only decrypt a wrapped_dmk that doesn't exist yet (Device A creates it). And we drop it immediately after Device A delivers wrapped_dmk_B.
- The alternative (E2E pairing channel between A and B) is more secure but much more complex for v1. Document the tradeoff; revisit if threat model tightens.

### Remove-device

Delete the row in `key_wraps`. The credential's PRF output can no longer derive a wrap_key that decrypts any DMK ciphertext. **Note:** this does NOT rotate the DMK, so a compromised device that stole the DMK before removal is still compromised. For full forward security, offer "rotate diary key" — which re-encrypts every entry with a new DMK (expensive; opt-in).

---

## Offline Sync & Conflict Resolution

**Decision: Per-entry last-write-wins by client timestamp, with append-only audit. No CRDT.**

### Why not CRDTs

- Single-user, single-active-device at-a-time is the dominant pattern for a diary. The 2026 consensus (PowerSync, TanStack DB blog) is "start with LWW; add CRDTs when you observe real data loss in production."
- CRDT metadata grows monotonically per entry — bad for a long-running encrypted store where you can't garbage-collect tombstones without seeing plaintext.
- Yjs/Automerge inside a ciphertext blob defeats the point: you'd have to decrypt to merge.

### Sync queue model

```typescript
// IndexedDB (Dexie) schema
entries:       id, created_at, updated_at, ciphertext, iv, aad, word_count
sync_queue:    op_id, op_type, entry_id, payload, created_at, attempt_count
meta:          singleton row — last_sync_at, dmk_wrap_version, server_clock_skew
```

**Op types:** `create`, `update`, `delete`, `checkin`, `grace_invoke`.

### Conflict resolution

Each entry has:
- `client_id` (UUIDv7 — client-generated, monotonically increasing)
- `updated_at` (client wall-clock, corrected by server_clock_skew)
- `revision` (server-assigned integer, incremented on every accepted update)

On sync:
```
client → POST /sync { ops: [...], last_known_revision }
server:
  for each op:
    if op.entry.revision < server.entry.revision:
      → conflict; LWW by updated_at; loser stored in conflict_log (ciphertext)
    else:
      → accept, increment revision
  return { accepted, conflicts, server_now }
client: replays conflicts into a "Conflicts" UI section (rare in practice).
```

**Server stores ciphertext only.** Conflict resolution is metadata-driven; no plaintext comparison.

### Word-count verification under E2E encryption

The server needs to verify the daily word count without seeing plaintext. Approach:
- Client computes word_count locally.
- Client commits to it as **AAD (Additional Authenticated Data)** in the AES-GCM envelope: `aad = JSON({ entry_id, created_at, word_count })`.
- Server stores word_count from AAD as a separate column.
- Tampering: if client lies about word_count, the AAD is bound to the ciphertext — but the server cannot verify the *true* word count. **This is a fundamental E2E limitation; document it.** Mitigation: rate-limit suspicious patterns (entries with word_count=50 every day arriving exactly at deadline minus 5 min trigger a soft flag for the user's own awareness).

---

## Deadline Enforcement Data Model

The server is the source of truth. Client display is advisory.

```sql
CREATE TABLE users (
  id                UUID PRIMARY KEY,
  created_at        TIMESTAMPTZ NOT NULL,
  status            TEXT NOT NULL CHECK (status IN ('active','wiped','disabled')),
  server_shard      BYTEA,                    -- NULLABLE: NULL means wiped
  shard_rotated_at  TIMESTAMPTZ
);

CREATE TABLE diary_settings (
  user_id              UUID PRIMARY KEY REFERENCES users(id),
  word_minimum         INT NOT NULL DEFAULT 50,
  checkin_window_secs  INT NOT NULL DEFAULT 86400,
  warning_offsets_secs INT[] NOT NULL DEFAULT '{86400,14400,3600,900}',
  grace_days_per_week  INT NOT NULL DEFAULT 1,
  timezone             TEXT NOT NULL
);

CREATE TABLE deadline_state (
  user_id              UUID PRIMARY KEY REFERENCES users(id),
  current_deadline_at  TIMESTAMPTZ NOT NULL,    -- next moment of death
  last_checkin_at      TIMESTAMPTZ,
  last_checkin_words   INT,
  grace_used_in_week   INT NOT NULL DEFAULT 0,
  grace_week_start     DATE NOT NULL,            -- in user's tz
  warnings_sent        BIGINT NOT NULL DEFAULT 0,  -- bitmask of which offsets fired
  wipe_scheduled_at    TIMESTAMPTZ,              -- set when deadline passes
  wipe_completed_at    TIMESTAMPTZ,
  updated_at           TIMESTAMPTZ NOT NULL
);

CREATE TABLE checkin_log (
  id            BIGSERIAL PRIMARY KEY,
  user_id       UUID NOT NULL,
  checkin_at    TIMESTAMPTZ NOT NULL,
  word_count    INT NOT NULL,                  -- from AAD; client-asserted
  entry_id      UUID NOT NULL,
  source        TEXT CHECK (source IN ('write','grace'))
);
```

### State machine

```
[active] --checkin_valid--> [active] (deadline advanced)
[active] --grace_invoked--> [active] (one grace per week budget)
[active] --deadline_pass--> [grace_period] (60s settle window; see Wipe Ceremony)
[grace_period] --shard_deleted--> [wiped]
```

### Check-in validation rules (server-side)

1. `checkin_at <= current_deadline_at` (clock skew tolerance: 60s).
2. `word_count >= word_minimum` (from AAD).
3. Entry was actually accepted on `/sync` for this checkin (the `/checkin` endpoint references an entry_id; server confirms it exists and AAD matches).
4. Advance `current_deadline_at = checkin_at + checkin_window_secs`.
5. Increment `warnings_sent` reset to 0.

### Grace day rules

- `grace_week_start` rolls over Monday 00:00 in user's tz.
- On rollover, `grace_used_in_week = 0`.
- Grace invocation costs 1, extends deadline by `checkin_window_secs`.
- **Cannot stack** with a normal check-in (use one or the other per window).

---

## Service Worker Scope

```
/                        → app shell (cache-first, stale-while-revalidate)
/_next/static/*          → app shell (cache-first, immutable)
/icons/*                 → app shell
/manifest.webmanifest    → cache-first
/api/sync                → NEVER cache; offline → queue
/api/checkin             → NEVER cache; offline → queue
/api/shard               → NEVER cache; NEVER intercept (must hit network)
/api/session/*           → NEVER cache
/api/push/subscribe      → NEVER cache
```

### Caching rules

**Cache (Workbox-style):**
- HTML app shell, JS, CSS, fonts, icons — `CacheFirst` with version-based purge.
- Static config (e.g. /api/config/public) — `StaleWhileRevalidate`, short TTL.

**Never cache (treat as `NetworkOnly`):**
- `/api/shard` — caching it would mean a wiped session can replay the cached shard and unlock. Catastrophic.
- `/api/session/*` — auth challenges must be fresh.
- `/api/checkin` — must reach server to advance deadline; queue if offline.
- `/api/sync` — queue offline; flush via Background Sync where available.

### Background Sync strategy

- Chromium (Chrome/Edge/Android): use `sync` and `periodicsync` events to flush `sync_queue` and pull deadline state.
- Safari/iOS: no Background Sync. Rely on: (a) push-triggered fetch in the SW push handler, (b) on-foreground sync. Document the gap clearly.
- Firefox: same as Safari currently.

### Push handler

```js
self.addEventListener('push', async (e) => {
  const payload = e.data.json();   // {type, deadline, severity, ...}
  if (payload.type === 'warning') {
    await self.registration.showNotification(...);
  } else if (payload.type === 'wipe') {
    // server has ALREADY deleted shard; we are the cleanup hand
    await wipeLocal();             // clears IndexedDB, Caches, Cookies
    await self.registration.showNotification('Your diary has ended.', {...});
  }
});
```

---

## Wipe Ceremony Sequence

The wipe is **server-authoritative**. The client wipe is cosmetic (clearing ciphertext that's already inert).

### Happy path (client online)

```
T-0       Scheduler tick observes current_deadline_at < NOW().
T+0.0s    Server marks user.status = 'wiping', wipe_scheduled_at = NOW().
T+0.1s    Server BEGIN; DELETE shard (UPDATE users SET server_shard = NULL);
          INSERT audit_log(...); COMMIT.
          → Data is now cryptographically dead. Nothing else matters for security.
T+0.2s    Server sends Web Push { type: 'wipe' } to all subscriptions for user.
T+0.5s    SW push handler fires → wipeLocal() → clear IndexedDB (entries, sync_queue,
          meta, key_wraps), Cache Storage, Cookies, localStorage.
T+1.0s    SW posts message to any open clients → React UI transitions to the
          "blank screen with only diary title" terminal state.
T+...     Server marks wipe_completed_at = NOW().
```

### Client offline at wipe time

This is the case the design must handle gracefully:

1. **Server still wipes its shard on schedule.** Offline does not extend the deadline. The user's diary is already dead.
2. **Local IndexedDB still holds ciphertext.** It is unreadable forever — wrapped_dmk in IndexedDB requires `wrap_key = HKDF(device_shard XOR server_shard)`, and `server_shard` is gone.
3. **When the device comes online:**
   - SW receives the queued push (Web Push has up to 28-day TTL on most browsers; configure 4 weeks).
   - Or the next `/session/challenge` returns `409 WIPED`.
   - Either path triggers `wipeLocal()`.
4. **If the device never comes back online**, the ciphertext persists locally but is permanently undecryptable. Equivalent to data destruction.

### Settle window (optional, recommended)

Add a 60-second "settle window" between deadline pass and shard delete to absorb:
- Last-second check-ins that were in flight but blocked on slow connections.
- Clock skew between scheduler nodes.

This is the **only** forgiveness window. After 60s, the delete is unconditional. The settle window is logged in `wipe_scheduled_at`; user-facing messaging never mentions it (avoids gaming).

### Push subscription hygiene

- Store push subscription per device (`endpoint`, `keys`).
- When a wipe occurs, delete subscriptions after the wipe push fires.
- Re-subscribe on each session start (subscriptions expire / rotate).

---

## Build Order Recommendations

Order driven by: (a) reduce architectural risk early, (b) each step is independently demoable, (c) security primitives before features.

### Phase 1 — Crypto core + auth (riskiest, build first)
1. Next.js 15 + Fastify scaffolding, PostgreSQL, Dexie.
2. WebAuthn register/login (no PRF yet; passphrase-only path).
3. PRF detection and enrollment; DMK generation; wrap/unwrap round-trip.
4. AES-GCM encrypt/decrypt of a hardcoded entry; verify server stores ciphertext only.
5. **Demo:** register, write one entry, log out, log in, see entry.

### Phase 2 — Server shard split + deadline engine
6. Move shard from "client only" to "split"; gate `/api/shard` on session status.
7. Deadline state machine + settings UI; manual "tick" admin endpoint for testing.
8. Scheduler (pg-boss) running deadline checks every 10s.
9. Wipe ceremony (server side) end-to-end with a test user.
10. **Demo:** set a 2-minute deadline, miss it, watch the shard delete and the next login fail with WIPED.

### Phase 3 — Offline-first writing
11. Dexie schema, sync_queue, /api/sync endpoint (ciphertext only).
12. Service Worker with Workbox; cache app shell; queue offline ops.
13. Background Sync (Chromium); foreground flush fallback.
14. Conflict resolution UI for the rare LWW loser case.
15. **Demo:** airplane mode, write 5 entries, re-connect, watch them sync.

### Phase 4 — Push warnings + UX
16. Web Push subscription + VAPID keys.
17. Warning scheduling (24h/4h/1h/15min) with `warnings_sent` bitmask.
18. Push handler in SW; notification UI.
19. Grace day invocation; weekly budget rollover.
20. **Demo:** receive the 15-minute warning, hit grace day, see deadline extended.

### Phase 5 — Multi-device + polish
21. Pairing flow (QR + out-of-band confirmation).
22. `key_wraps` per credential; add/remove device UI.
23. Settings UI for word minimum, check-in window, warning offsets.
24. Final wipe UX (blank screen with only diary title).
25. Audit logging, observability, backups (of server shard *only* until deadline).

### Cross-cutting from day 1
- TypeScript strict; Zod for all API boundaries.
- E2E tests with Playwright using fake WebAuthn authenticator (Chrome DevTools Protocol).
- A Postgres seed + scheduler that can run "in fast time" (1 sim-hour = 1 real-second) for deadline testing.

---

## Sources

- [Corbado — Passkeys & WebAuthn PRF for End-to-End Encryption (2026)](https://www.corbado.com/blog/passkeys-prf-webauthn) — current platform support matrix; HIGH confidence
- [Bitwarden — PRF WebAuthn and its role in passkeys](https://bitwarden.com/blog/prf-webauthn-and-its-role-in-passkeys/) — wrap-key-per-credential pattern; HIGH confidence
- [Yubico — Developers Guide to PRF](https://developers.yubico.com/WebAuthn/Concepts/PRF_Extension/Developers_Guide_to_PRF.html) — authoritative; HIGH confidence
- [W3C WebAuthn PRF Explainer](https://github.com/w3c/webauthn/wiki/Explainer:-PRF-extension) — spec source; HIGH confidence
- [MDN — Web Authentication API extensions](https://developer.mozilla.org/en-US/docs/Web/API/Web_Authentication_API/WebAuthn_extensions) — HIGH confidence
- [oblique-security/webauthn-prf-demo](https://github.com/oblique-security/webauthn-prf-demo) — reference implementation; MEDIUM
- [PowerSync — Offline-First Apps with TanStack DB](https://powersync.com/blog/offline-first-apps-with-tanstack-db-and-powersync) — LWW-first guidance; MEDIUM
- [Convex — Going local-first with Automerge](https://stack.convex.dev/automerge-and-convex) — CRDT tradeoffs; MEDIUM
- [PWA Workshop — Background sync and notifications](https://pwa-workshop.js.org/6-background-sync/) — MEDIUM
- [MobiLoud — Do PWAs Work on iOS? (2026)](https://www.mobiloud.com/blog/progressive-web-apps-ios) — iOS push/background limits; MEDIUM
- [hidekazu-konishi — PWA Advanced Implementation Guide](https://hidekazu-konishi.com/entry/pwa_advanced_implementation_guide.html) — SW caching patterns; MEDIUM

### Unverified / requires phase-time validation
- Exact Web Push TTL caps per browser in 2026 — verify before relying on 4-week delivery window for offline wipes.
- Windows Hello PRF-on-create maturity (Chrome 147+ / Firefox 148+) — verify per target browser matrix at launch.
- Whether iOS 18.x+ Safari PRF works reliably under "Add to Home Screen" PWA mode (some past bugs in this code path).
