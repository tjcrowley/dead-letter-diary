# Pitfalls Research: Dead Letter Diary

**Researched:** 2026-06-06
**Overall confidence:** MEDIUM-HIGH
**Domain:** PWA + WebAuthn + Web Crypto + cryptographic dead-man's-switch

This is a tour of failure modes for the specific stack (Next.js 15 PWA, Fastify, Dexie/IndexedDB, WebAuthn, Web Crypto AES-GCM/HKDF, Web Push, split-key destruction). Every pitfall below is annotated with a build phase where it must be addressed before it can cause data loss — accidental *or* by-design.

The two failure modes that matter:
- **F1 — Accidental destruction:** A bug, ITP eviction, race condition, or DST glitch wipes the diary when the user did nothing wrong.
- **F2 — Failed destruction:** The "inescapable" property fails — server shard survives backups, key material is recoverable from leaked DB dumps, IndexedDB is undeletable on iOS, etc. The commitment device loses its teeth.

Both are catastrophic. F1 burns user trust; F2 makes the entire premise a lie.

---

## WebAuthn Pitfalls

### CRITICAL — Browser inconsistency in `userVerification: "required"` enforcement

**What goes wrong:** Chrome enforces UV (PIN/biometric) on every assertion. Safari, depending on authenticator and credProtect level, will silently complete an assertion *without* UV, even with `userVerification: "required"` set. A credential created on Chrome with Level 3 credProtect can appear as "no credential found" on Safari.
**Consequence:** Auth UX appears to work, but the device shard can be unwrapped without biometric — defeating the threat model where someone grabs an unlocked phone.
**Prevention:** Never trust the `userVerification` request param. After each assertion, **server-side check the `UV` flag bit** in `authenticatorData` and reject if not set. Treat client-side enforcement as advisory.
**Phase:** Phase 2 (auth foundation). Block any merge that doesn't verify the UV flag server-side.

### CRITICAL — RP ID lock-in is permanent

**What goes wrong:** WebAuthn credentials are bound to the Relying Party ID (a registrable domain). If you launch on `diary.example.com` and later move to `diary.app`, all existing credentials become unusable and **the device shard becomes unrecoverable** — every existing user loses their diary.
**Consequence:** Catastrophic data loss event at any domain migration. F1 + F2 simultaneously.
**Prevention:** Pick the RP ID once, ideally use a stable apex (e.g. `deadletter.diary`) with subdomain `app.deadletter.diary` and set RP ID to the apex. Document the lock. For self-hosters, the RP ID is part of the user's identity contract — surface this loudly in install docs.
**Phase:** Phase 0 (domain choice) + Phase 8 (self-hosting docs).

### HIGH — Resident keys (discoverable credentials) required for true "tap to unlock"

**What goes wrong:** Server-side credentials require a `userHandle` lookup before challenge, which means you need a username prompt or a cookie. The marketing promise "just tap your face" requires discoverable credentials (`residentKey: "required"`). But these consume slots on hardware keys (YubiKey 5: 25 slots) and can be silently dropped by some Android authenticators.
**Consequence:** Hardware-key users hit "no slots left," or Android users find their passkey "gone" after a Google Password Manager sync hiccup.
**Prevention:** Make resident keys the default, but support `residentKey: "preferred"` fallback. Always allow a second registered credential (recovery passkey on another device + passphrase fallback).
**Phase:** Phase 2.

### HIGH — Conditional UI (`isConditionalMediationAvailable()`) crashes on unsupported browsers

**What goes wrong:** Calling `navigator.credentials.get({ mediation: "conditional", ... })` without first checking availability throws a user-visible error on Firefox <120 and older Safari.
**Prevention:** Feature-detect with `PublicKeyCredential.isConditionalMediationAvailable()` before mounting autofill UI.
**Phase:** Phase 2.

### HIGH — PRF extension is the right primitive but has fragmented support

**What goes wrong:** The clean architecture is "device shard = PRF output of a fixed salt under the passkey." This means the shard never leaves the secure enclave and isn't even visible to JS until used. Problem: PRF support is solid on Android/Chrome and recent Safari but absent on older Android Keystore versions and Windows Hello until very recently. If you fall back to "store the wrapped shard in IndexedDB," the threat model regresses.
**Prevention:** Use PRF where available (feature-detect `extensions.prf`). When not, wrap the shard with a key derived from `largeBlob` extension or fall back to passphrase-derived wrap key. Document the security tier user is on.
**Phase:** Phase 3 (crypto foundation).

### MEDIUM — Attestation will burn you if you require it

**What goes wrong:** Requiring `attestation: "direct"` rejects users on platforms that anonymize attestation (Apple), strips it (Android Play Integrity throttled), or have no attestation cert (older YubiKeys).
**Prevention:** Use `attestation: "none"`. You don't need attestation for this app — there's no enterprise device policy to enforce.
**Phase:** Phase 2.

### MEDIUM — WKWebView and in-app browser breakage

**What goes wrong:** Users opening the PWA URL from inside Instagram/Facebook/Slack lands in a WKWebView that has no passkey access. WebAuthn either fails silently or with a confusing error.
**Prevention:** Detect WKWebView (UA sniff + feature probe) and show "open in Safari" instructions before the WebAuthn ceremony.
**Phase:** Phase 2.

---

## Web Crypto Pitfalls

### CRITICAL — IV reuse with AES-GCM is catastrophic

**What goes wrong:** Reusing a 96-bit IV with the same key under GCM leaks the XOR of plaintexts *and* allows authentication tag forgery for that key. Common mistake: generating IV once at session start, or using entry ID / timestamp as IV.
**Consequence:** Two entries encrypted with the same IV → adversary can recover plaintext differences. Worse: the GHASH authentication key can be recovered from two ciphertexts with same key+IV, breaking integrity.
**Prevention:** **One fresh `crypto.getRandomValues(new Uint8Array(12))` per encryption operation.** No exceptions. Store IV prepended to ciphertext. Unit test asserts IV uniqueness across 1M encryptions.
**Phase:** Phase 3.

### CRITICAL — Non-extractable keys must actually be non-extractable

**What goes wrong:** `crypto.subtle.importKey(..., extractable=true, ...)` because "we might need to export it for debugging." The key now lives in JS heap and is recoverable by a malicious extension, XSS, or memory dump.
**Prevention:** Master AES key is always `extractable: false`. The shard buffers can be `Uint8Array` briefly but must be `.fill(0)`-zeroed immediately after key derivation. Add an ESLint rule banning `extractable: true` outside test files.
**Phase:** Phase 3.

### CRITICAL — HKDF salt must not be the empty default

**What goes wrong:** Skipping the salt parameter (passing zero-length salt) is technically permitted by HKDF, but it conflates HKDF-Extract with HMAC and weakens domain separation. Worse: hardcoding a literal string salt across all users means HKDF reduces to deterministic stretching.
**Prevention:** Per-user random salt stored at registration, 32 bytes from `crypto.getRandomValues`. Salt is NOT secret but MUST be unique per user. `info` parameter encodes purpose: `"DLD-v1-content-key"`, `"DLD-v1-metadata-key"`, etc.
**Phase:** Phase 3.

### CRITICAL — Storing keys in localStorage / sessionStorage / IndexedDB unwrapped

**What goes wrong:** "We'll cache the derived key in localStorage so we don't have to prompt biometric every time." Any XSS, malicious bookmarklet, or browser extension reads it.
**Prevention:** Derived AES key lives only as a non-extractable `CryptoKey` reference in a closure. Never serialized. Re-derive on every app launch via WebAuthn assertion.
**Phase:** Phase 3.

### HIGH — Forgetting AAD (additional authenticated data) on AES-GCM

**What goes wrong:** Encrypting entry body without binding entry metadata (entry ID, user ID, timestamp). An attacker with DB access can swap entry ciphertexts between entries; integrity check still passes.
**Prevention:** Pass `additionalData: encode({entryId, userId, version})` to `encrypt()`. Decrypt fails if metadata is rewritten.
**Phase:** Phase 3.

### HIGH — `crypto.subtle` rejects on insecure context silently in some embeddings

**What goes wrong:** `crypto.subtle` is `undefined` on non-HTTPS origins (except `localhost`). If a self-hoster runs behind a reverse proxy that terminates TLS but the app sees `http://`, everything breaks at runtime.
**Prevention:** Detect `window.isSecureContext === false` on boot and refuse to start with a clear error. Document `X-Forwarded-Proto` requirements in self-hosting guide.
**Phase:** Phase 8.

### MEDIUM — PBKDF2 iteration count too low for passphrase fallback

**What goes wrong:** Using OWASP 2017 numbers (100k SHA-256) in 2026. Modern GPUs grind those in hours.
**Prevention:** Minimum 600k SHA-256 iterations (OWASP 2023+) or migrate to Argon2id via WASM. Re-derive and re-wrap on login if iteration count is below current floor.
**Phase:** Phase 3.

---

## IndexedDB / Offline Pitfalls

### CRITICAL — Safari ITP 7-day eviction silently destroys the diary

**What goes wrong:** Safari's Intelligent Tracking Prevention deletes all script-writable storage (IndexedDB, LocalStorage, Service Worker registrations) after 7 days of no user interaction with the site. For a PWA installed to Home Screen, the counter is reset by *opening the PWA* — but a user who travels for two weeks and forgets returns to a wiped local shard.
**Consequence:** F1 — the device shard is gone, the server shard alone is useless, diary is destroyed by *non*-interaction (silently masquerading as the intentional dead-man's switch). User can't tell the difference.
**Prevention:**
1. Use `navigator.storage.persist()` and check `navigator.storage.persisted()`. Safari grants persistence to PWAs added to Home Screen — *but only* if requested.
2. Show install banner with explicit "this MUST be added to Home Screen or your diary will be erased after 7 days of inactivity" warning.
3. Server-side: when user returns after >5 days, push a warning notification before the 7-day counter expires.
4. Distinguish in wipe ceremony logs: was this an intentional deadline miss or an ITP eviction? (Server log will show whether the device ever connected to acknowledge the wipe.)
**Phase:** Phase 4 (offline) + Phase 5 (notifications).

### CRITICAL — Service worker update wiping IndexedDB during migration

**What goes wrong:** Schema upgrade in Dexie (`db.version(2).stores(...)`) runs on next open. If migration code throws, the open call rejects and Dexie's default behavior in some setups is to *delete and recreate* the DB. Or a developer adds `Dexie.delete()` "to clean up old test data" and ships it.
**Prevention:** Wrap every schema upgrade in transactional migration with explicit rollback path. Never call `Dexie.delete()` in production paths. Add a "DB version downgrade" detection that refuses to open (don't let a rolled-back deployment wipe data).
**Phase:** Phase 4.

### CRITICAL — Storage quota exceeded mid-write loses entry

**What goes wrong:** User writes a 2,000-word entry while offline. IndexedDB write fails with `QuotaExceededError`. Default Dexie behavior surfaces an error but the entry is gone from the textarea (React state was cleared on "save click").
**Prevention:** Two-stage save: write to a draft store *first*, only clear UI state after `transaction.complete`. On quota error, show "your device is full" with bytes-needed estimate from `navigator.storage.estimate()`.
**Phase:** Phase 4.

### HIGH — Private/Incognito mode has ephemeral IndexedDB

**What goes wrong:** User opens diary in private window "just to check something." IndexedDB exists for the session, all entries from today are written to ephemeral storage, window closes, gone.
**Prevention:** Detect private mode (storage quota check: private mode reports much smaller quota). Refuse to register or open existing diary in private mode with clear message.
**Phase:** Phase 4.

### HIGH — iOS 50MB cache cap and PWA storage limits

**What goes wrong:** iOS imposes ~50MB cache storage and aggressively evicts when a PWA isn't used frequently. A multi-year diary with daily entries can approach this.
**Prevention:** Compress entries client-side before storage. Keep ciphertext minimal (no debug fields). Surface storage usage in settings.
**Phase:** Phase 4.

### MEDIUM — Multi-tab races on the same diary

**What goes wrong:** User opens diary in two tabs. Both decrypt with the same key. Tab A writes entry; Tab B's stale state overwrites it.
**Prevention:** BroadcastChannel for cross-tab coordination + last-write-wins with version vectors stored per entry.
**Phase:** Phase 4.

---

## Web Push Pitfalls

### CRITICAL — iOS push only works if PWA is installed to Home Screen

**What goes wrong:** User grants notification permission in Safari tab. Code runs `pushManager.subscribe()` successfully. **No notifications ever arrive.** Push only works when launched from Home Screen icon on iOS 16.4+.
**Consequence:** F1 — warning notifications never reach the user, deadline passes silently, diary destroyed.
**Prevention:** On iOS, gate the "enable warnings" flow behind a verified Home Screen install (detect `window.navigator.standalone === true` or `display-mode: standalone` media query). Refuse to claim notifications work until that's true.
**Phase:** Phase 5.

### CRITICAL — Push subscriptions silently expire on iOS

**What goes wrong:** iOS 16.4–18 still has documented "push subscription randomly disappears" bugs. Server pushes return 410 Gone. App doesn't know warnings stopped working.
**Prevention:**
1. Every client launch: check `pushManager.getSubscription()` and re-subscribe if null.
2. Server-side: on 410/404 from push service, mark subscription dead and *block deadline progression* until user re-subscribes (or surface giant in-app banner).
3. Always have a backup warning channel: in-app banner on launch is the source of truth, push is the nice-to-have.
**Phase:** Phase 5.

### HIGH — EU iOS no PWA push (iOS 17.4 DMA carve-out)

**What goes wrong:** Apple removed standalone PWA support in EU under DMA in iOS 17.4. Some regions / iOS versions revert to Safari-tab-only mode where push doesn't work.
**Prevention:** Detect EU + iOS version on settings page; warn that push is non-functional and they must check the app daily.
**Phase:** Phase 5 + Phase 8 (docs).

### HIGH — VAPID key rotation breaks all subscriptions

**What goes wrong:** Self-hoster regenerates VAPID keys (Docker rebuild loses volume, secrets misconfig). All existing subscriptions die silently.
**Prevention:** VAPID keys treated as durable user-impacting secret. Store in named Docker volume. Surface "VAPID key fingerprint" on admin page. Document loudly in self-hosting guide.
**Phase:** Phase 8.

### HIGH — `urgency: "normal"` notifications get coalesced/dropped on low battery

**What goes wrong:** A "1 hour to deadline" warning sent with default urgency may be batched by APNs in low-power mode and arrive *after* the deadline.
**Prevention:** Use `urgency: "high"` on deadline warnings. Test on a phone in low-power mode.
**Phase:** Phase 5.

### MEDIUM — Permission denial UX

**What goes wrong:** Asking for notification permission on first load gets "Block" → no path to recovery without browser settings.
**Prevention:** Earn the prompt — only ask after user explicitly enables warnings in settings. Detect `Notification.permission === "denied"` and show the OS-specific re-enable steps.
**Phase:** Phase 5.

---

## PWA Install Pitfalls

### CRITICAL — iOS has no `beforeinstallprompt` event

**What goes wrong:** Standard PWA install banner code (`beforeinstallprompt` → `prompt()`) only works on Chromium. iOS users see nothing. They never install. They never get push. They get evicted by ITP. Diary destroyed.
**Prevention:** Detect iOS + Safari and render custom "Add to Home Screen" instructions with screenshots. Don't conflate the two install flows.
**Phase:** Phase 6 (PWA install).

### CRITICAL — Service worker `skipWaiting()` mid-write corrupts state

**What goes wrong:** New SW version activates immediately while old SW is mid-IndexedDB-transaction. New SW has different schema assumptions. Write is interrupted; entry is in a half-written state.
**Prevention:** Don't `skipWaiting()` aggressively. Show "update available" toast, let user confirm at safe moment, then activate. On activation, drain any pending write queue first.
**Phase:** Phase 6.

### HIGH — Cache poisoning via stale precache + new HTML

**What goes wrong:** Service worker precaches `app.js`, but new deployment ships `index.html` referencing `app.v2.js`. Browser loads new HTML, SW serves stale `app.js` from cache. App is broken until SW updates.
**Prevention:** Cache HTML with `NetworkFirst`, JS/CSS with `CacheFirst` + hashed filenames + cache versioning. Use Workbox or `next-pwa` defaults; don't roll your own.
**Phase:** Phase 6.

### HIGH — SW `fetch()` hangs on flaky mobile network during install

**What goes wrong:** `install` event tries to precache 20 assets. Mobile network stalls. `fetch()` hangs 60–120s. Install never completes; PWA appears broken on first launch.
**Prevention:** Use `Promise.allSettled` not `Promise.all` for precache. Set a 10s timeout per resource. Critical-path assets only in precache.
**Phase:** Phase 6.

### MEDIUM — `manifest.json` `scope` mismatch breaks install

**What goes wrong:** `start_url` outside `scope` → some browsers refuse install or treat as not-installed.
**Prevention:** Validate manifest with Lighthouse + DevTools Application panel before each deploy.
**Phase:** Phase 6.

---

## Split-Key Crypto Pitfalls

### CRITICAL — Server shard backup defeats the entire premise

**What goes wrong:** Self-hoster sets up nightly `pg_dump` to S3 (good practice!). Server shard is in DB. User misses deadline → server "deletes" shard from live DB → next morning the backup is restored to a staging environment → shard is back → diary is recoverable. The cryptographic guarantee is now an honor system.
**Consequence:** F2 — the inescapability property fails. Worse: user *believed* it was destroyed.
**Prevention:**
1. Shards stored in a **separate Postgres schema or DB** explicitly excluded from backup tooling (`pg_dump --exclude-schema=shards`).
2. Or: shards stored in a dedicated Redis/KV with no persistence (RDB/AOF disabled), accepting that a Redis crash = mass-wipe (acceptable trade since users expect destruction).
3. Self-hosting docs have a giant warning: "do not include `shards` schema in any backup. Doing so breaks the security model."
4. Optional: shard table has a `BEFORE INSERT` trigger that aborts inside any transaction marked as backup/restore.
**Phase:** Phase 7 (wipe ceremony) + Phase 8 (docs).

### CRITICAL — Race condition: deadline passes mid-check-in

**What goes wrong:** User submits check-in at 11:59:58.500. Server wipe job runs at 12:00:00.000. Two transactions: check-in updates deadline, wipe job deletes shard. Wipe job wins; user just lost their diary while *successfully* checking in.
**Prevention:**
1. Wipe job uses `SELECT ... FOR UPDATE` on user row with deadline check inside transaction.
2. Check-in endpoint takes same row lock first.
3. Grace window of ±30s on the server side for clock skew between client and server.
4. Wipe is two-phase: mark row "pending wipe" → wait 60s → confirm deadline still passed → delete shard. Lets a slow check-in clear the flag.
**Phase:** Phase 7.

### CRITICAL — Server crashes between "delete shard" and "notify client"

**What goes wrong:** Wipe job deletes shard, server crashes before logging or notifying. Client doesn't know. User opens app, sees check-in screen, types frantically — too late, shard is gone but app behavior says "fine."
**Prevention:** Wipe ceremony writes to a `wipe_log` (durable, not part of shard storage) *before* deleting shard. Client checks wipe log on every session start. UI immediately shows the final "blank screen" state if log says wiped.
**Phase:** Phase 7.

### HIGH — Hardware failure before scheduled wipe = "accidental forever"

**What goes wrong:** Server SSD fails 2 hours before deadline. Restored from yesterday's backup. Backup didn't have today's check-in, so deadline is judged missed → shard deleted *as scheduled* by recovered server. Or inverse: shard restored from backup *after* a legitimate wipe.
**Prevention:**
1. Wipe job consults a tamper-evident log (append-only, hash-chained) before acting. If log shows recent check-in, abort.
2. Shard storage uses synchronous replication to a hot standby (not async backup).
3. On suspected restore-from-backup, server enters "safe mode" — no wipes execute until admin manually clears.
**Phase:** Phase 7.

### HIGH — XOR vs Shamir for 2-of-2 — both work, but XOR has subtle leak

**What goes wrong:** PROJECT.md specifies `HKDF(device_shard XOR server_shard)`. XOR is fine for 2-of-2 *if* both shards are uniformly random and independent. Common mistake: deriving server shard from user ID (`server_shard = HKDF(server_master, user_id)`). Now compromise of `server_master` reveals all shards.
**Prevention:** `server_shard = crypto.getRandomValues(32)` at registration, stored verbatim. No derivation from user identity. Same for device shard.
**Phase:** Phase 3.

### MEDIUM — Timing attack on shard comparison

**What goes wrong:** Server compares submitted device shard hash to stored value with `===` / `Buffer.compare()`. Early-exit reveals shard byte-by-byte.
**Prevention:** Use `crypto.timingSafeEqual()` for any shard / token / challenge comparison. ESLint rule banning `===` on Buffer types in auth paths.
**Phase:** Phase 3.

---

## Self-Hosting Pitfalls

### CRITICAL — HTTPS is mandatory and not optional

**What goes wrong:** Self-hoster runs `docker compose up`, gets `http://localhost:3000`, registers a passkey on phone via local network IP. WebAuthn requires HTTPS or `localhost`. Phone access via LAN IP fails with cryptic error.
**Prevention:** Ship with a `caddy` sidecar that auto-provisions Let's Encrypt cert. For LAN-only, document mkcert or self-signed flow. Refuse to boot without HTTPS proof (check `BASE_URL` starts with `https://` or is `localhost`).
**Phase:** Phase 8.

### CRITICAL — `.env` file committed to git

**What goes wrong:** Self-hoster clones repo, edits `.env`, commits "my config." VAPID private key, session secret, server-shard encryption key all on GitHub.
**Prevention:** Ship `.env.example` only. `.env` in `.gitignore` from commit zero. Pre-commit hook scans staged files for entropy.
**Phase:** Phase 8.

### HIGH — Docker volume not persistent across `docker compose down -v`

**What goes wrong:** User runs `docker compose down -v` (the `-v` removes volumes) to "restart fresh," wipes the Postgres volume containing all server shards. Mass diary destruction.
**Prevention:** Use named volumes with explicit comments. Document the `-v` flag prominently. Optional: separate `docker-compose.dev.yml` (with `-v` safe) from `docker-compose.prod.yml`.
**Phase:** Phase 8.

### HIGH — Reverse proxy not forwarding `X-Forwarded-*` headers

**What goes wrong:** Nginx in front of Fastify doesn't forward `X-Forwarded-Proto: https`. Fastify thinks origin is `http://` → `isSecureContext` checks fail, WebAuthn breaks, cookies missing `Secure` flag.
**Prevention:** Document required proxy headers. Fastify boots with `trustProxy: true`. Health check endpoint reports detected scheme.
**Phase:** Phase 8.

### MEDIUM — Database backup mistakenly includes shards table

**What goes wrong:** See "Server shard backup" above. Reiterating because this is the most common ops mistake.
**Prevention:** Provide an opinionated `backup.sh` that explicitly excludes shards. Refuse to ship a generic "back up everything" script.
**Phase:** Phase 8.

### MEDIUM — Single-tenant assumption leaks into multi-user self-host

**What goes wrong:** Solo user assumption baked in (e.g. "the user" rather than "user N"). Family self-host: dad's check-in counts as mom's check-in.
**Prevention:** Multi-user from day one. Every query scoped by user ID. Integration test where two users share a server and one's deadline doesn't affect the other.
**Phase:** Phase 1 (schema).

---

## UX / Timezone Pitfalls

### CRITICAL — "Midnight" deadline crosses DST boundary

**What goes wrong:** User in `America/New_York` set "24h check-in starting at midnight." On spring-forward day, 2:00 AM local jumps to 3:00 AM — the deadline window is 23 hours. On fall-back, it's 25 hours. If the server uses naive `now + 24h`, on spring-forward day the user has *one hour less* than they think.
**Consequence:** F1 — user believes they had until midnight, but server says deadline passed at 11pm. Diary destroyed.
**Prevention:**
1. Server stores deadline as absolute UTC `timestamp with time zone`.
2. Deadline computed in user's IANA zone using a date library (`luxon` / `Temporal` polyfill), not raw arithmetic.
3. On DST transition, surface a one-time banner: "DST shift today — your deadline is at ___."
**Phase:** Phase 5.

### CRITICAL — Server runs in UTC, user thinks in local

**What goes wrong:** Server logs say "wipe ran at 04:00:00." User in PT thinks "but I checked in at 8pm yesterday!" — and they did, at 04:00 UTC. Server cron fired wipe at user's 9pm local, before their deadline.
**Prevention:** All scheduled jobs read deadline from user record, not from cron timing. The cron is a *poller* (every 60s), not a *scheduler*. Each user has a stored absolute UTC deadline; the poller wipes when `now >= deadline`.
**Phase:** Phase 5 + Phase 7.

### HIGH — User changes timezone (travel) — does deadline shift?

**What goes wrong:** User in NY (deadline 11:59 PM ET). Flies to Tokyo. Phone now shows JST. App detects new timezone — does it shift the deadline forward 14 hours? Or honor the original?
**Prevention:** Make this an explicit setting: "anchor deadline to original timezone" (recommended default — predictable) vs "follow device timezone" (could accidentally lengthen or *shorten* deadline). On timezone change, show banner: "your deadline is unchanged at ___ JST" with link to setting.
**Phase:** Phase 5.

### HIGH — Word count semantics across languages

**What goes wrong:** "50 words" via `text.split(/\s+/).length` gives nonsense for Chinese, Japanese, Thai (no spaces). A Japanese user types 200 characters and the counter says "1 word."
**Consequence:** F1 — user can never meet the minimum, deadline passes, diary destroyed.
**Prevention:** Use `Intl.Segmenter` with `granularity: "word"`, filter `isWordLike`. For CJK, document that "word" maps to ICU's segmentation (~roughly 1 word per 2 characters in Japanese). Make minimum configurable in characters OR words. Test fixtures in English, Japanese, Chinese, Arabic, Thai.
**Phase:** Phase 4 (entry input).

### HIGH — Client and server word counts disagree

**What goes wrong:** Client counts 51 words with one segmenter version, sends check-in. Server (Node 20 ICU) counts 49. Server rejects. User confused, keeps trying, deadline passes.
**Prevention:** Both sides use the same `Intl.Segmenter` invocation. Pin Node version. Add integration test asserting agreement on a corpus of multilingual fixtures. Tolerance band of ±2 words allowed by server.
**Phase:** Phase 4.

### HIGH — User doesn't believe the deadline is real

**What goes wrong:** "Surely there's a recover-my-diary button hidden somewhere." User misses deadline expecting customer support to bail them out. Wipe ceremony runs. User is livid because it didn't feel real.
**Prevention:**
1. Onboarding requires a "destruction drill" — user types their first throwaway entry, deliberately misses a short test deadline (5 min), watches the wipe ceremony animation. This is the moment they internalize the contract.
2. Big red banner on first check-in screen: "no recovery exists. not by Anthropic, not by the developer, not by you, not by anyone."
3. Make user type "I understand" to enable the feature post-onboarding.
**Phase:** Phase 1 (onboarding) + Phase 7 (wipe ceremony UX).

### MEDIUM — Grace day timezone ambiguity

**What goes wrong:** "One grace day per week" — when does the week reset? Sunday UTC? User's local Monday?
**Prevention:** Anchor to user's local timezone, reset Monday 00:00 local. Surface "your grace day budget resets in 3 days" in UI.
**Phase:** Phase 5.

### MEDIUM — Warning notification arrives after deadline (clock skew)

**What goes wrong:** "15 minute warning" push is queued; APNs delivers 18 min later — *after* the wipe.
**Prevention:** Schedule warnings server-side at `deadline - threshold - 5min_buffer`. Treat thresholds as floors, not exact times. Test on real devices in low-power mode.
**Phase:** Phase 5.

### MEDIUM — Accessibility: blind user can't see the deadline countdown

**What goes wrong:** Visual countdown only. Screen reader user has no idea time is running out.
**Prevention:** ARIA live region for warnings. Haptic feedback on iOS. Audible alarm option (with consent).
**Phase:** Phase 6 (polish).

---

## Phase-Specific Warning Summary

| Phase | Most critical pitfalls to address |
|-------|----------------------------------|
| Phase 0 — Setup | RP ID choice (permanent), HTTPS requirement |
| Phase 1 — Schema | Multi-user from day one, "I understand" gate, onboarding drill |
| Phase 2 — Auth (WebAuthn) | Server-side UV flag verification, attestation=none, conditional UI feature-detect, WKWebView detection |
| Phase 3 — Crypto | IV uniqueness, non-extractable keys, HKDF salt per-user, PRF where available, timing-safe compare |
| Phase 4 — Offline / IndexedDB | `navigator.storage.persist()`, two-stage save, schema migration safety, multilingual word count |
| Phase 5 — Notifications & Deadline | iOS Home Screen gate, push 410 handling, DST-aware deadline math, timezone anchor setting |
| Phase 6 — PWA install & polish | iOS install instructions, no aggressive skipWaiting, cache versioning, accessibility |
| Phase 7 — Wipe ceremony | Two-phase wipe with locks, durable wipe log, no shard restore from backup |
| Phase 8 — Self-hosting | Backup excludes shards, HTTPS-only boot check, named volumes, proxy header docs |

---

## Sources

WebAuthn:
- [Apple Passkeys deepdive — SlashID](https://www.slashid.dev/blog/passkeys-deepdive/)
- [WebAuthn credProtect: Chrome vs Safari — Corbado](https://dev.to/corbado/webauthn-credprotect-security-keys-why-chrome-works-and-safari-does-nothing-4aad)
- [WebAuthn User Verification — Corbado](https://www.corbado.com/blog/webauthn-user-verification)
- [WebAuthn Resident Keys — Corbado](https://www.corbado.com/blog/webauthn-resident-key-discoverable-credentials-passkeys)
- [Conditional UI — Corbado](https://www.corbado.com/blog/webauthn-conditional-ui-passkeys-autofill)
- [Passkeys & WebAuthn PRF for E2EE — Corbado](https://www.corbado.com/blog/passkeys-prf-webauthn)
- [PRF Extension — Yubico](https://developers.yubico.com/WebAuthn/Concepts/PRF_Extension/)
- [Non-extractable CryptoKey from PRF proposal — W3C](https://github.com/w3c/webauthn/issues/1895)
- [SimpleWebAuthn Passkeys docs](https://simplewebauthn.dev/docs/advanced/passkeys/)

Web Crypto:
- [AesGcmParams — MDN](https://developer.mozilla.org/en-US/docs/Web/API/AesGcmParams)
- [AES-256-GCM Explained](https://ooshare.io/blog/aes-256-gcm-encryption-explained?lng=en)
- [CRYLOGGER: Detecting Crypto Misuses](https://arxiv.org/pdf/2007.01061)

IndexedDB / Safari ITP:
- [What Safari's 7-day cap means for PWA devs — Search Engine Land](https://searchengineland.com/what-safaris-7-day-cap-on-script-writeable-storage-means-for-pwa-developers-332519)
- [PWA iOS Limitations 2026 — MagicBell](https://www.magicbell.com/blog/pwa-ios-limitations-safari-support-complete-guide)
- [The pain of IndexedDB — pesterhazy gist](https://gist.github.com/pesterhazy/4de96193af89a6dd5ce682ce2adff49a)
- [iOS 17 Safari PWA issues — Apple Developer Forums](https://developer.apple.com/forums/thread/737827)

Web Push:
- [PWA Push on iOS 2026 — Webscraft](https://webscraft.org/blog/pwa-pushspovischennya-na-ios-u-2026-scho-realno-pratsyuye?lang=en)
- [Reliable Push on PWAs — Edana](https://edana.ch/en/2026/03/19/push-notifications-on-web-applications-pwa-is-it-really-reliable-on-ios-and-android/)
- [Safari PWA Limitations — BSWEN](https://docs.bswen.com/blog/2026-03-12-safari-pwa-limitations-ios/)
- [PWAs on iOS Complete Guide — Mobiloud](https://www.mobiloud.com/blog/progressive-web-apps-ios)

Service Workers:
- [Deploying PWAs at Scale — Code Worm](https://www.codeworm.dev/2026/02/deploying-pwas-at-scale-what-actually.html)
- [Taming PWA Cache Behavior — Infinity Interactive](https://iinteractive.com/resources/blog/taming-pwa-cache-behavior)
- [Service Workers PWA Guide 2026 — jsmanifest](https://jsmanifest.com/service-workers-pwa-guide)

Split-key / Shamir:
- [Shamir's Secret Sharing — ZKDocs](https://www.zkdocs.com/docs/zkdocs/protocol-primitives/shamir/)
- [Privy SSS deep dive](https://blog.privy.io/blog/shamir-secret-sharing-deep-dive)

Self-hosting:
- [Docker Secrets — Wiz](https://www.wiz.io/academy/container-security/docker-secrets)
- [Secure Secrets in Docker — LinkedIn](https://www.linkedin.com/pulse/secure-secrets-management-docker-best-practices-pitfalls-joey-wang-v9aqe)

Timezones:
- [Cron Timezones DST Pitfalls — CronBase](https://cronbase.dev/guides/cron-timezone-guide/)
- [DST Pitfalls — Cronjob.live](https://cronjob.live/docs/dst-pitfalls)
- [When DST broke our cronjobs](https://medium.com/@rudra910203/when-daylight-savings-time-broke-our-cronjobs-in-3-different-ways-ee3ce525904f)

Multilingual / Word Count:
- [Intl.Segmenter — MDN Blog](https://developer.mozilla.org/en-US/blog/javascript-intl-segmenter-i18n/)
- [Counting Words with Intl.Segmenter — Raymond Camden](https://www.raymondcamden.com/2024/11/20/counting-words-with-intlsegmenter)
- [Multilingual Word Segmentation — HathiTrust](https://old.www.hathitrust.org/blogs/large-scale-search/multilingual-issues-part-1-word-segmentation.html)
