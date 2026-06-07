# Phase 6: Wipe & Ceremony — Research

**Researched:** 2026-06-07
**Domain:** Cryptographic wipe ceremony, client-side IndexedDB clearing, push-triggered UI transitions, PostgreSQL schema isolation, backup scripting
**Confidence:** HIGH — all findings are grounded in the project's existing source code; no new external libraries are required

---

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|-----------------|
| WIPE-01 | Server deletes shard when deadline passes — data is cryptographically dead at that instant | `confirmWipe()` in `deadline-engine.ts` already does the DELETE; Phase 6 must wire the push notification that fires after deletion and expose a `/api/wipe/status` or extend `/api/deadline` |
| WIPE-02 | Client receives wipe push → clears IndexedDB, caches, cookies | SW push handler in `sw.ts` must detect `type: 'wipe'` payload and call new `performClientWipe()` lib function |
| WIPE-03 | Final UI: blank screen with only the diary title — decoy "as if it never happened" state | New `/wiped` Next.js page; router guard on session start detects `state === 'wiped'` and redirects |
| WIPE-04 | Optional diary epitaph (set at creation, immutable) displayed on wipe screen | `users.epitaph TEXT` column already exists in schema; needs API read endpoint and setup-page field (immutable after write) |
| WIPE-05 | Panic encrypt: on-demand immediate wipe button in settings (with confirmation dialog) | New `POST /api/wipe/panic` route; calls `initiateWipe` + skips 60s settle (reason: 'panic'); PanicEncryptButton component |
| WIPE-06 | Client checks wipe log on every session start — shows blank state if wiped | Session-start check against `/api/deadline` (`state === 'wiped'`); redirect to `/wiped`; already stubbed in `DeadlineBanner.tsx` |
| INST-07 | Server shards in separate PostgreSQL schema excluded from backups | Migration to move `server_shards` to a `shards` schema (or use `pg_dump --exclude-schema`); Docker Compose `pg_dump` command updated |
| INST-08 | Opinionated `backup.sh` that explicitly excludes shards schema | New `scripts/backup.sh` with `pg_dump --exclude-table=public.server_shards` or schema-based exclusion |
</phase_requirements>

---

## Summary

Phase 6 completes the core security promise of Dead Letter Diary: the diary is not merely deleted — it is cryptographically destroyed in an observable, irreversible ceremony. The server-side deletion is already fully implemented in `confirmWipe()` (Phase 5). Phase 6 has three distinct concerns:

**1. Client-side wipe propagation.** When `confirmWipe()` deletes the shard, the server must send a push notification with `type: 'wipe'`. The Service Worker receives this push, clears IndexedDB (`DeadLetterDiary` Dexie database), all Cache Storage caches, and the session cookie. The client is then rendered incapable of decrypting anything — the DMK's key material is gone, and the wrapped DMK ciphertext in IndexedDB is deleted. On next page load, the session-start check (`GET /api/deadline`) sees `state === 'wiped'` and redirects to `/wiped`.

**2. Wipe ceremony UI.** The `/wiped` page shows only the diary title and — if set — the epitaph. The `users.epitaph` column already exists in the schema. Phase 6 needs: an API route to read (and write once) the epitaph, a field in setup, and the `/wiped` page itself. The design should feel like a gravestone: minimal, deliberate, final.

**3. Shard backup exclusion.** The shards schema or table must be excluded from PostgreSQL backups. This is a `pg_dump` flag problem — either `--exclude-table=public.server_shards` or moving shards to a dedicated PostgreSQL schema (`CREATE SCHEMA shards; ALTER TABLE server_shards SET SCHEMA shards;`) and using `--exclude-schema=shards`. The schema approach is cleaner. `backup.sh` must be opinionated and fail loudly if the exclusion is somehow bypassed.

**Primary recommendation:** Implement in three plans — (1) wipe push notification from server + `/api/wipe/panic` + WIPE-01 completion plumbing, (2) client cleanup lib + SW handler + `/wiped` page + session-start guard, (3) epitaph API + panic button UI + backup.sh + shard schema isolation.

---

## Standard Stack

### Core (all already in use — no new packages needed)

| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| Dexie.js | (already installed) | IndexedDB access for clearing `DeadLetterDiary` DB | Already used for drafts/outbox; `db.delete()` wipes entire database |
| web-push | (already installed) | Server sends `type: 'wipe'` push after shard deletion | Already wired in `notification-sender.ts` |
| Serwist / Service Worker | (already installed) | SW intercepts `type: 'wipe'` push, clears caches | Already has push handler in `sw.ts` |
| Next.js App Router | (already installed) | `/wiped` page, session guard | Already used throughout |
| Fastify | (already installed) | `POST /api/wipe/panic`, `GET /api/wipe/epitaph` routes | Already used throughout |
| pg / Pool | (already installed) | All DB operations | Already used throughout |

### No New Dependencies

This phase adds zero new npm packages. All capabilities needed (push, IndexedDB, cache clearing, cookies) are browser-native or already in the stack.

---

## Architecture Patterns

### Recommended New Files

```
apps/api/src/
├── routes/wipe.ts               # POST /api/wipe/panic, GET+POST /api/wipe/epitaph
├── routes/__tests__/wipe.test.ts

apps/web/
├── app/wiped/page.tsx           # Wipe ceremony screen
├── lib/wipe.ts                  # performClientWipe() — clears IDB, caches, cookie
├── lib/__tests__/wipe.test.ts
├── components/PanicEncryptButton.tsx
├── components/__tests__/PanicEncryptButton.test.tsx

scripts/
└── backup.sh                    # pg_dump excluding shards schema

apps/api/migrations/
└── 002.do.shard-schema.sql      # ALTER TABLE server_shards SET SCHEMA shards (or equivalent)
```

### Pattern 1: Wipe Push Notification from Server

After `confirmWipe()` succeeds, the poller calls a new `sendWipeNotification(pool, userId, log)` helper that:
1. Fetches the push subscription for the user from `notifications`.
2. Sends a push with payload `{ type: 'wipe', title: 'Dead Letter Diary', body: 'Your diary has been destroyed.' }`.
3. Deletes the subscription row (there is no longer any use for it).

This must happen AFTER the shard deletion transaction commits. It is best-effort — if push fails (subscription gone, 410), the client still detects wipe on next session start via WIPE-06.

```typescript
// In deadline-engine.ts or a new notification-sender helper
async function sendWipeNotification(pool: Pool, userId: string, log: FastifyBaseLogger): Promise<void> {
  const subResult = await pool.query(
    `SELECT subscription FROM notifications WHERE user_id = $1 LIMIT 1`,
    [userId]
  );
  if (subResult.rows.length === 0) return;

  const subscription = subResult.rows[0].subscription as { endpoint: string; keys: { p256dh: string; auth: string } };
  const payload = JSON.stringify({
    type: 'wipe',
    title: 'Dead Letter Diary',
    body: 'Your diary has been destroyed.',
  });

  try {
    await webpush.sendNotification(subscription, payload);
  } catch (err) {
    log.warn({ userId, err }, 'wipe-notification: push failed (non-fatal)');
  }

  // Clean up subscription — no longer relevant
  await pool.query(`DELETE FROM notifications WHERE user_id = $1`, [userId]);
}
```

### Pattern 2: SW Wipe Handler

The Service Worker in `sw.ts` must detect `type: 'wipe'` in its push handler and trigger client cleanup:

```typescript
// In sw.ts — extend the existing push handler
self.addEventListener("push", (event: PushEvent) => {
  const data = event.data?.json() as { type?: string; title?: string; body?: string; data?: Record<string, unknown> };

  if (data?.type === 'wipe') {
    event.waitUntil(
      (async () => {
        // 1. Clear all Cache Storage caches
        const cacheKeys = await caches.keys();
        await Promise.all(cacheKeys.map((k) => caches.delete(k)));

        // 2. Clear IndexedDB by deleting the Dexie database
        await new Promise<void>((resolve, reject) => {
          const req = indexedDB.deleteDatabase('DeadLetterDiary');
          req.onsuccess = () => resolve();
          req.onerror = () => reject(req.error);
          req.onblocked = () => resolve(); // best-effort
        });

        // 3. Show wipe notification
        await self.registration.showNotification('Dead Letter Diary', {
          body: 'Your diary has been permanently destroyed.',
          icon: '/icons/icon-192x192.png',
          requireInteraction: true,
        });

        // 4. Tell all open clients to navigate to /wiped
        const allClients = await clients.matchAll({ type: 'window' });
        for (const client of allClients) {
          client.navigate('/wiped');
        }
      })()
    );
    return; // Don't fall through to normal notification display
  }

  // ... existing warning notification logic ...
});
```

**Critical:** Session cookie cannot be cleared from the SW (no `document.cookie` in SW context). The `/wiped` page itself calls `document.cookie = 'session=; Max-Age=0; path=/; Secure; SameSite=Strict'` on mount, and the `performClientWipe()` function (called from the write page / session guard) handles it in the window context.

### Pattern 3: `performClientWipe()` Library Function

A window-context function (not SW context) called on session start when `state === 'wiped'`:

```typescript
// apps/web/lib/wipe.ts
import { db } from './db';

export async function performClientWipe(): Promise<void> {
  // 1. Clear Dexie IndexedDB
  await db.delete();

  // 2. Clear Cache Storage
  if ('caches' in window) {
    const keys = await caches.keys();
    await Promise.all(keys.map((k) => caches.delete(k)));
  }

  // 3. Clear session cookie
  document.cookie = 'session=; Max-Age=0; path=/; Secure; SameSite=Strict';

  // 4. Clear session DMK from memory (already gone on refresh, but belt-and-suspenders)
  // import { clearSessionDmk } from './session-dmk';
  // clearSessionDmk(); // if exported
}
```

### Pattern 4: Session-Start Guard (WIPE-06)

On every app load, before showing any content, the root layout or a guard component calls `/api/deadline` and checks the state:

```typescript
// In layout.tsx or a WipeGuard component
const deadline = await fetch('/api/deadline', { credentials: 'include' });
if (deadline.ok) {
  const data = await deadline.json();
  if (data.state === 'wiped') {
    await performClientWipe();
    router.replace('/wiped');
  }
}
```

Note: `DeadlineBanner.tsx` already has the stub `if (deadlineState.state === "wiped") return null;` — Phase 6 should replace this null return with a redirect trigger.

### Pattern 5: Panic Encrypt (WIPE-05)

`POST /api/wipe/panic` — authenticated route that:
1. Gets a pool client with `FOR UPDATE` on `deadline_state`.
2. Inserts `wipe_log` row with `reason: 'panic'`.
3. Calls `DELETE FROM server_shards WHERE user_id = $1` immediately (no 60s settle — panic is user-initiated).
4. Sets `deadline_state.state = 'wiped'`.
5. Sends wipe push notification.

The reason field in `wipe_log` distinguishes `'deadline'` from `'panic'` (schema already has `reason TEXT NOT NULL`).

The `PanicEncryptButton` component must show a two-step confirmation dialog — "This will permanently destroy your diary. This cannot be undone." with a typed confirmation (e.g., type "DESTROY") before the API call fires. Never a single-click delete.

### Pattern 6: Shard Schema Isolation (INST-07, INST-08)

**Option A — PostgreSQL schema isolation (recommended):**
```sql
-- 002.do.shard-schema.sql
CREATE SCHEMA IF NOT EXISTS shards;
ALTER TABLE server_shards SET SCHEMA shards;
-- Update foreign key references if needed (CASCADE works cross-schema)
```

`pg_dump` backup command then uses `--exclude-schema=shards`.

**Option B — table exclusion (simpler, no migration):**
```bash
pg_dump --exclude-table=public.server_shards ...
```

Option A is cleaner (explicit schema = obvious intent, harder to accidentally include), but requires a migration and updating all queries that reference `server_shards` to use `shards.server_shards`. Since the codebase references `server_shards` in only a few places (`crypto.ts`, `deadline-engine.ts`), this is manageable.

**Recommendation: Option A** — move to `shards` schema, update queries, update backup.sh with `--exclude-schema=shards`.

### Pattern 7: Epitaph (WIPE-04)

The `users.epitaph TEXT` column already exists. Phase 6 needs:

1. `POST /api/account/epitaph` — sets epitaph if not already set (immutability enforced server-side: 409 if `epitaph IS NOT NULL`).
2. `GET /api/account/epitaph` — returns current epitaph (or null).
3. The `/wiped` page fetches epitaph and displays it below the diary title.
4. Setup page includes an optional epitaph field with clear "this cannot be changed later" messaging.

The setup page (Phase 7) would be the canonical place for the epitaph field. Phase 6 only needs the API routes and the display on `/wiped`. The setup page integration can be a Phase 6 task or deferred to Phase 7 — since Phase 7 builds the setup page, Phase 6 builds the API and the wipe screen reads it from any source (direct DB query is fine for the wipe screen since user session is still valid momentarily during the redirect).

### Anti-Patterns to Avoid

- **Clearing IndexedDB from SW and window context simultaneously**: If both the SW wipe push handler and the session-start guard both call `db.delete()`, the second call gets an error on an already-deleted database. Guard both with try/catch and treat "database not found" as success.
- **Relying solely on push for wipe detection**: Push can fail silently (iOS low-power, expired subscription). WIPE-06 (session-start check) is the authoritative detection mechanism. Push accelerates the UX.
- **Showing any content before wipe check**: The session-start guard must run before rendering diary content. A loading state during the check is correct; showing write page then redirecting is a flash of decryptable content.
- **Panic with single confirmation**: A one-click destroy button is dangerous. Require typed confirmation.
- **Forgetting the shard encryption key**: `DELETE FROM server_shards` removes the encrypted shard blob. The plaintext shard is never logged. The `SHARD_ENCRYPTION_KEY` env var remains, but without the row it decrypts nothing. This is correct — no secondary deletion of the env var is needed.
- **Cache clearing race in SW**: `caches.keys()` followed by parallel `caches.delete()` can race if a new cache entry is added mid-deletion. In practice this is harmless for a wipe (best-effort clear), but wrap in `event.waitUntil` to ensure the promise chain completes before the push event closes.

---

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Sending wipe push | Custom HTTP fetch to push endpoint | `web-push` (already installed) `sendNotification()` | Already handles VAPID signing, payload encryption |
| IndexedDB clearing | Manual `indexedDB.open().objectStore.clear()` loops | `db.delete()` from Dexie | One call deletes all tables; Dexie handles version negotiation |
| Cache clearing | Manual cache key enumeration | `caches.keys()` + `caches.delete()` (browser-native) | Standard Cache Storage API; no library needed |
| PostgreSQL backup exclusion | Custom dump script with `pg_dump` internals | `pg_dump --exclude-schema=shards` flag | Flag is stable and well-documented; no custom pg code needed |

---

## Common Pitfalls

### Pitfall 1: iOS Safari Cannot Clear Cookies from Service Worker

**What goes wrong:** SW context does not have access to `document.cookie`. Attempting to set cookies from a push handler silently does nothing.
**Why it happens:** Service Workers run in a separate context from the page document.
**How to avoid:** Cookie clearing must happen in window context — either in `performClientWipe()` called from the `/wiped` page on mount, or via a `postMessage` from the SW to the page client.
**Warning signs:** After wipe, user re-authenticates and finds server still returns 401 (expected) but cookie persists in browser — session is invalid on server anyway, but the cookie lingers until expiry.

### Pitfall 2: Dexie `db.delete()` Fails If Database Is Already Open

**What goes wrong:** `indexedDB.deleteDatabase()` is blocked if there is an open connection to the database. It won't fail — it enters `onblocked` state and waits indefinitely until all connections close.
**Why it happens:** The write page holds an open Dexie connection. If the SW push fires while the write page is open, `deleteDatabase` blocks.
**How to avoid:** In the SW wipe handler, navigate all open clients to `/wiped` BEFORE awaiting `deleteDatabase`. The navigation closes the write page's Dexie connection. Or use `onblocked` as a resolve signal (best-effort delete).
**Warning signs:** Wipe push fires but IndexedDB data persists in browser storage inspector.

### Pitfall 3: Panic Wipe Bypasses Settle Window — Race with In-Flight Check-In

**What goes wrong:** If the user submits a check-in at the same moment the panic wipe fires, the check-in could succeed (updating `deadline_at`) while the panic wipe is deleting the shard. The deadline state becomes inconsistent.
**Why it happens:** Panic wipe uses `FOR UPDATE` lock, but the check-in route also uses `FOR UPDATE`. The transaction that commits first wins.
**How to avoid:** Panic wipe's transaction acquires `FOR UPDATE` on `deadline_state` and checks `state === 'active'` before proceeding. The check-in route returns 409 if `state !== 'active'`. Since panic sets state to 'wiped' atomically within the transaction, any subsequent check-in sees 'wiped' and fails. This is the correct behavior.
**Warning signs:** wipe_log shows `reason='panic'` with `shard_deleted=true` but deadline_state.deadline_at was updated after the wipe — indicates a race.

### Pitfall 4: Schema Migration Breaks Existing Queries

**What goes wrong:** If `server_shards` moves to the `shards` schema, every existing SQL string that references `server_shards` (without schema qualification) breaks at runtime.
**Why it happens:** PostgreSQL's default `search_path` includes `public` but not `shards`.
**How to avoid:** Update `search_path` for the API role (`ALTER ROLE api_user SET search_path = public, shards`) OR update all query strings to use `shards.server_shards`. Explicit schema qualification in SQL strings is more maintainable. There are only three references: `crypto.ts` (INSERT, SELECT), `deadline-engine.ts` (DELETE), and the migration itself.
**Warning signs:** `relation "server_shards" does not exist` errors in Fastify logs after migration.

### Pitfall 5: `/wiped` Page Must Not Fetch Diary Content

**What goes wrong:** If the wipe page makes any call that could return encrypted diary content (e.g., accidentally loading entries), it creates a recovery surface.
**Why it happens:** Developer error — copy-paste from write page.
**How to avoid:** The `/wiped` page must make only one API call: `GET /api/account/epitaph` (or read from the deadline state response). No calls to `/api/entries`, `/api/crypto/shard`, or anything that touches encrypted material.

---

## Code Examples

### Triggering wipe push from `checkDeadlines` (after confirmWipe)

```typescript
// In deadline-engine.ts — extend checkDeadlines step 2
for (const row of pendingWipe.rows) {
  const { user_id: userId } = row as { user_id: string };
  const client = await pool.connect();
  try {
    await confirmWipe(client, userId);
    // After successful wipe, send notification (best-effort)
    await sendWipeNotification(pool, userId, log);
    log.info({ userId }, "deadline-engine: confirmed wipe + sent wipe notification");
  } catch (err) {
    log.error({ userId, err }, "deadline-engine: error confirming wipe");
  } finally {
    client.release();
  }
}
```

### Panic wipe route skeleton

```typescript
// apps/api/src/routes/wipe.ts
fastify.post('/api/wipe/panic', { preHandler: [requireAuth] }, async (request, reply) => {
  const userId = request.userId;
  const client = await fastify.pg.connect();
  try {
    await client.query('BEGIN');
    const ds = await client.query(
      `SELECT state FROM deadline_state WHERE user_id = $1 FOR UPDATE`,
      [userId]
    );
    if (ds.rows.length === 0 || (ds.rows[0] as { state: string }).state !== 'active') {
      await client.query('ROLLBACK');
      return reply.status(409).send({ error: 'Not in active state' });
    }
    // Insert wipe_log with reason='panic'
    await client.query(
      `INSERT INTO wipe_log (user_id, reason, initiated_at, shard_deleted, confirmed_at)
       VALUES ($1, 'panic', now(), true, now())`,
      [userId]
    );
    // Delete shard immediately (no settle window for panic)
    await client.query(`DELETE FROM server_shards WHERE user_id = $1`, [userId]);
    await client.query(
      `UPDATE deadline_state SET state = 'wiped', updated_at = now() WHERE user_id = $1`,
      [userId]
    );
    await client.query('COMMIT');

    // Best-effort push
    await sendWipeNotification(fastify.pg, userId, fastify.log);

    return reply.status(200).send({ ok: true });
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
});
```

### `backup.sh` skeleton (INST-08)

```bash
#!/usr/bin/env bash
# backup.sh — Dead Letter Diary database backup
# IMPORTANT: This script DELIBERATELY excludes the shards schema.
# Backing up server_shards would defeat the cryptographic wipe guarantee.
set -euo pipefail

DB_NAME="${POSTGRES_DB:-deadletter}"
DB_USER="${POSTGRES_USER:-deadletter}"
DB_HOST="${POSTGRES_HOST:-localhost}"
BACKUP_DIR="${BACKUP_DIR:-./backups}"
TIMESTAMP=$(date +%Y%m%d_%H%M%S)
BACKUP_FILE="${BACKUP_DIR}/deadletter_${TIMESTAMP}.sql.gz"

mkdir -p "$BACKUP_DIR"

echo "Backing up database (shards schema excluded)..."
pg_dump \
  -h "$DB_HOST" \
  -U "$DB_USER" \
  -d "$DB_NAME" \
  --exclude-schema=shards \
  --no-password \
  | gzip > "$BACKUP_FILE"

echo "Backup written to: $BACKUP_FILE"
echo "WARNING: Server shards are NOT included in this backup by design."
```

---

## State of the Art

| Old Approach | Current Approach | Impact |
|--------------|------------------|--------|
| `localStorage.clear()` for wipe | `caches.keys()` + `indexedDB.deleteDatabase()` | localStorage is synchronous and origin-scoped; Cache Storage and IDB are the correct targets for PWA data |
| `pg_dump` with manual table exclusion | `--exclude-schema` for dedicated schema | Schema-level exclusion is harder to accidentally remove than per-table flags |
| Single confirmation dialog for destructive action | Two-step: dialog + typed confirmation | Prevents fat-finger permanent data loss |

---

## Open Questions

1. **Epitaph in Phase 6 vs Phase 7 setup page**
   - What we know: `users.epitaph` column exists; setup page is Phase 7 work.
   - What's unclear: Should Phase 6 add an epitaph field to the (partially existing) setup page, or just build the API and display it on `/wiped`?
   - Recommendation: Phase 6 builds `POST /api/account/epitaph` and `GET /api/account/epitaph`, and the `/wiped` page displays the epitaph. Phase 7 wires the setup page field. The API is stable regardless.

2. **Schema migration impact on Docker Compose restart**
   - What we know: Migrations run on boot via `migrate.ts`. Moving `server_shards` to a new schema requires a new migration file.
   - What's unclear: Whether the migration numbering system (001, 002...) is sequential-only or supports rollbacks.
   - Recommendation: Add `002.do.shard-schema.sql` as a forward-only migration. No rollback needed (this is a one-way security hardening).

3. **Should confirmWipe send the push inside or outside the transaction?**
   - What we know: Push is network I/O; holding a DB transaction open during a network call is risky (locks held longer than necessary).
   - What's unclear: Best sequencing.
   - Recommendation: COMMIT the transaction first, then send push. If push fails, the wipe is still complete — WIPE-06 handles clients on next session start. This matches the existing architecture.

---

## Validation Architecture

### Test Framework

| Property | Value |
|----------|-------|
| Framework | Vitest (api: `vitest.config.ts` — node env; web: `vitest.config.ts` — happy-dom env) |
| Config file (API) | `apps/api/vitest.config.ts` — `include: ["src/**/*.test.ts"]` |
| Config file (web) | `apps/web/vitest.config.ts` — happy-dom, `@/` alias, React plugin |
| Quick run (API) | `cd apps/api && npx vitest run src/routes/__tests__/wipe.test.ts src/lib/__tests__/deadline-engine.test.ts` |
| Quick run (web) | `cd apps/web && npx vitest run lib/__tests__/wipe.test.ts components/__tests__/PanicEncryptButton.test.tsx` |
| Full suite (API) | `cd apps/api && npx vitest run` |
| Full suite (web) | `cd apps/web && npx vitest run` |

### Phase Requirements → Test Map

| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| WIPE-01 | `confirmWipe()` deletes shard row and sets state=wiped | unit | `cd apps/api && npx vitest run src/lib/__tests__/deadline-engine.test.ts` | ✅ (existing tests cover confirmWipe) |
| WIPE-01 | `checkDeadlines()` calls `sendWipeNotification` after confirmWipe | unit | `cd apps/api && npx vitest run src/lib/__tests__/deadline-engine.test.ts` | ❌ Wave 0: extend deadline-engine.test.ts |
| WIPE-02 | SW push handler with `type:'wipe'` deletes IDB and caches | unit | `cd apps/web && npx vitest run lib/__tests__/wipe.test.ts` | ❌ Wave 0 |
| WIPE-03 | `/wiped` page renders only title and no diary content | unit | `cd apps/web && npx vitest run app/wiped/__tests__/page.test.tsx` | ❌ Wave 0 |
| WIPE-04 | `GET /api/account/epitaph` returns stored epitaph | unit | `cd apps/api && npx vitest run src/routes/__tests__/wipe.test.ts` | ❌ Wave 0 |
| WIPE-04 | `POST /api/account/epitaph` returns 409 if epitaph already set | unit | `cd apps/api && npx vitest run src/routes/__tests__/wipe.test.ts` | ❌ Wave 0 |
| WIPE-05 | `POST /api/wipe/panic` deletes shard immediately (no 60s settle) | unit | `cd apps/api && npx vitest run src/routes/__tests__/wipe.test.ts` | ❌ Wave 0 |
| WIPE-05 | `POST /api/wipe/panic` returns 409 when state != 'active' | unit | `cd apps/api && npx vitest run src/routes/__tests__/wipe.test.ts` | ❌ Wave 0 |
| WIPE-05 | `PanicEncryptButton` renders confirmation dialog before API call | unit | `cd apps/web && npx vitest run components/__tests__/PanicEncryptButton.test.tsx` | ❌ Wave 0 |
| WIPE-06 | `performClientWipe()` clears IDB, caches, session cookie | unit | `cd apps/web && npx vitest run lib/__tests__/wipe.test.ts` | ❌ Wave 0 |
| WIPE-06 | Session-start guard redirects to `/wiped` when state=wiped | unit | `cd apps/web && npx vitest run lib/__tests__/wipe.test.ts` | ❌ Wave 0 |
| INST-07 | `server_shards` table lives in `shards` schema after migration | manual smoke | `psql -c "\dt shards.*"` — verify table in shards schema | ❌ Wave 0: migration file |
| INST-08 | `backup.sh` excludes shards schema from pg_dump output | unit (shell) | `bash scripts/backup.sh && pg_restore --list backup.sql | grep -v server_shards` | ❌ Wave 0: backup.sh |

### Sampling Rate

- **Per task commit:** `cd apps/api && npx vitest run src/routes/__tests__/wipe.test.ts` and `cd apps/web && npx vitest run lib/__tests__/wipe.test.ts`
- **Per wave merge:** Full suite — `cd apps/api && npx vitest run && cd ../../apps/web && npx vitest run`
- **Phase gate:** Full suite green before `/gsd:verify-work`

### Wave 0 Gaps

- [ ] `apps/api/src/routes/__tests__/wipe.test.ts` — covers WIPE-04, WIPE-05 (panic route, epitaph routes)
- [ ] `apps/api/src/lib/__tests__/deadline-engine.test.ts` — extend existing file: add test for `sendWipeNotification` being called after `confirmWipe` in `checkDeadlines`
- [ ] `apps/web/lib/__tests__/wipe.test.ts` — covers WIPE-02 (IDB clear), WIPE-06 (performClientWipe, session guard)
- [ ] `apps/web/components/__tests__/PanicEncryptButton.test.tsx` — covers WIPE-05 (confirmation dialog, API call)
- [ ] `apps/web/app/wiped/__tests__/page.test.tsx` — covers WIPE-03 (blank screen, epitaph display)
- [ ] `apps/api/migrations/002.do.shard-schema.sql` — covers INST-07
- [ ] `scripts/backup.sh` — covers INST-08

---

## Sources

### Primary (HIGH confidence)

All findings are derived directly from reading the project's existing source code. No external documentation was required — the technical choices for this phase are fully determined by what was already built in Phases 1–5.

- `apps/api/migrations/001.do.create-schema.sql` — schema structure, `epitaph` column, `wipe_log` reason field, `shards` migration target
- `apps/api/src/lib/deadline-engine.ts` — `confirmWipe()`, `initiateWipe()`, `checkDeadlines()` — wipe already implemented server-side
- `apps/api/src/plugins/deadline-poller.ts` — poller structure; where `sendWipeNotification` hook goes
- `apps/web/app/sw.ts` — existing push handler; where `type: 'wipe'` branch is added
- `apps/web/lib/db.ts` — Dexie database named `'DeadLetterDiary'`; `db.delete()` is the correct clearing call
- `apps/web/lib/push.ts` — cookie format (`session`, httpOnly, Secure, SameSite=Strict) for cookie clearing
- `apps/web/components/DeadlineBanner.tsx` — existing `state === 'wiped'` stub that Phase 6 replaces

### Secondary (MEDIUM confidence)

- PostgreSQL `pg_dump --exclude-schema` flag: standard pg documentation, stable across pg versions 13+. Schema isolation for backup exclusion is a well-known pattern for compliance requirements.
- `indexedDB.deleteDatabase()` `onblocked` behavior on open connections: well-documented browser behavior; resolved by navigating clients first.

---

## Metadata

**Confidence breakdown:**
- WIPE-01 (server shard deletion): HIGH — code already exists in confirmWipe; only push notification hook is new
- WIPE-02 (client push wipe): HIGH — SW push handler pattern is already implemented; `type:'wipe'` branch is a standard extension
- WIPE-03 (wipe UI): HIGH — new Next.js page, no novel patterns
- WIPE-04 (epitaph): HIGH — column exists; standard CRUD API + display
- WIPE-05 (panic): HIGH — same transactional pattern as confirmWipe, minus the settle window
- WIPE-06 (session start guard): HIGH — pattern is a standard session check already present in DeadlineBanner
- INST-07 (shard schema): MEDIUM — schema migration is straightforward but has query string update implications that need careful audit
- INST-08 (backup.sh): HIGH — `pg_dump --exclude-schema` is a stable, well-documented flag

**Research date:** 2026-06-07
**Valid until:** 2026-07-07 (stable — no fast-moving external dependencies; all constraints are internal to the codebase)
