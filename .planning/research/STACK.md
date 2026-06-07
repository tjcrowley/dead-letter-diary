# Stack Research: Dead Letter Diary

**Researched:** 2026-06-06
**Overall confidence:** HIGH (verified against current docs/releases as of mid-2026)

This document is prescriptive. Decisions already made in `PROJECT.md` (Next.js 15, Fastify, Dexie, Web Crypto, WebAuthn, PostgreSQL) are taken as given. Everything below is the *how*: specific packages, versions, and "use X not Y because Z."

---

## Recommended Stack

| Layer | Choice | Version | Why |
|-------|--------|---------|-----|
| Frontend framework | Next.js | 15.x (App Router) | Already decided; best PWA + TS ecosystem |
| Service Worker / PWA | **`@serwist/next`** | 9.x | Active successor to `next-pwa` / `@ducanh2912/next-pwa`; first-class App Router support; Workbox-based |
| Backend framework | Fastify | 5.x | Already decided; fastest TS-native Node server |
| Runtime | Node.js | 22 LTS (24 also acceptable) | Native WebCrypto subtle, ESM-first |
| Language | TypeScript | 5.6+ | strict mode everywhere |
| WebAuthn (server) | **`@simplewebauthn/server`** | 13.x | De-facto Node library; FIDO Conformance certified; works with Fastify |
| WebAuthn (browser) | **`@simplewebauthn/browser`** | 13.x | Pairs with server lib; small bundle |
| Passphrase hashing | **`bcrypt`** (or `@node-rs/bcrypt`) | 5.x / 1.x | Standard; `@node-rs/bcrypt` is faster (Rust) and has no native compile pain |
| PIN hashing | bcrypt (same lib) | same | Treat PIN like a low-entropy passphrase; add rate limiting |
| IndexedDB wrapper | Dexie.js | 4.x | Already decided; v4 has stable live queries + cloud-ready API |
| Dexie React hooks | `dexie-react-hooks` | 1.1.3+ | SSR-safe `useLiveQuery` (required for Next.js App Router) |
| Push (server) | **`web-push`** (`web-push-libs/web-push`) | 3.6.7 | Still the canonical Node library; maintenance mode but functional. No viable replacement |
| ORM | **Drizzle ORM** | 0.36+ (or 1.x when stable) | SQL-first, tiny bundle, no engine binary, ideal for self-hosting |
| Drizzle driver | `postgres` (Porsager) | 3.x | Recommended by Drizzle for PG; faster than `pg` |
| Drizzle migrations | `drizzle-kit` | 0.28+ | First-party migrations |
| Database | PostgreSQL | 16 (17 acceptable) | Already decided; 16 is current stable LTS-ish track |
| Secrets / KMS | **Native `pgcrypto` column encryption** for shards; env var for master key | n/a | See [Self-Hosting](#self-hosting--docker) — Vault is overkill for a self-host-first product |
| Session store | Redis | 7.x | Required for WebAuthn challenge TTL store + push rate limiting |
| Redis client | `ioredis` | 5.x | Battle-tested with Fastify |
| Fastify plugins | `@fastify/cookie`, `@fastify/cors`, `@fastify/helmet`, `@fastify/rate-limit`, `@fastify/redis` | current | Standard hardening kit |
| Validation | Zod | 3.23+ | Shared schemas client↔server |
| Container runtime | Docker + Docker Compose | v2 | Self-host story |
| Reverse proxy | Caddy 2 | 2.8+ | Auto-HTTPS; simpler than nginx for self-hosters |

---

## Frontend

**Choice: Next.js 15 (App Router) + `@serwist/next` 9.x**

### Why Serwist, not `next-pwa` or `@ducanh2912/next-pwa`

- `next-pwa` (shadowwalker) — unmaintained since 2023.
- `@ducanh2912/next-pwa` — fork that kept it alive, but the maintainer (DuCanhGH) has **explicitly redirected new projects to Serwist**. The Serwist docs and the Next.js official PWA guide both endorse `@serwist/next`.
- **Serwist** = Workbox internals + Next.js build integration + proper App Router support (custom `sw.ts` in TypeScript, build-time precache manifest, hot-reload in dev).

Install:

```bash
npm i -D @serwist/next
npm i serwist
```

`next.config.ts`:

```ts
import withSerwistInit from "@serwist/next";

const withSerwist = withSerwistInit({
  swSrc: "app/sw.ts",
  swDest: "public/sw.js",
  cacheOnNavigation: true,
  reloadOnOnline: true,
});

export default withSerwist({
  reactStrictMode: true,
  output: "standalone", // critical for Docker self-host
});
```

### Dexie + App Router gotchas

- IndexedDB **does not exist on the server**. Any module that touches Dexie at top level will crash SSR.
- Pattern: put all Dexie code inside `"use client"` components; for components that need to gate on browser-only deps, use `next/dynamic` with `ssr: false`.
- Use `dexie-react-hooks` ≥ 1.1.3 — `useLiveQuery` returns the SSR fallback value on the server and hydrates client-side. Anything older will throw `MissingAPIError`.
- The Dead Letter Diary writing surface should be a fully client-rendered route segment (`'use client'` at the top of the page); server components are fine for marketing/landing pages only.

### UI stack (recommended, not mandated)

- **Tailwind CSS 4** — zero-config, smallest CSS payload, plays well with PWA caching
- **shadcn/ui** components copied locally (no runtime dep) — keeps the bundle tight
- **lucide-react** for icons

---

## Backend

**Choice: Fastify 5.x on Node 22 LTS**

Fastify 5 requires Node ≥ 20 and is fully ESM/CJS dual. For this project, run pure ESM (`"type": "module"`) — simpler, faster, future-proof.

### Required plugins

```bash
npm i fastify \
  @fastify/cookie @fastify/cors @fastify/helmet \
  @fastify/rate-limit @fastify/redis @fastify/sensible \
  @fastify/static
```

### Route surface (informative, not exhaustive)

- `POST /auth/webauthn/register/options` → `@simplewebauthn/server`
- `POST /auth/webauthn/register/verify`
- `POST /auth/webauthn/authenticate/options`
- `POST /auth/webauthn/authenticate/verify` → issues session cookie
- `POST /auth/passphrase` / `POST /auth/pin`
- `POST /diary/entries` — accepts ciphertext + word count; server re-verifies token count from a small client-side proof (or trust + audit; see Confidence Notes)
- `GET  /diary/shard` — returns server shard only to authenticated sessions in good standing
- `POST /diary/checkin` — bumps deadline; consumes grace day if invoked
- `POST /push/subscribe` — VAPID subscription
- `DELETE /diary/wipe` — server-side shard delete + audit log entry

### Why not Hono / Elysia / NestJS

- **Hono** — great, but Fastify already has the richer plugin ecosystem you'll need for cookies, helmet, rate limiting, etc.
- **Elysia** — Bun-first; Bun is still risky for production crypto workloads in 2026.
- **NestJS** — way too heavy for a single-purpose backend; the abstraction tax is real and the bundle balloons under Docker.

---

## Encryption

**Choice: Web Crypto API directly. No wrapper libraries.**

This is non-negotiable per `PROJECT.md` constraints. The good news: the split-key + HKDF + AES-GCM pattern is short enough that wrapping it is anti-value.

### Primitives used

| Operation | API | Notes |
|-----------|-----|-------|
| Random shards (32 bytes) | `crypto.getRandomValues(new Uint8Array(32))` | Both shards |
| XOR combine | manual `Uint8Array` loop | ~10 lines |
| HKDF derivation | `crypto.subtle.deriveKey({ name: 'HKDF', hash: 'SHA-256', salt, info })` | Salt = stable per-user value; Info = `"dld-diary-key-v1"` |
| Symmetric encrypt | `crypto.subtle.encrypt({ name: 'AES-GCM', iv }, key, plaintext)` | Fresh 12-byte IV per entry |
| WebAuthn-protected shard wrap | `largeBlob` extension OR PRF extension | See WebAuthn section |

### Do NOT pull in

- `libsodium-wrappers` — even though it's good, adding it violates "no third-party crypto libs"
- `crypto-js` — outdated, unaudited, AES-CBC defaults
- `tweetnacl` — same constraint, plus overlap with native APIs

### One acceptable helper

- **`@noble/hashes`** for *non-crypto* utilities like `hkdf` if you want a smaller WebCrypto-equivalent in environments missing HKDF. But Node 22 and all modern browsers have HKDF natively, so **skip it**. Audited, zero-dep — listed only as escape hatch.

### Recommended micro-module structure

Put all encryption in `lib/crypto/` with:
- `shards.ts` — generate, XOR
- `kdf.ts` — HKDF wrapper
- `aead.ts` — encrypt/decrypt one entry
- `webauthn-prf.ts` — PRF-extension shard wrapping

Keep this < 200 lines total and unit-test the hell out of it. **Do not** spread crypto calls across the codebase.

---

## Auth (WebAuthn)

**Choice: `@simplewebauthn/server` 13.x + `@simplewebauthn/browser` 13.x**

### Why SimpleWebAuthn

- Most-actively maintained JS WebAuthn library; FIDO Conformance tests passing.
- TypeScript-first, tiny dep footprint, works on Fastify out of the box.
- Used by Auth.js / Lucia / countless production stacks.

### Why not the alternatives

- **`fido2-lib`** (`webauthn-open-source/fido2-lib`) — still works, but lower release cadence and rougher TS types. Use only if you need very specific attestation flows SimpleWebAuthn doesn't expose.
- **`@passwordless-id/webauthn`** — browser-only helper; doesn't solve the server side.
- **Auth.js WebAuthn provider** — fine if you were already using Auth.js, but Auth.js's session model doesn't fit Fastify cleanly and you don't need OAuth.

### Required setup

- **Challenge store: Redis with 5-minute TTL**, keyed by `userId` (or pre-auth `flowId`). Do not store in memory — survives restarts and horizontal scale.
- **RP ID** must match the production hostname exactly. For local dev, use `localhost` and `http://localhost:3000` (browsers special-case this).
- **PRF extension** — for the device shard, use the WebAuthn PRF extension (`prf.eval.first`) to derive a stable 32-byte secret bound to the authenticator. This means the device shard never lives in IndexedDB unencrypted — it's wrapped by a PRF-derived key. Supported on iOS 18+, Android Chrome 132+, Windows Hello, modern macOS Safari. Fall back to `largeBlob` if PRF unavailable, or to passphrase-derived wrap as last resort.

### Auth ladder

1. **Primary**: WebAuthn (biometric or hardware key) — single touch unlocks the device shard.
2. **Fallback**: passphrase (bcrypt-hashed, used to wrap an alternate shard copy).
3. **Convenience**: PIN — only valid for ≤ 24h since last full unlock; bcrypt-hashed with a strict rate limit (5 attempts, then lockout).

The three paths must all converge on producing the same device shard. Design the wrapping scheme so each unlock method decrypts a copy of the same shard.

---

## Offline / Service Worker

**Choice: Serwist (Workbox) for SW + Dexie 4 for storage + Background Sync API for retries**

### Caching strategy

| Asset | Strategy |
|-------|----------|
| HTML shell | `NetworkFirst` with 3s timeout → cache fallback |
| Next.js static (`_next/static/*`) | `CacheFirst`, 1 year |
| API GET (read-only metadata) | `StaleWhileRevalidate` |
| API POST (entries, checkin) | **No cache**; queue via Background Sync |
| Fonts/icons | `CacheFirst`, 1 year |

### Background Sync

Use Workbox's `BackgroundSyncPlugin` (re-exported by Serwist) to queue failed `POST /diary/entries` requests until the device is back online. Critical for the offline-first promise.

### Dexie schema (sketch)

```ts
db.version(1).stores({
  entries: '++id, createdAt, syncedAt, wordCount',
  meta: 'key', // e.g. 'lastCheckin', 'wrappedDeviceShard'
  outbox: '++id, kind, createdAt',
});
```

### Critical caveats

- **Never store the raw device shard in IndexedDB.** Store only the PRF-wrapped (or passphrase-wrapped) ciphertext.
- **Never log plaintext.** Service Worker `console.log` is visible in DevTools and is sometimes captured by browser telemetry.
- IndexedDB on iOS is purged after ~7 days of inactivity for non-installed PWAs. **Aggressively prompt install** — install bumps storage to "best-effort persistent." Also call `navigator.storage.persist()` after first successful WebAuthn unlock.

---

## Push Notifications

**Choice: `web-push` (web-push-libs) 3.6.7 + native browser Push API**

### Reality check

The `web-push` npm package has not had an npm release since 2023, but:
- The GitHub repo had commits in March 2025.
- There are 419+ packages depending on it.
- **There is no maintained, production-grade alternative for Node.** Anything else on npm is either a thin wrapper, a paid service SDK (OneSignal, Pushpad), or abandoned.

**Verdict: ship with `web-push@3.6.7`.** Pin the version. If it breaks, fork — the codebase is small.

### VAPID setup

```bash
npx web-push generate-vapid-keys
```

Store the **private key as a Docker secret / env var** (`VAPID_PRIVATE_KEY`). Public key ships to the client.

### Schedule

The dead man's switch warnings (24h, 4h, 1h, 15min) must fire even if the app is closed. Two options:

1. **Server-scheduled push** (recommended) — backend cron / worker queries subscriptions due for warning and pushes them. Survives browser closure. Required for the 24h-out warning since the device may never wake.
2. **Client-scheduled via `Notification.showTrigger`** — not supported in Safari, removed/unstable in Chromium. **Do not rely on it.**

For the scheduler, a single setInterval inside Fastify is fine for v1 (small user base). When scaling, move to **BullMQ** (`bullmq` 5.x) on Redis — already deployed.

### iOS PWA push

- iOS 16.4+ supports Web Push **only for installed PWAs** (Add to Home Screen).
- The user MUST install before subscribing. Detect with `window.matchMedia('(display-mode: standalone)')` and show an explicit installation flow before requesting `Notification.requestPermission()`.
- Apple counts toward a per-domain push budget; do not spam.

---

## Database & ORM

**Choice: PostgreSQL 16 + Drizzle ORM + `postgres` driver**

### Why Drizzle, not Prisma

For *this* project (self-hosted, small data model, security-critical, Docker-deployable):

- **Bundle size**: Drizzle ~7kb vs Prisma client ~1.6MB even after the v7 rewrite. Matters for cold-start on small VPS instances.
- **No engine binary**: Drizzle is pure TS. Prisma still ships a query engine (TS/Wasm in v7, but still parsed at boot). Simpler Docker image.
- **SQL transparency**: For a product where the entire trust model rests on "the server really deletes the shard," being able to read the exact SQL is a feature, not a chore.
- **Migrations are file-based and reviewable**: `drizzle-kit generate` produces SQL files you can audit.
- **Trend**: Drizzle overtook Prisma in npm downloads in late 2025.

Prisma's only real advantage here would be migration UX. Not worth the trade.

### Schema (sketch)

```ts
// users
id (uuid pk), createdAt, lastCheckinAt, deadlineAt,
wordMinimum (int default 50), checkinWindowSeconds (int default 86400),
graceBudget (int default 1), graceResetAt,
status (enum: 'active','wiped','grace_used')

// authenticators (WebAuthn credentials)
id (uuid pk), userId fk, credentialId (bytea unique),
publicKey (bytea), counter (bigint), transports (text[]),
deviceName, createdAt, lastUsedAt

// auth_fallbacks
userId pk fk, passphraseBcrypt (text), pinBcrypt (text),
pinFailedAttempts (int), pinLockedUntil

// key_shards  ← THE critical table
userId pk fk, shard (bytea) ENCRYPTED via pgcrypto,
createdAt, destroyedAt, destructionReason

// push_subscriptions
id, userId fk, endpoint, p256dh, auth, createdAt

// audit_log
id, userId, kind, payload (jsonb), createdAt
```

### Server shard storage

**Use `pgcrypto`** (built into PostgreSQL — `CREATE EXTENSION pgcrypto`) with column-level symmetric encryption:

```sql
INSERT INTO key_shards (user_id, shard)
  VALUES ($1, pgp_sym_encrypt($2, current_setting('app.shard_master_key')));
```

The `app.shard_master_key` is set per connection from an env var (`SHARD_MASTER_KEY`) loaded at Fastify boot from a Docker secret. This means:

- DB dumps alone do not leak shards.
- Process memory + DB are both required.
- Self-hosters need to manage exactly one secret.

### Why not HashiCorp Vault / AWS KMS / Supabase Vault?

- **Self-hosting story** is paramount. Asking a single user to run Vault is hostile.
- For commercial multi-tenant deployment later, you can swap the `pgcrypto` calls for a Vault transit engine or KMS without schema changes. Design the encrypt/decrypt as a Drizzle plugin or small repository module so the swap is local.

---

## Self-Hosting / Docker

**Choice: Single `docker-compose.yml` with 4 services. One-command deploy.**

### Target audience

A solo user with a $5 VPS, basic CLI skills, and Docker installed. They should be able to:

```bash
git clone github.com/tjcrowley/dead-letter-diary
cd dead-letter-diary
cp .env.example .env
# edit DOMAIN, SHARD_MASTER_KEY, VAPID_* keys
docker compose up -d
```

…and be writing in their diary within 5 minutes.

### Compose layout

```yaml
services:
  caddy:
    image: caddy:2-alpine
    ports: ["80:80", "443:443"]
    volumes:
      - ./Caddyfile:/etc/caddy/Caddyfile:ro
      - caddy_data:/data
      - caddy_config:/config

  web:
    build: ./apps/web        # Next.js, output: 'standalone'
    environment:
      - NEXT_PUBLIC_API_URL=${DOMAIN}/api
      - NEXT_PUBLIC_VAPID_PUBLIC_KEY=${VAPID_PUBLIC_KEY}
    depends_on: [api]

  api:
    build: ./apps/api        # Fastify
    environment:
      - DATABASE_URL=postgres://dld:${DB_PASSWORD}@db:5432/dld
      - REDIS_URL=redis://redis:6379
      - SHARD_MASTER_KEY=${SHARD_MASTER_KEY}
      - VAPID_PUBLIC_KEY=${VAPID_PUBLIC_KEY}
      - VAPID_PRIVATE_KEY=${VAPID_PRIVATE_KEY}
      - VAPID_SUBJECT=mailto:${ADMIN_EMAIL}
    depends_on:
      db: { condition: service_healthy }
      redis: { condition: service_started }

  db:
    image: postgres:16-alpine
    environment:
      - POSTGRES_USER=dld
      - POSTGRES_PASSWORD=${DB_PASSWORD}
      - POSTGRES_DB=dld
    volumes: [db_data:/var/lib/postgresql/data]
    healthcheck:
      test: ["CMD", "pg_isready", "-U", "dld"]
      interval: 5s

  redis:
    image: redis:7-alpine
    volumes: [redis_data:/data]

volumes: { caddy_data: , caddy_config: , db_data: , redis_data: }
```

### Caddyfile

```
{$DOMAIN} {
  encode zstd gzip
  handle /api/* {
    reverse_proxy api:3001
  }
  handle {
    reverse_proxy web:3000
  }
}
```

Caddy gives automatic Let's Encrypt — critical because **WebAuthn requires HTTPS** (no exceptions outside localhost). Self-hosters not getting HTTPS for free is a deal-breaker.

### Dockerfiles

- `apps/web/Dockerfile` — multi-stage Node 22-alpine, `next build`, `output: 'standalone'`, copy `.next/standalone` + `.next/static` + `public`. Final image ~150MB.
- `apps/api/Dockerfile` — multi-stage Node 22-alpine, `tsup` or `tsc` build, run with `node --enable-source-maps dist/server.js`. Final image ~100MB.

### Init / migrations

Run Drizzle migrations as an init container or via API on boot (`drizzle-kit migrate` then start). Fail fast if the master key changes vs existing data (key rotation = explicit ceremony, not silent).

### Env example file

Ship `.env.example` with:
- `DOMAIN` (e.g. `https://diary.example.com`)
- `ADMIN_EMAIL`
- `DB_PASSWORD` — instruct user to generate via `openssl rand -hex 32`
- `SHARD_MASTER_KEY` — instruct: `openssl rand -hex 32`
- `VAPID_PUBLIC_KEY` / `VAPID_PRIVATE_KEY` — instruct: `npx web-push generate-vapid-keys`

A `bin/init.sh` script that generates these and writes `.env` makes the experience truly one-shot.

---

## Confidence Notes

### HIGH confidence
- **Serwist over next-pwa**: explicit upstream redirect from `@ducanh2912/next-pwa` maintainer + Next.js docs endorsement.
- **SimpleWebAuthn**: FIDO Conformance pass, broad production usage.
- **Drizzle over Prisma for self-hosted**: bundle/binary advantage is concrete.
- **pgcrypto for shard at rest**: standard Postgres feature, no external dep.
- **Caddy for HTTPS**: best self-host UX, period.

### MEDIUM confidence
- **web-push 3.6.7**: works, but unmaintained. Plan: pin version, monitor advisories, fork if needed. Code is small (~1500 LOC) — forking is cheap insurance.
- **PRF extension for device-shard wrapping**: works on the major platforms but not universal. Need a clean fallback to `largeBlob` and ultimately passphrase. **Recommend a phase-1 spike to validate cross-platform.**
- **iOS PWA push UX**: technically works but install-then-permission flow has high drop-off. Likely needs polish iteration.

### LOW confidence — flag for phase-specific research
- **Word count verification**: client counts, server verifies "before accepting check-in" per `PROJECT.md`. But the server only sees ciphertext. Either (a) server trusts client word count and audits later, (b) client sends a zero-knowledge proof of word count, or (c) server gets the wordcount + a Merkle-style proof tying it to the ciphertext. **This needs its own research phase.** Don't ship the dead man's switch without resolving it — it's the *whole product*.
- **Scheduler reliability for warning pushes**: a single Fastify cron is fine for MVP, but if the process restarts during the 15-min warning window, warnings get missed. Move to BullMQ early.
- **Backup story for the server shard table**: standard Postgres backup defeats the dead-man's-switch unless backups also enforce the deletion. May need either (a) "no backups, that's the point" documented honestly, or (b) backups encrypted with a separate key the user keeps offline.

### Sources

- [Serwist docs (@serwist/next)](https://serwist.pages.dev/docs/next)
- [Next.js official PWA guide](https://nextjs.org/docs/app/guides/progressive-web-apps)
- [@ducanh2912/next-pwa docs (redirects to Serwist)](https://ducanh-next-pwa.vercel.app/docs/next-pwa)
- [SimpleWebAuthn](https://simplewebauthn.dev/) and [@simplewebauthn/server docs](https://simplewebauthn.dev/docs/packages/server/)
- [Node.js Passkeys & WebAuthn in 2026 (HireNodeJS)](https://www.hirenodejs.com/blog/nodejs-passkeys-webauthn-2026)
- [fido2-lib (alternative, lower cadence)](https://github.com/webauthn-open-source/fido2-lib)
- [web-push (web-push-libs)](https://github.com/web-push-libs/web-push) and [npm page](https://www.npmjs.com/package/web-push)
- [Dexie 4 roadmap](https://github.com/dexie/Dexie.js/discussions/1455) and [Dexie ♥ Next.js](https://medium.com/dexie-js/dexie-js-next-js-fd15556653e6)
- [Drizzle vs Prisma 2026 (Bytebase)](https://www.bytebase.com/blog/drizzle-vs-prisma/) and [Drizzle vs Prisma 2026 (makerkit)](https://makerkit.dev/blog/tutorials/drizzle-vs-prisma)
- [Drizzle vs Prisma — Encore](https://encore.dev/articles/drizzle-vs-prisma)
- [PostgreSQL encryption options](https://www.postgresql.org/docs/current/encryption-options.html)
- [HashiCorp Vault PG secrets engine (rejected as overkill)](https://developer.hashicorp.com/vault/docs/secrets/databases/postgresql)
- [Next.js + Postgres Docker compose reference](https://dev.to/whoffagents/docker-compose-for-full-stack-development-nextjs-postgres-redis-and-production-builds-57m8)
- [Self-host Next.js + Postgres + Docker](https://jb.desishub.com/blog/self-host-nextjs-and-postgres-with-docker)
