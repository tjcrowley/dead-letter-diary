# Phase 5: Dead Man's Switch - Research

**Researched:** 2026-06-07
**Domain:** Deadline state machine, Web Push API, IANA timezone handling, Akrasia Horizon enforcement, PostgreSQL row-level locks
**Confidence:** HIGH

---

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|-----------------|
| DMS-01 | Configurable check-in window (default 24h, range 12h–7 days) | `deadline_state.window_hours` column already exists in DB schema |
| DMS-02 | Configurable word minimum per check-in (default 50, range 25–500) | `deadline_state.word_minimum` already read by entries.ts; column exists |
| DMS-03 | Server-side deadline state machine with absolute UTC timestamps | `deadline_state.deadline_at TIMESTAMPTZ`, state col (`active|pending_wipe|wiped`) in schema |
| DMS-04 | Deadline computed in user's IANA timezone via date library (not raw arithmetic) | Luxon or date-fns-tz recommended; `users.timezone TEXT` already in schema |
| DMS-05 | Poller every 60s checks deadlines — not a cron scheduler | `setInterval` loop inside Fastify plugin; no external scheduler needed |
| DMS-06 | Two-phase wipe: mark pending → 60s settle → confirm → delete shard | `wipe_log` table + `deadline_state.state = 'pending_wipe'` in schema |
| DMS-07 | Row-level locks prevent race between check-in and wipe | `SELECT ... FOR UPDATE` in PostgreSQL transactions |
| DMS-08 | Wipe log written BEFORE shard deletion for crash safety | Write-ahead to `wipe_log`; `shard_deleted` bool flip after |
| DMS-09 | Grace day: one 24h reprieve per week, manually invoked | `grace_used_at`, `grace_budget` columns in schema; weekly reset logic |
| DMS-10 | Akrasia Horizon: weakening requires 7-day advance; strengthening immediate | `pending_window_hours`, `pending_word_minimum`, `pending_effective_at` in schema |
| NOTIF-01 | Push notification warnings at configurable thresholds (default: 24h, 4h, 1h, 15min) | `notification_thresholds` table seeded at setup; poller checks them |
| NOTIF-02 | Warning tone escalates from gentle to urgent to final across thresholds | `tone` column (`gentle|urgent|final`) in `notification_thresholds` |
| NOTIF-03 | Push setup gated behind Home Screen install check on iOS | `navigator.standalone` or `display-mode: standalone` media query |
| NOTIF-04 | Re-subscribe on every app launch (iOS push subscriptions silently expire) | `navigator.serviceWorker.ready` + `registration.pushManager.subscribe` on every mount |
| NOTIF-05 | In-app deadline banner as backup when push fails | Client polls `/api/deadline` for countdown; banner rendered from deadline_at |
| NOTIF-06 | `urgency: "high"` on deadline warnings to survive low-power mode | `web-push` 3.6.7 `sendNotification(sub, payload, { urgency: 'high' })` |
| NOTIF-07 | Soft-ask pattern for push permission (earn the prompt, don't ask on first load) | Explained UI pattern; `Notification.requestPermission()` deferred until user action |
</phase_requirements>

---

## Summary

Phase 5 implements the deadline engine that gives the diary its "teeth." The database schema was fully scaffolded in Phase 1 — every table and column this phase needs already exists (`deadline_state`, `wipe_log`, `notifications`, `notification_thresholds`). No migrations are required; work is almost entirely new routes, a Fastify poller plugin, and client-side push subscription management.

The core challenge is **correctness under concurrent access**: the 60-second poller and a simultaneous check-in HTTP request can both target the same `deadline_state` row. PostgreSQL `SELECT ... FOR UPDATE` is the standard tool, and the existing `pg` pool already used in the codebase supports transactions natively. The two-phase wipe (mark → settle → delete) with a write-ahead log entry is a well-understood pattern and is directly supported by the existing `wipe_log.initiated_at / confirmed_at / shard_deleted` columns.

Push notifications on iOS 16.4+ Safari require the PWA to be installed to Home Screen before `PushManager` is available. The existing Service Worker (Serwist) is already registered, but the `push` event handler and subscription re-registration on every launch must be added. The `web-push` npm package (3.6.7) is already in the API's dependency tree and already generates VAPID keys at boot — no new packages are needed.

**Primary recommendation:** Build the poller as a Fastify plugin that calls `setInterval` inside `onReady`, use `SELECT FOR UPDATE` in a transaction for all state transitions, write to `wipe_log` before touching `server_shards`, and handle iOS push by gating subscription on `navigator.standalone`.

---

## Standard Stack

### Core
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| `web-push` | 3.6.7 | Send VAPID-signed Web Push messages from Fastify | Already installed in workspace root; VAPID keys already auto-generated at boot |
| `luxon` | ^3.x | IANA timezone-aware date arithmetic (DMS-04) | Explicit IANA tz support with `DateTime.fromObject({}, { zone })` — not in dep tree yet |
| `pg` (Pool) | ^8.13.3 | PostgreSQL transactions with `SELECT FOR UPDATE` | Already in use; `pool.connect()` → `client.query('BEGIN')` pattern |
| `vitest` | ^4.1.8 | Unit tests for poller logic, state transitions, grace day budget | Already configured in both apps |

### Supporting
| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| `fastify-plugin` | ^5.1.0 | Wrap poller as scoped Fastify plugin | Already used for db, redis, auth plugins |
| Browser `PushManager` API | native | Subscribe client to Web Push | No npm package; browser built-in |
| Browser `Notification` API | native | Request push permission, soft-ask flow | No npm package |

### Alternatives Considered
| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| Luxon | `date-fns-tz` | date-fns-tz is lighter but Luxon's IANA zone handling is more complete for this use case |
| Luxon | `@js-temporal/polyfill` | TC39 Temporal is not yet stable in Node; avoid for now |
| `setInterval` poller | `node-cron` / `pg_cron` | External cron is over-engineering; a simple interval inside the Fastify server is sufficient and easier to test |
| `pg` manual transactions | Knex / Prisma | ORM adds overhead; `pool.connect()` + raw SQL stays consistent with existing codebase pattern |

**Installation:**
```bash
# In apps/api (luxon is server-side only; @types/luxon for TypeScript)
npm install luxon --workspace=apps/api
npm install -D @types/luxon --workspace=apps/api
```

No new packages needed on the web side — push subscription uses browser built-ins.

---

## Architecture Patterns

### Recommended Project Structure
```
apps/api/src/
├── plugins/
│   ├── db.ts              # existing
│   ├── redis.ts           # existing
│   ├── auth.ts            # existing
│   └── deadline-poller.ts # NEW: setInterval loop, registered in server.ts
├── routes/
│   ├── deadline.ts        # NEW: GET/POST /api/deadline, /api/deadline/grace, /api/deadline/settings
│   └── notifications.ts   # NEW: POST /api/notifications/subscribe, DELETE /api/notifications/subscribe
apps/web/
├── lib/
│   └── push.ts            # NEW: subscribe(), unsubscribe(), re-subscribe on launch
├── components/
│   └── DeadlineBanner.tsx # NEW: in-app countdown + warning state (NOTIF-05)
├── app/
│   └── sw.ts              # MODIFY: add push event handler for notification display
```

### Pattern 1: Poller as Fastify Plugin

**What:** Register a `setInterval` inside a Fastify plugin's `onReady` hook. The interval calls a pure async function `checkDeadlines(pg)` that can be independently unit-tested.

**When to use:** Any server-side recurring task that needs access to injected dependencies (DB pool) but no external scheduler.

```typescript
// Source: Fastify plugin pattern — apps/api/src/plugins/deadline-poller.ts
import fp from "fastify-plugin";
import type { FastifyInstance } from "fastify";
import { checkDeadlines } from "../lib/deadline-engine.js";

async function deadlinePollerPlugin(fastify: FastifyInstance): Promise<void> {
  let intervalId: NodeJS.Timeout | undefined;

  fastify.addHook("onReady", async () => {
    intervalId = setInterval(async () => {
      try {
        await checkDeadlines(fastify.pg, fastify.log);
      } catch (err) {
        fastify.log.error({ err }, "Deadline poller error");
      }
    }, 60_000);
  });

  fastify.addHook("onClose", async () => {
    if (intervalId) clearInterval(intervalId);
  });
}

export default fp(deadlinePollerPlugin, { name: "deadline-poller" });
```

### Pattern 2: Two-Phase Wipe with Row-Level Lock

**What:** Acquire `FOR UPDATE` lock on `deadline_state`, write `wipe_log` row (crash-safe), set `state = 'pending_wipe'`, then after 60-second settle window, confirm and set `shard_deleted = true` on the log before issuing the actual `DELETE FROM server_shards`.

**When to use:** Any critical state transition where a concurrent HTTP request (check-in) might race against the poller.

```typescript
// Source: PostgreSQL docs — FOR UPDATE row-level locking
const client = await pool.connect();
try {
  await client.query("BEGIN");

  // Lock the row — blocks concurrent check-in for this user
  const { rows } = await client.query(
    `SELECT id, state, deadline_at FROM deadline_state
     WHERE user_id = $1 FOR UPDATE`,
    [userId]
  );

  if (rows[0]?.state !== "active") {
    await client.query("ROLLBACK");
    return; // Already wiped or pending
  }

  // Write-ahead log BEFORE touching shards (DMS-08)
  await client.query(
    `INSERT INTO wipe_log (user_id, reason, initiated_at)
     VALUES ($1, 'deadline', now())`,
    [userId]
  );

  // Mark pending — settle window starts
  await client.query(
    `UPDATE deadline_state SET state = 'pending_wipe', updated_at = now()
     WHERE user_id = $1`,
    [userId]
  );

  await client.query("COMMIT");
} catch (err) {
  await client.query("ROLLBACK");
  throw err;
} finally {
  client.release();
}
```

### Pattern 3: Grace Day Weekly Budget Reset

**What:** The `grace_budget` resets to 1 at the start of each calendar week. Check `grace_used_at` — if it is more than 7 days ago (or null), reset the budget before checking if it can be spent.

**Key fields (already in schema):**
- `grace_used_at TIMESTAMPTZ` — when the last grace was invoked
- `grace_budget INT DEFAULT 1` — current weekly allowance

```typescript
// Grace day logic (server-side, in deadline.ts route)
const now = DateTime.utc();
const lastGrace = row.grace_used_at
  ? DateTime.fromJSDate(row.grace_used_at, { zone: "utc" })
  : null;

const budgetReset = !lastGrace || now.diff(lastGrace, "days").days >= 7;
const effectiveBudget = budgetReset ? 1 : row.grace_budget;

if (effectiveBudget < 1) {
  return reply.status(429).send({ error: "Grace budget exhausted for this week" });
}

// Extend deadline_at by 24h and record usage
await client.query(
  `UPDATE deadline_state
   SET deadline_at = deadline_at + INTERVAL '24 hours',
       grace_used_at = now(),
       grace_budget = $2,
       updated_at = now()
   WHERE user_id = $1`,
  [userId, budgetReset ? 0 : effectiveBudget - 1]
);
```

### Pattern 4: Web Push Subscription (Client Side)

**What:** Subscribe to push on every app launch to handle iOS silent expiry (NOTIF-04). Gate subscription on Home Screen install check (NOTIF-03).

```typescript
// Source: MDN PushManager.subscribe — apps/web/lib/push.ts

export async function subscribeIfInstalled(vapidPublicKey: string): Promise<void> {
  // iOS requires Home Screen install before PushManager is available
  const isStandalone =
    window.matchMedia("(display-mode: standalone)").matches ||
    (navigator as { standalone?: boolean }).standalone === true;

  if (!isStandalone) return; // NOTIF-03: not installed yet

  const reg = await navigator.serviceWorker.ready;
  if (!("pushManager" in reg)) return; // older browser

  // Re-subscribe on every launch (handles iOS silent expiry — NOTIF-04)
  const existing = await reg.pushManager.getSubscription();
  if (existing) {
    await existing.unsubscribe();
  }

  const subscription = await reg.pushManager.subscribe({
    userVisibleOnly: true,
    applicationServerKey: urlBase64ToUint8Array(vapidPublicKey),
  });

  // POST subscription to server
  await fetch("/api/notifications/subscribe", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(subscription.toJSON()),
  });
}

function urlBase64ToUint8Array(base64String: string): Uint8Array {
  const padding = "=".repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, "+").replace(/_/g, "/");
  const rawData = atob(base64);
  return Uint8Array.from([...rawData].map((c) => c.charCodeAt(0)));
}
```

### Pattern 5: Akrasia Horizon (DMS-10)

**What:** Weakening (lower word count, longer window) is written to `pending_*` columns with `pending_effective_at = now() + INTERVAL '7 days'`. The poller promotes pending changes when `pending_effective_at <= now()`. Strengthening writes directly to `window_hours` / `word_minimum`.

```typescript
// In poller — promote pending Akrasia changes
await client.query(
  `UPDATE deadline_state
   SET window_hours = pending_window_hours,
       word_minimum = pending_word_minimum,
       pending_window_hours = NULL,
       pending_word_minimum = NULL,
       pending_effective_at = NULL,
       updated_at = now()
   WHERE user_id = $1
     AND pending_effective_at IS NOT NULL
     AND pending_effective_at <= now()`,
  [userId]
);
```

### Pattern 6: Web Push Send with Urgency

```typescript
// Source: web-push 3.6.7 — apps/api/src/lib/notification-sender.ts
import webpush from "web-push";

webpush.setVapidDetails(
  `mailto:${process.env.VAPID_CONTACT_EMAIL ?? "admin@localhost"}`,
  process.env.VAPID_PUBLIC_KEY!,
  process.env.VAPID_PRIVATE_KEY!
);

export async function sendDeadlineWarning(
  subscription: webpush.PushSubscription,
  minutesRemaining: number,
  tone: "gentle" | "urgent" | "final"
): Promise<void> {
  const payload = JSON.stringify({
    title: tone === "final" ? "Last chance — write now" : "Dead Letter Diary",
    body: formatWarningBody(minutesRemaining, tone),
    data: { type: "deadline-warning", minutesRemaining },
  });

  await webpush.sendNotification(subscription, payload, {
    urgency: tone === "gentle" ? "normal" : "high", // NOTIF-06
    TTL: minutesRemaining * 60, // notification expires when deadline passes
  });
}
```

### Pattern 7: Service Worker Push Event Handler

The existing `sw.ts` handles caching only. It must be extended to handle `push` events for displaying notifications.

```typescript
// Add to apps/web/app/sw.ts — push event handler
self.addEventListener("push", (event: PushEvent) => {
  if (!event.data) return;

  const data = event.data.json() as {
    title: string;
    body: string;
    data?: Record<string, unknown>;
  };

  event.waitUntil(
    self.registration.showNotification(data.title, {
      body: data.body,
      icon: "/icons/icon-192x192.png",
      badge: "/icons/badge-72x72.png",
      data: data.data,
      requireInteraction: true, // Keep visible until user taps
    })
  );
});

self.addEventListener("notificationclick", (event: NotificationEvent) => {
  event.notification.close();
  event.waitUntil(
    clients.openWindow("/write")
  );
});
```

### Anti-Patterns to Avoid

- **Using `setTimeout` for the settle window in-process:** If the server restarts during the 60-second settle, the timeout is lost. Store `initiated_at` in `wipe_log` and check elapsed time in the poller on every tick instead.
- **Calling `webpush.setVapidDetails` inside the route handler:** Call once at startup or in the poller plugin's initialization — repeated calls are wasteful and not thread-safe.
- **Storing push subscription in client state only:** Always POST to server immediately on subscribe. The subscription is the only way to reach the user when the app is closed.
- **Requesting push permission on page load (NOTIF-07):** Browsers may auto-deny if permission is requested without user gesture. Use a dedicated "Enable notifications" button after user engagement.
- **Raw timestamp arithmetic for timezone deadlines (DMS-04):** `Date.now() + 24 * 60 * 60 * 1000` ignores DST. Use Luxon: `DateTime.now().setZone(userTz).plus({ hours: window_hours }).toUTC()`.

---

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| VAPID key signing for Web Push | Custom JWT/EC signing | `web-push` (already installed) | VAPID has specific header format requirements and audience claim |
| IANA timezone deadline arithmetic | Raw millisecond offsets | Luxon `DateTime.setZone()` | DST transitions, `America/New_York` skips an hour — raw math breaks |
| Push payload encryption | Custom AES-128-GCM for push | `web-push` (does it internally) | RFC 8291 "Message Encryption for Web Push" is non-trivial |
| Notification scheduling | `cron` / `pg_cron` / Redis queues | `setInterval` poller reading `notification_thresholds` | Phase scope is simple; external scheduler adds ops overhead |
| Subscription deduplication | Custom endpoint comparison | Upsert on `notifications` table by `(user_id, subscription->>'endpoint')` | Endpoints can change silently; always upsert, never assume uniqueness |

**Key insight:** Web Push encryption (RFC 8291) is complex enough that hand-rolling it would take longer than implementing all other Phase 5 requirements combined. `web-push` already handles it and is already in the codebase.

---

## Common Pitfalls

### Pitfall 1: Check-in Racing the Wipe
**What goes wrong:** Poller marks state `pending_wipe`; simultaneously, a user submits a check-in entry. Without locking, both transactions read stale state and one wins arbitrarily.
**Why it happens:** PostgreSQL default isolation is Read Committed — two concurrent reads both see `state = 'active'`.
**How to avoid:** Use `SELECT ... FOR UPDATE` in a transaction for every state transition (both poller and check-in route). The lock ensures only one proceeds.
**Warning signs:** Entries accepted after deadline, or wipe triggered for users who checked in.

### Pitfall 2: iOS Push Subscription Silently Expires
**What goes wrong:** Push works initially but stops after days/weeks without explanation — no error, just undelivered notifications.
**Why it happens:** iOS Safari silently invalidates push subscriptions. The subscription endpoint returns 410 Gone from APNs, which `web-push` surfaces as a `WebPushError` with `statusCode: 410`.
**How to avoid:** Always re-subscribe on every app launch (NOTIF-04). On the server, handle 410/404 responses from push endpoints by deleting the stale subscription from `notifications`.
**Warning signs:** `webpush.sendNotification` throwing `WebPushError` with status 410.

### Pitfall 3: iOS Push Requires Home Screen Install
**What goes wrong:** `reg.pushManager` is `undefined` in Safari on a normal browser tab (non-installed).
**Why it happens:** Apple restricts Web Push to installed PWAs on iOS 16.4+. In a browser tab, `PushManager` is simply absent.
**How to avoid:** Check `navigator.standalone === true` or `matchMedia("(display-mode: standalone)").matches` before calling `pushManager.subscribe`. Show iOS install coaching UI if not installed (already done in Phase 4 with NOTIF-03 requirement).
**Warning signs:** `TypeError: Cannot read properties of undefined (reading 'subscribe')` in Safari.

### Pitfall 4: Stale Notification Subscriptions After Wipe
**What goes wrong:** After wipe, the server still sends notifications to a wiped user's subscription — confusing the user who sees "write now" notifications for a diary that no longer exists.
**Why it happens:** Subscription stored in `notifications` table is not cleaned up when `state = 'wiped'`.
**How to avoid:** In the wipe confirmation step, delete all rows from `notifications` for the user. Also: the shard deletion in Phase 6 will trigger the client cleanup, but the server side must stop notifying immediately.
**Warning signs:** Push notifications arriving after wipe screen is shown.

### Pitfall 5: DST Boundary Breaks Deadline
**What goes wrong:** A user with `window_hours = 24` who checks in at 10pm writes a deadline for "tomorrow 10pm," but DST transition makes the window 23h or 25h.
**Why it happens:** Raw `deadline_at = now() + INTERVAL '24 hours'` is UTC math — it is correct. The problem is in *display*, where the local time changes by 1h.
**How to avoid:** Always store `deadline_at` in UTC (PostgreSQL `TIMESTAMPTZ` — already the schema type). For display only, convert to the user's IANA timezone with Luxon. Never store local wall-clock time.
**Warning signs:** Users reporting deadline "moved" by 1 hour after clocks changed.

### Pitfall 6: `webpush.setVapidDetails` Called Once Per Request
**What goes wrong:** VAPID details must be set before `sendNotification`. If called inside a route handler, it works but mutates module-level state on every request — messy and fragile.
**How to avoid:** Call `webpush.setVapidDetails` once in the poller plugin's initialization, not in route handlers.

### Pitfall 7: Forgetting the Shard Gate on `/api/crypto/shard`
**What goes wrong:** A `pending_wipe` or `wiped` user calls `/api/crypto/shard` and gets their server shard — allowing them to reconstruct the DMK and read entries after the deadline.
**Why it happens:** `crypto.ts` has a `// TODO: Phase 5 will add deadline_state.state === 'active' check` comment — this was intentionally deferred.
**How to avoid:** In Phase 5, add the `state = 'active'` gate to `GET /api/crypto/shard` as the comment instructs. This is a required part of Plan 05-01.
**Warning signs:** Missing this makes the entire commitment device meaningless.

---

## Code Examples

### Sending a Push with `urgency: "high"` (NOTIF-06)
```typescript
// Source: web-push 3.6.7 src/web-push-constants.js — supportedUrgency: { HIGH: 'high' }
await webpush.sendNotification(subscription, payload, {
  urgency: "high",
  TTL: 3600, // 1 hour in seconds
});
```

### Computing Deadline in User's Timezone (DMS-04)
```typescript
// Source: Luxon docs — https://moment.github.io/luxon/api-docs/index.html#datetimesetzone
import { DateTime } from "luxon";

function computeDeadlineUTC(windowHours: number, ianaTimezone: string): Date {
  // Start from "now" in the user's timezone, add window, convert back to UTC
  const deadline = DateTime.now()
    .setZone(ianaTimezone)
    .plus({ hours: windowHours })
    .toUTC();
  return deadline.toJSDate();
}
```

### Threshold Check in Poller
```typescript
// For each user with state = 'active', compare remaining minutes to thresholds
const nowMs = Date.now();
const deadlineMs = deadlineAt.getTime();
const remainingMinutes = (deadlineMs - nowMs) / 60_000;

for (const threshold of thresholds) {
  // Check if we just crossed this threshold (within the last poll interval)
  const thresholdMs = deadlineMs - threshold.threshold_minutes * 60_000;
  const prevPollMs = nowMs - 60_000;
  if (thresholdMs >= prevPollMs && thresholdMs <= nowMs) {
    await sendDeadlineWarning(subscription, threshold.threshold_minutes, threshold.tone);
  }
}
```

### Soft-Ask Push Permission Pattern (NOTIF-07)
```tsx
// Rendered only after user has written at least one entry
function EnableNotificationsButton() {
  const [asked, setAsked] = useState(false);

  const handleClick = async () => {
    const permission = await Notification.requestPermission();
    setAsked(true);
    if (permission === "granted") {
      await subscribeIfInstalled(process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY!);
    }
  };

  if (asked) return null;
  return <button onClick={handleClick}>Enable deadline warnings</button>;
}
```

---

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| `moment-timezone` for IANA zones | `luxon` (built-in IANA support) | ~2020 | moment is maintenance-only; Luxon is the maintained successor |
| GCM for Android push | VAPID (RFC 8292) universal | 2017+ | One key pair works for Chrome, Firefox, and Safari — no GCM API key needed |
| iOS has no Web Push | iOS 16.4+ Web Push for installed PWAs | 2023 | Requires `add to home screen` — the Phase 4 install coaching already handles this |

**Deprecated/outdated:**
- `aesgcm` content encoding in web-push: Use `aes128gcm` (default in web-push 3.x) — older encoding still works but is deprecated per RFC 8291.
- GCM API key for Chrome push: No longer needed with VAPID.

---

## Open Questions

1. **`VAPID_CONTACT_EMAIL` environment variable**
   - What we know: `webpush.setVapidDetails` requires a subject (URL or `mailto:`). The push service uses it for abuse contact.
   - What's unclear: The existing `.env.example` doesn't have this variable.
   - Recommendation: Add `VAPID_CONTACT_EMAIL=admin@localhost` to `.env.example` with a comment. The push service won't reject `mailto:admin@localhost` for a local-only deployment.

2. **Notification threshold seeding at setup vs. first deadline_state insert**
   - What we know: `notification_thresholds` table exists but is never populated by any existing route.
   - What's unclear: Should defaults (24h, 4h, 1h, 15min) be seeded when the user sets up their first deadline, or later via a settings page (Phase 7)?
   - Recommendation: Seed default thresholds inside the `POST /api/deadline/settings` route on first write, checking `ON CONFLICT DO NOTHING`. Settings page (Phase 7) can update them later.

3. **`NEXT_PUBLIC_VAPID_PUBLIC_KEY` exposure to client**
   - What we know: The VAPID public key must be sent to the browser for `pushManager.subscribe`. It is public by design.
   - What's unclear: How to pass it from server to client in this Next.js + Docker setup.
   - Recommendation: Add `NEXT_PUBLIC_VAPID_PUBLIC_KEY` to `.env.example` and read it in the web app via `process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY`. In Docker Compose, set it as `ARG` + `ENV` in the web Dockerfile or pass via `environment:` in compose.

---

## Validation Architecture

### Test Framework
| Property | Value |
|----------|-------|
| Framework | vitest 4.1.8 |
| Config file (API) | `apps/api/vitest.config.ts` — `environment: "node"`, `include: ["src/**/*.test.ts"]` |
| Config file (Web) | `apps/web/vitest.config.ts` — `environment: "happy-dom"` |
| Quick run command (API) | `cd apps/api && npx vitest run` |
| Quick run command (Web) | `cd apps/web && npx vitest run` |
| Full suite command | `npx vitest run --project apps/api && npx vitest run --project apps/web` |

### Phase Requirements → Test Map

| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| DMS-03 | State machine transitions: active → pending_wipe → wiped | unit | `cd apps/api && npx vitest run src/lib/__tests__/deadline-engine.test.ts` | ❌ Wave 0 |
| DMS-05 | Poller calls `checkDeadlines` every 60s, clears on close | unit | `cd apps/api && npx vitest run src/plugins/__tests__/deadline-poller.test.ts` | ❌ Wave 0 |
| DMS-06 | Two-phase wipe: wipe_log written before shard delete | unit | `cd apps/api && npx vitest run src/lib/__tests__/deadline-engine.test.ts` | ❌ Wave 0 |
| DMS-07 | FOR UPDATE lock prevents concurrent check-in during wipe | unit (mock pool) | `cd apps/api && npx vitest run src/lib/__tests__/deadline-engine.test.ts` | ❌ Wave 0 |
| DMS-08 | Crash safety: wipe_log inserted before DELETE server_shards | unit | `cd apps/api && npx vitest run src/lib/__tests__/deadline-engine.test.ts` | ❌ Wave 0 |
| DMS-09 | Grace day: 429 when budget=0 within 7 days | unit | `cd apps/api && npx vitest run src/routes/__tests__/deadline.test.ts` | ❌ Wave 0 |
| DMS-09 | Grace day: budget resets after 7+ days | unit | `cd apps/api && npx vitest run src/routes/__tests__/deadline.test.ts` | ❌ Wave 0 |
| DMS-10 | Akrasia: weakening sets pending_effective_at = now+7d | unit | `cd apps/api && npx vitest run src/routes/__tests__/deadline.test.ts` | ❌ Wave 0 |
| DMS-10 | Akrasia: strengthening applies immediately | unit | `cd apps/api && npx vitest run src/routes/__tests__/deadline.test.ts` | ❌ Wave 0 |
| DMS-04 | Deadline UTC from IANA timezone is DST-correct | unit | `cd apps/api && npx vitest run src/lib/__tests__/deadline-engine.test.ts` | ❌ Wave 0 |
| NOTIF-01 | Threshold crossing detected within 60s window | unit | `cd apps/api && npx vitest run src/lib/__tests__/deadline-engine.test.ts` | ❌ Wave 0 |
| NOTIF-06 | `urgency: "high"` passed for non-gentle thresholds | unit (mock webpush) | `cd apps/api && npx vitest run src/lib/__tests__/notification-sender.test.ts` | ❌ Wave 0 |
| NOTIF-03 | `subscribeIfInstalled` no-ops when not standalone | unit | `cd apps/web && npx vitest run lib/__tests__/push.test.ts` | ❌ Wave 0 |
| NOTIF-04 | Re-subscribe unsubscribes existing before re-subscribing | unit | `cd apps/web && npx vitest run lib/__tests__/push.test.ts` | ❌ Wave 0 |
| DMS-01/02 | check-in rejected below `word_minimum` (already tested in entries.test.ts) | unit | `cd apps/api && npx vitest run src/routes/__tests__/entries.test.ts` | ✅ |

### Sampling Rate
- **Per task commit:** `cd apps/api && npx vitest run` (API tests only, ~5s)
- **Per wave merge:** Both `apps/api` and `apps/web` vitest suites green
- **Phase gate:** Full suite green before `/gsd:verify-work`

### Wave 0 Gaps
- [ ] `apps/api/src/lib/__tests__/deadline-engine.test.ts` — covers DMS-03, DMS-04, DMS-05, DMS-06, DMS-07, DMS-08, NOTIF-01
- [ ] `apps/api/src/lib/deadline-engine.ts` — pure function extracting state machine logic from poller (testable without Fastify)
- [ ] `apps/api/src/routes/__tests__/deadline.test.ts` — covers DMS-09, DMS-10, DMS-01, DMS-02 via HTTP layer
- [ ] `apps/api/src/lib/__tests__/notification-sender.test.ts` — covers NOTIF-06 with mocked `web-push`
- [ ] `apps/web/lib/__tests__/push.test.ts` — covers NOTIF-03, NOTIF-04 with mocked `navigator`

---

## Sources

### Primary (HIGH confidence)
- Codebase inspection: `apps/api/migrations/001.do.create-schema.sql` — confirmed schema for deadline_state, wipe_log, notifications, notification_thresholds
- Codebase inspection: `apps/api/package.json` — confirmed `web-push 3.6.7`, `fastify ^5.8`, `pg ^8.13.3` already in deps
- Codebase inspection: `node_modules/web-push/src/web-push-constants.js` — confirmed `urgency: 'high'` is a valid option
- Codebase inspection: `apps/api/src/routes/crypto.ts` — confirmed the TODO comment for Phase 5 `state = 'active'` gate
- Codebase inspection: `apps/api/src/boot/secrets.ts` — confirmed VAPID keys auto-generated at boot with `web-push.generateVAPIDKeys()`
- Codebase inspection: `apps/api/src/test-helpers/index.ts` — confirmed `mockPool` pattern for unit tests

### Secondary (MEDIUM confidence)
- MDN PushManager API — iOS 16.4+ Web Push requires installed PWA; `navigator.standalone` detection pattern
- Luxon documentation — `DateTime.setZone(ianaZone).plus({ hours })` for DST-correct arithmetic
- PostgreSQL documentation — `SELECT ... FOR UPDATE` row-level locking within transactions

### Tertiary (LOW confidence)
- iOS push subscription silent expiry behavior — documented by community; Apple does not publish exact TTL for subscriptions

---

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH — all packages already in place; only Luxon is new
- Architecture: HIGH — schema is fully built; patterns follow existing Fastify plugin conventions
- Pitfalls: HIGH — iOS push and race conditions are well-documented; wipe race is addressed by existing schema design
- Validation architecture: HIGH — vitest already configured for both apps; test patterns match existing tests

**Research date:** 2026-06-07
**Valid until:** 2026-09-07 (stable stack; iOS push behavior could shift on new OS releases)
