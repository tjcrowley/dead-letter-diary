# Phase 1: Foundation - Research

**Researched:** 2026-06-06
**Domain:** Docker Compose infrastructure, PostgreSQL schema, Fastify API, Next.js PWA shell, Caddy HTTPS
**Confidence:** HIGH

## Summary

Phase 1 is a greenfield infrastructure build: Docker Compose orchestration of five services (PostgreSQL, Redis, Fastify, Next.js, Caddy), local HTTPS via Caddy with mkcert, a comprehensive PostgreSQL schema covering all 7 phases, a Fastify API skeleton, a Next.js app shell, and automatic secret generation on first boot. The monorepo structure is `apps/web` (Next.js 15) + `apps/api` (Fastify 5).

The migration runner decision (Claude's discretion) should be **postgrator** -- it is purpose-built for plain SQL files, has a simple `001.do.sql` / `001.undo.sql` naming convention, requires no ORM, and integrates cleanly as a library call from Fastify's boot sequence. The Caddy configuration should use `{$SITE_HOSTNAME:localhost}` environment variable substitution so the hostname is driven by `.env`, which is critical for the WebAuthn RP ID alignment.

**Primary recommendation:** Get Docker Compose running all 5 services with a single `docker compose up`, with Caddy serving HTTPS, Fastify responding to `/api/health`, and all tables created via postgrator migrations on first boot.

<user_constraints>

## User Constraints (from CONTEXT.md)

### Locked Decisions
- RP ID must be user-settable via `.env` before first run (e.g., `WEBAUTHN_RP_ID=diary.local` or `WEBAUTHN_RP_ID=localhost`). Once WebAuthn enrollment happens (Phase 2), changing RP ID breaks all passkeys -- no migration path. Phase 1 must make this a prominent, documented `.env` variable with a clear warning in `.env.example`. Caddy config must read the hostname from this env var so it serves the right domain. Default should work out of the box (`localhost`) but the var must be visible and easy to set before setup.
- Raw SQL files with a lightweight SQL runner (not an ORM). Migration files live in a `migrations/` directory under the API app. No ORM -- queries are written by hand.
- Comprehensive schema: scaffold ALL tables for all 7 phases in Phase 1. All tables must have `user_id` on them (multi-user-ready) even though the app is single-user in v1. Later phases add columns/indexes as needed, but no table creation in later phases if avoidable.
- Monorepo: `apps/web` (Next.js 15 PWA) + `apps/api` (Fastify). Shared types/utilities can live in `packages/` if needed. Docker Compose references the two apps by their `apps/` paths.

### Claude's Discretion
- Specific raw SQL runner library selection (research which fits best with Node/TypeScript)
- Docker Compose service naming conventions
- Internal port assignments (Fastify, Next.js, Postgres, Redis)
- Exact `.env.example` structure beyond the RP ID variable
- Health check endpoint implementation details

### Deferred Ideas (OUT OF SCOPE)
None -- discussion stayed within phase scope.

</user_constraints>

<phase_requirements>

## Phase Requirements

| ID | Description | Research Support |
|----|-------------|-----------------|
| INST-01 | Docker Compose with `restart: always` -- PostgreSQL, Redis, Fastify, Next.js, Caddy | Docker Compose multi-service setup with named volumes and restart policies |
| INST-02 | Caddy reverse proxy with mkcert local CA cert for HTTPS | Caddy `local_certs` or mkcert-generated certs mounted into container; `{$SITE_HOSTNAME}` env var |
| INST-05 | First-run auto-generates all secrets (VAPID keys, session secret, shard encryption key) | `web-push` library `generateVAPIDKeys()` + `crypto.randomBytes()` for session/encryption secrets |
| INST-06 | `.env.example` only -- `.env` in `.gitignore` from commit zero | Standard pattern; `.env.example` with prominent RP ID warning |
| INST-09 | Named Docker volumes with prominent warnings about `docker compose down -v` | Named volumes in compose file with comments; documentation warnings |
| INST-10 | HTTPS-only boot check -- refuse to start on `http://` (except localhost) | Fastify boot-time check of protocol/hostname; allow `localhost` exception |

</phase_requirements>

## Standard Stack

### Core
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| fastify | 5.8.x | API server | TypeScript-first, low overhead, plugin architecture |
| next | 15.5.x | Frontend PWA shell | App Router, standalone Docker output, React 19 |
| pg | 8.x | PostgreSQL client | Standard Node.js postgres driver, no ORM needed |
| postgrator | 8.0.0 | SQL migration runner | Plain SQL files, simple version numbering, library-mode API |
| web-push | latest | VAPID key generation | `generateVAPIDKeys()` for first-run secret generation |
| caddy | 2.11.x | Reverse proxy + HTTPS | Automatic local certs, env var substitution in Caddyfile |

### Supporting
| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| @fastify/cors | latest | CORS headers | If frontend/API on different origins during dev |
| @fastify/sensible | latest | HTTP error helpers | Cleaner error responses from health check and future routes |
| dotenv | latest | Env file loading | Load `.env` in development; Docker injects in production |
| typescript | 5.x | Type checking | Shared across apps/api and apps/web |
| tsx | latest | TypeScript execution | Dev-mode runner for Fastify without build step |

### Alternatives Considered
| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| postgrator | node-pg-migrate | More features (JS migrations, auto-down), but heavier; project wants pure SQL files |
| postgrator | postgres-migrations | Simpler but less maintained; postgrator has better TypeScript ergonomics and CLI |
| Caddy local_certs | mkcert + volume mount | More control over cert domain names; may be needed if user sets custom hostname |

**Installation:**
```bash
# In apps/api
npm install fastify pg postgrator web-push dotenv
npm install -D typescript @types/node @types/pg tsx

# In apps/web
npx create-next-app@15 . --typescript --app --use-npm
```

## Architecture Patterns

### Recommended Project Structure
```
dead-letter-diary/
├── apps/
│   ├── api/
│   │   ├── src/
│   │   │   ├── server.ts          # Fastify entry point
│   │   │   ├── plugins/           # Fastify plugins (db, migrations)
│   │   │   ├── routes/            # Route handlers
│   │   │   │   └── health.ts      # GET /api/health
│   │   │   └── boot/
│   │   │       ├── migrate.ts     # Postgrator runner
│   │   │       └── secrets.ts     # Auto-generate secrets on first run
│   │   ├── migrations/
│   │   │   ├── 001.do.create-users.sql
│   │   │   ├── 001.undo.create-users.sql
│   │   │   ├── 002.do.create-sessions.sql
│   │   │   └── ...
│   │   ├── Dockerfile
│   │   ├── package.json
│   │   └── tsconfig.json
│   └── web/
│       ├── app/                   # Next.js App Router
│       │   ├── layout.tsx
│       │   └── page.tsx
│       ├── next.config.ts
│       ├── Dockerfile
│       ├── package.json
│       └── tsconfig.json
├── docker-compose.yml
├── Caddyfile
├── .env.example
├── .gitignore
└── package.json                   # Root workspace (optional)
```

### Pattern 1: Postgrator Migration on Boot
**What:** Run migrations automatically when Fastify starts, before accepting requests.
**When to use:** Every boot -- postgrator is idempotent and tracks applied versions.
**Example:**
```typescript
// apps/api/src/boot/migrate.ts
import Postgrator from 'postgrator';
import { Client } from 'pg';
import path from 'path';

export async function runMigrations(connectionString: string) {
  const client = new Client({ connectionString });
  await client.connect();

  const postgrator = new Postgrator({
    migrationPattern: path.join(__dirname, '../../migrations/*'),
    driver: 'pg',
    database: process.env.PGDATABASE || 'deadletter',
    schemaTable: 'schema_migrations',
    execQuery: (query) => client.query(query),
  });

  const applied = await postgrator.migrate();
  console.log(`Applied ${applied.length} migration(s)`);
  await client.end();
}
```

### Pattern 2: Caddy with Environment Variable Hostname
**What:** Caddy reads hostname from env var so it matches the WebAuthn RP ID.
**When to use:** Always -- Caddyfile uses `{$SITE_HOSTNAME:localhost}`.
**Example:**
```caddyfile
{
  local_certs
}

{$SITE_HOSTNAME:localhost} {
  handle /api/* {
    reverse_proxy api:3001
  }

  handle {
    reverse_proxy web:3000
  }
}
```

### Pattern 3: Secret Auto-Generation
**What:** On first boot, check if `.env` has secrets; if not, generate and append them.
**When to use:** First run only -- a boot script checks for missing values.
**Example:**
```typescript
// apps/api/src/boot/secrets.ts
import crypto from 'crypto';
import webpush from 'web-push';
import fs from 'fs';
import path from 'path';

export function ensureSecrets(envPath: string) {
  const existing = fs.existsSync(envPath) ? fs.readFileSync(envPath, 'utf-8') : '';
  const lines: string[] = [];

  if (!process.env.SESSION_SECRET) {
    const secret = crypto.randomBytes(32).toString('hex');
    lines.push(`SESSION_SECRET=${secret}`);
  }

  if (!process.env.VAPID_PUBLIC_KEY) {
    const vapidKeys = webpush.generateVAPIDKeys();
    lines.push(`VAPID_PUBLIC_KEY=${vapidKeys.publicKey}`);
    lines.push(`VAPID_PRIVATE_KEY=${vapidKeys.privateKey}`);
  }

  if (!process.env.SHARD_ENCRYPTION_KEY) {
    const key = crypto.randomBytes(32).toString('hex');
    lines.push(`SHARD_ENCRYPTION_KEY=${key}`);
  }

  if (lines.length > 0) {
    fs.appendFileSync(envPath, '\n' + lines.join('\n') + '\n');
  }
}
```

### Pattern 4: Next.js Standalone Docker Build
**What:** Multi-stage Docker build with `output: 'standalone'` for minimal image.
**When to use:** Always for Docker deployment.
**Example:**
```typescript
// apps/web/next.config.ts
import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  output: 'standalone',
};

export default nextConfig;
```

### Anti-Patterns to Avoid
- **Running mkcert inside the Docker container at build time:** Use Caddy's `local_certs` or mount pre-generated certs. mkcert must run on the HOST to install the CA into the host's trust store.
- **Hardcoding `localhost` in Caddyfile:** Use `{$SITE_HOSTNAME:localhost}` so users who set a custom domain for WebAuthn get the right cert.
- **Using an ORM "just for migrations":** The project explicitly chose raw SQL. Don't introduce Prisma/Drizzle/TypeORM even for schema management.
- **Generating secrets inside Dockerfile:** Secrets must be runtime-generated, not baked into images.

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| SQL migrations | Custom file-reader + version tracker | postgrator | Handles version tracking, idempotent runs, up/down, schema_migrations table |
| VAPID key generation | Manual ECDSA P-256 key generation | `web-push.generateVAPIDKeys()` | Correct curve, correct encoding, battle-tested |
| Local HTTPS certificates | Manual openssl commands | Caddy `local_certs` or mkcert on host | Trust store integration, auto-renewal, correct SANs |
| Docker health checks | Custom polling scripts | Docker Compose `healthcheck` directive | Built-in restart logic, dependency ordering |
| Environment variable parsing | Manual `process.env` checks | dotenv + validation on boot | Missing var detection, type coercion |

**Key insight:** This phase is pure infrastructure plumbing. Every piece has a battle-tested solution. The risk is in the wiring between components, not in any single component.

## Common Pitfalls

### Pitfall 1: Caddy Trust Store in Docker
**What goes wrong:** Caddy's `local_certs` generates a CA but can't install it into the HOST trust store from inside a container. Browser shows cert warning.
**Why it happens:** Docker containers have their own trust store, not the host's.
**How to avoid:** Either (a) run `mkcert -install` on the host before `docker compose up` and mount the certs into Caddy, or (b) accept Caddy's internal CA and manually trust it on first run. Option (a) is better UX.
**Warning signs:** Browser shows "Your connection is not private" on first load.

### Pitfall 2: Docker Compose Service Startup Order
**What goes wrong:** Fastify tries to connect to PostgreSQL before it's ready, crashes.
**Why it happens:** `depends_on` only waits for container start, not service readiness.
**How to avoid:** Use `depends_on` with `condition: service_healthy` and add `healthcheck` to the postgres service (`pg_isready`). Fastify should also retry connection with backoff.
**Warning signs:** "ECONNREFUSED" on first `docker compose up`.

### Pitfall 3: Next.js Standalone Missing Files
**What goes wrong:** `node server.js` crashes because static assets aren't copied.
**Why it happens:** Standalone output doesn't include `public/` or `.next/static/` by default.
**How to avoid:** In Dockerfile, explicitly copy `public/` and `.next/static/` into the standalone directory.
**Warning signs:** 404 on static assets, missing favicon/manifest.

### Pitfall 4: PostgreSQL Named Volume Data Loss
**What goes wrong:** User runs `docker compose down -v` and loses all data.
**Why it happens:** `-v` flag removes named volumes. Easy to do by muscle memory.
**How to avoid:** Name volumes prominently (e.g., `deadletter_pgdata`), add comments in docker-compose.yml warning about `-v`. INST-09 requires this.
**Warning signs:** Fresh database after restart.

### Pitfall 5: Caddy $HOSTNAME Collision in Docker
**What goes wrong:** Using `{$HOSTNAME}` in Caddyfile resolves to the container ID, not the desired hostname.
**Why it happens:** Docker sets `$HOSTNAME` to the container ID automatically.
**How to avoid:** Use a different env var name like `SITE_HOSTNAME` or `WEBAUTHN_RP_ID`.
**Warning signs:** Caddy serves certificate for a hex string like `a1b2c3d4e5f6`.

### Pitfall 6: Secret Generation Race Condition
**What goes wrong:** Multiple containers try to write to `.env` simultaneously on first boot.
**Why it happens:** Docker Compose starts services in parallel.
**How to avoid:** Only the API service generates secrets. Or use an init container / entrypoint script that runs before services start. Alternatively, generate secrets into a Docker secret or volume.
**Warning signs:** Corrupt `.env` file, partial secrets.

## Code Examples

### Docker Compose Service Definitions
```yaml
# docker-compose.yml
services:
  postgres:
    image: postgres:17-alpine
    restart: always
    environment:
      POSTGRES_DB: deadletter
      POSTGRES_USER: deadletter
      POSTGRES_PASSWORD: ${POSTGRES_PASSWORD:-deadletter_dev}
    volumes:
      - deadletter_pgdata:/var/lib/postgresql/data  # WARNING: never use 'docker compose down -v'
    ports:
      - "5432:5432"
    healthcheck:
      test: ["CMD-SHELL", "pg_isready -U deadletter"]
      interval: 5s
      timeout: 3s
      retries: 5

  redis:
    image: redis:7-alpine
    restart: always
    volumes:
      - deadletter_redis:/data
    ports:
      - "6379:6379"
    healthcheck:
      test: ["CMD", "redis-cli", "ping"]
      interval: 5s
      timeout: 3s
      retries: 5

  api:
    build:
      context: ./apps/api
    restart: always
    environment:
      DATABASE_URL: postgres://deadletter:${POSTGRES_PASSWORD:-deadletter_dev}@postgres:5432/deadletter
      REDIS_URL: redis://redis:6379
      PORT: 3001
    env_file: .env
    depends_on:
      postgres:
        condition: service_healthy
      redis:
        condition: service_healthy
    ports:
      - "3001:3001"

  web:
    build:
      context: ./apps/web
    restart: always
    environment:
      PORT: 3000
      HOSTNAME: "0.0.0.0"
    env_file: .env
    ports:
      - "3000:3000"

  caddy:
    image: caddy:2-alpine
    restart: always
    ports:
      - "443:443"
      - "80:80"
    volumes:
      - ./Caddyfile:/etc/caddy/Caddyfile:ro
      - deadletter_caddy_data:/data
      - deadletter_caddy_config:/config
    env_file: .env
    depends_on:
      - api
      - web

volumes:
  deadletter_pgdata:    # Contains all diary data. NEVER use 'docker compose down -v'
  deadletter_redis:
  deadletter_caddy_data:
  deadletter_caddy_config:
```

### Health Check Route
```typescript
// apps/api/src/routes/health.ts
import { FastifyInstance } from 'fastify';

export async function healthRoutes(fastify: FastifyInstance) {
  fastify.get('/api/health', async (request, reply) => {
    // Check database connectivity
    try {
      await fastify.pg.query('SELECT 1');
    } catch (err) {
      return reply.status(503).send({
        status: 'unhealthy',
        database: 'unreachable',
      });
    }

    return {
      status: 'healthy',
      timestamp: new Date().toISOString(),
    };
  });
}
```

### Comprehensive Schema (Migration 001)
```sql
-- 001.do.create-schema.sql
-- All tables for Dead Letter Diary v1
-- Every table includes user_id for multi-user readiness

BEGIN;

CREATE TABLE users (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  passphrase_hash TEXT NOT NULL,       -- Argon2id hash
  hkdf_salt     BYTEA NOT NULL,        -- 32-byte random, per-user (CRYPT-09)
  epitaph       TEXT,                   -- Optional immutable diary epitaph (WIPE-04)
  timezone      TEXT NOT NULL DEFAULT 'UTC',
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE sessions (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id       UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  token_hash    TEXT NOT NULL UNIQUE,
  expires_at    TIMESTAMPTZ NOT NULL,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE webauthn_credentials (
  id              TEXT PRIMARY KEY,     -- credential ID from authenticator
  user_id         UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  public_key      BYTEA NOT NULL,
  counter         BIGINT NOT NULL DEFAULT 0,
  transports      TEXT[],
  device_name     TEXT,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE key_wraps (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id         UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  credential_id   TEXT REFERENCES webauthn_credentials(id) ON DELETE CASCADE,
  wrapped_dmk     BYTEA NOT NULL,      -- AES-GCM encrypted DMK
  wrap_iv         BYTEA NOT NULL,      -- 12-byte IV for the wrap
  wrap_type       TEXT NOT NULL,        -- 'webauthn_prf' | 'passphrase'
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE server_shards (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id         UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  shard           BYTEA NOT NULL,      -- Server-side key shard (CRYPT-04)
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE entries (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id         UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  ciphertext      BYTEA NOT NULL,      -- AES-GCM encrypted content
  iv              BYTEA NOT NULL,      -- 12-byte IV (CRYPT-06)
  aad             BYTEA,               -- Associated authenticated data (CRYPT-07)
  word_count      INT NOT NULL,        -- Plaintext word count for verification
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE deadline_state (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id         UUID NOT NULL UNIQUE REFERENCES users(id) ON DELETE CASCADE,
  window_hours    INT NOT NULL DEFAULT 24,        -- Check-in window (DMS-01)
  word_minimum    INT NOT NULL DEFAULT 50,         -- Word minimum (DMS-02)
  deadline_at     TIMESTAMPTZ,                     -- Next deadline (absolute UTC)
  state           TEXT NOT NULL DEFAULT 'active',  -- active | pending_wipe | wiped
  grace_used_at   TIMESTAMPTZ,                     -- Last grace day used
  grace_budget    INT NOT NULL DEFAULT 1,          -- Resets weekly (DMS-09)
  pending_window_hours INT,                        -- Akrasia: pending weakening (DMS-10)
  pending_word_minimum INT,
  pending_effective_at TIMESTAMPTZ,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE wipe_log (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id         UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  reason          TEXT NOT NULL,        -- 'deadline' | 'panic'
  initiated_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  confirmed_at    TIMESTAMPTZ,          -- Set after settle window (DMS-06)
  shard_deleted   BOOLEAN NOT NULL DEFAULT false
);

CREATE TABLE notifications (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id         UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  subscription    JSONB NOT NULL,       -- Web Push subscription object
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE notification_thresholds (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id         UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  threshold_minutes INT NOT NULL,       -- Minutes before deadline
  tone            TEXT NOT NULL,        -- 'gentle' | 'urgent' | 'final'
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Indexes for common queries
CREATE INDEX idx_sessions_user_id ON sessions(user_id);
CREATE INDEX idx_sessions_expires_at ON sessions(expires_at);
CREATE INDEX idx_entries_user_id_created ON entries(user_id, created_at DESC);
CREATE INDEX idx_deadline_state_deadline ON deadline_state(deadline_at) WHERE state = 'active';
CREATE INDEX idx_wipe_log_user_id ON wipe_log(user_id);
CREATE INDEX idx_webauthn_credentials_user ON webauthn_credentials(user_id);
CREATE INDEX idx_key_wraps_user ON key_wraps(user_id);
CREATE INDEX idx_notifications_user ON notifications(user_id);

COMMIT;
```

### .env.example
```bash
# =============================================================================
# IMPORTANT: WEBAUTHN_RP_ID — SET THIS BEFORE FIRST RUN
# =============================================================================
# This is the domain your diary will be accessed at. It MUST match the domain
# in your browser's address bar. Once you enroll a passkey (biometric/hardware
# key), this value CANNOT be changed — all passkeys will break permanently.
#
# For local use:     WEBAUTHN_RP_ID=localhost     (default, works out of the box)
# For custom domain: WEBAUTHN_RP_ID=diary.local   (requires /etc/hosts entry)
# =============================================================================
WEBAUTHN_RP_ID=localhost

# Hostname Caddy will serve (should match WEBAUTHN_RP_ID)
SITE_HOSTNAME=localhost

# Database (defaults work for local Docker Compose)
POSTGRES_PASSWORD=deadletter_dev

# === AUTO-GENERATED ON FIRST RUN (do not edit manually) ===
# SESSION_SECRET=
# VAPID_PUBLIC_KEY=
# VAPID_PRIVATE_KEY=
# SHARD_ENCRYPTION_KEY=
```

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| Next.js Pages Router | App Router (default since Next.js 13.4) | 2023 | All new projects use App Router; standalone output works with both |
| Fastify 4 | Fastify 5 (5.8.x) | 2024 | TypeScript improvements, ESM-first, same plugin API |
| docker-compose (v1 CLI) | `docker compose` (v2 CLI, built into Docker) | 2023 | Use `docker compose` not `docker-compose` |
| Self-signed certs with openssl | Caddy local_certs or mkcert | 2020+ | Auto trust store integration, no manual openssl commands |

**Deprecated/outdated:**
- `docker-compose` (hyphenated CLI): Use `docker compose` (space) -- it's built into Docker Desktop now
- Next.js `getServerSideProps` / `getStaticProps`: Use Server Components in App Router
- Fastify 4 type system: v5 simplified generic handling

## Open Questions

1. **mkcert vs Caddy local_certs for the custom hostname case**
   - What we know: Caddy `local_certs` works for `localhost` automatically. For custom hostnames like `diary.local`, you need the CA trusted on the host.
   - What's unclear: Whether Caddy's internal CA can be extracted and trusted on the host automatically, or if mkcert must run on the host first.
   - Recommendation: Default to `localhost` (Caddy handles it). For custom hostnames, document a `mkcert diary.local` step. Phase 7 installer can automate this.

2. **Secret generation strategy: boot script vs init container**
   - What we know: Secrets need to exist before Fastify starts. Writing to `.env` from inside Docker is awkward (bind mount permissions).
   - What's unclear: Best UX for first-run experience.
   - Recommendation: Use an entrypoint script in the API container that checks for secrets in environment and generates a `.env.generated` file on a shared volume if missing. Alternatively, generate secrets via a `setup.sh` script the user runs once before `docker compose up`.

3. **Postgrator schema table location**
   - What we know: Postgrator creates a `schemaversion` (or custom-named) table to track migrations.
   - What's unclear: Whether it should live in the default `public` schema or a separate schema.
   - Recommendation: Keep it in `public` schema as `schema_migrations` -- simple and standard.

## Validation Architecture

### Test Framework
| Property | Value |
|----------|-------|
| Framework | Node.js built-in test runner + Docker Compose |
| Config file | none -- see Wave 0 |
| Quick run command | `docker compose up -d && curl -sf https://localhost/api/health` |
| Full suite command | `docker compose down && docker compose up -d --build && sleep 10 && curl -sf https://localhost/api/health && docker compose exec api npx tsx src/boot/migrate.ts --check` |

### Phase Requirements -> Test Map
| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| INST-01 | Docker Compose starts all 5 services | smoke | `docker compose up -d && docker compose ps --format json \| jq -e 'length == 5'` | No -- Wave 0 |
| INST-02 | Caddy serves HTTPS with trusted cert | smoke | `curl -sf https://localhost/api/health` | No -- Wave 0 |
| INST-05 | Secrets auto-generate on first run | integration | Check `.env` or env vars contain SESSION_SECRET, VAPID keys, SHARD_ENCRYPTION_KEY | No -- Wave 0 |
| INST-06 | `.env` in `.gitignore`, `.env.example` exists | unit | `grep -q '.env' .gitignore && test -f .env.example` | No -- Wave 0 |
| INST-09 | Named Docker volumes exist | smoke | `docker volume ls --format '{{.Name}}' \| grep deadletter_pgdata` | No -- Wave 0 |
| INST-10 | HTTPS-only boot check | integration | Fastify startup validation (checked in health route or boot) | No -- Wave 0 |

### Sampling Rate
- **Per task commit:** `docker compose up -d --build && curl -sf https://localhost/api/health`
- **Per wave merge:** Full suite with all 6 checks
- **Phase gate:** Full suite green before `/gsd:verify-work`

### Wave 0 Gaps
- [ ] `scripts/test-phase1.sh` -- smoke test script that verifies all 6 INST requirements
- [ ] Docker Compose health checks on all services (postgres, redis, api, web, caddy)

## Sources

### Primary (HIGH confidence)
- [Fastify official docs](https://fastify.dev/docs/latest/Reference/TypeScript/) -- TypeScript setup, plugin architecture, v5.8.x
- [Next.js deployment docs](https://nextjs.org/docs/app/getting-started/deploying) -- standalone output, Docker patterns
- [Caddy documentation](https://caddyserver.com/docs/caddyfile/concepts) -- env var substitution `{$VAR:default}`, `local_certs`
- [Caddy TLS directive](https://caddyserver.com/docs/caddyfile/directives/tls) -- certificate configuration
- npm registry -- postgrator 8.0.0, node-pg-migrate 8.0.4, fastify 5.8.5, postgres-migrations 5.3.0

### Secondary (MEDIUM confidence)
- [Postgrator GitHub](https://github.com/rickbergfalk/postgrator) -- migration file naming, TypeScript usage
- [web-push npm](https://github.com/web-push-libs/web-push) -- `generateVAPIDKeys()` API
- [Docker Compose local HTTPS examples](https://github.com/HugoDF/docker-compose-local-https) -- mkcert + Caddy patterns

### Tertiary (LOW confidence)
- Blog posts on Caddy internal CA trust in Docker -- varies by host OS; needs validation per platform

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH -- all libraries verified via npm registry, current versions confirmed
- Architecture: HIGH -- monorepo + Docker Compose is well-documented standard pattern
- Pitfalls: HIGH -- documented from multiple sources and common Docker/Caddy issues
- Schema design: MEDIUM -- comprehensive schema designed from requirements but may need adjustments as phases execute
- Migration runner selection: MEDIUM -- postgrator is the best fit for "plain SQL files" requirement, but postgres-migrations is a viable alternative

**Research date:** 2026-06-06
**Valid until:** 2026-07-06 (stable infrastructure, 30-day validity)
