# Phase 4: Offline & PWA - Research

**Researched:** 2026-06-07
**Domain:** Service Workers (Serwist), PWA manifest, IndexedDB outbox sync, storage persistence, incognito detection
**Confidence:** HIGH

## Summary

Phase 4 makes Dead Letter Diary installable and fully offline-capable. The technology stack is well-established: Serwist (`@serwist/next` + `serwist`) wraps the Next.js build to inject a precache manifest and generate `public/sw.js`. The web app manifest is declared natively via Next.js's `app/manifest.ts` convention (no extra library needed). Offline writes already land in IndexedDB via Dexie.js (from Phase 3); Phase 4 adds an outbox table for pending server sync and a `window` `online` event listener that flushes it.

Three non-obvious constraints shape the design. First, the service worker MUST use `NetworkOnly` for all `/api/` routes — any caching of session or crypto endpoints would break the security model. Second, `navigator.storage.persist()` must be called on install to prevent browser eviction of IndexedDB data; on iOS Safari this is only granted when the app is already on the Home Screen. Third, incognito/private mode detection via quota heuristics is now actively defeated by Chrome (predictable quota) and Firefox (in-memory IDB); the only reliable cross-browser approach is attempting `indexedDB.open()` with a write followed by `StorageManager.persist()` and treating refusal as private mode — with a clear UX message as required by OFFLINE-05.

**Primary recommendation:** Use `@serwist/next` for SW generation with `NetworkOnly` on all `/api/*` and `/api/crypto/*` routes, `app/manifest.ts` for the manifest, extend the existing Dexie database with an `outbox` table for sync queue, use the `online` DOM event (with SW Background Sync as enhancement on Chromium) for flush, and call `navigator.storage.persist()` at PWA install time.

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|-----------------|
| OFFLINE-01 | Write surface works offline — entries saved to IndexedDB | Already implemented by Dexie `drafts` table in Phase 3; Phase 4 ensures SW caches app shell so page loads offline |
| OFFLINE-02 | Sync queue (outbox pattern) flushes when connection restored | Add `outbox` table to Dexie DB; flush on `window.addEventListener('online', ...)` + SW Background Sync fallback |
| OFFLINE-03 | Sync status indicator: "Synced" / "Saving..." / "Offline — N entries pending" | React state derived from `navigator.onLine`, Dexie `outbox.count()`, and in-flight fetch state |
| OFFLINE-04 | `navigator.storage.persist()` called on PWA install | Call in `beforeinstallprompt` handler and in `appinstalled` handler; iOS: call after standalone detection |
| OFFLINE-05 | Private/incognito mode detected — refuse to open diary | Attempt `indexedDB.open()` write; on security error OR `storage.persist()` returning false with no user prompt → show refusal screen |
| OFFLINE-06 | Storage quota monitoring with compression and user-visible usage display | `navigator.storage.estimate()` → `{usage, quota}`; show in settings; CompressionStream not needed (entries already AES-GCM ciphertext, incompressible) |
| PWA-01 | Installable PWA with manifest, icons, splash screens | `app/manifest.ts` (Next.js built-in); icons at 192/512 PNG + maskable; iOS needs `<link rel="apple-touch-icon">` in layout.tsx |
| PWA-02 | Serwist SW — app shell cached, crypto endpoints NetworkOnly | `@serwist/next` with `swSrc: "app/sw.ts"`; `NetworkOnly` matcher for `url.pathname.startsWith("/api/")` placed BEFORE `defaultCache` |
| PWA-03 | iOS "Add to Home Screen" coaching with instructions | `InstallPrompt` component: detect iOS UA + not standalone → show step-by-step with Share button icon |
| PWA-04 | SW update handled gracefully — "update available" toast, no mid-write activation | Set `skipWaiting: false` in Serwist; listen for `waiting` SW event; show toast; only call `skipWaiting()` when user confirms and textarea is empty |
| PWA-05 | WKWebView detection → redirect to Safari with instructions | Detect `navigator.userAgent` contains `(iPhone|iPad)` without `Safari/` or with in-app browser signals; show redirect page |
| PWA-06 | Encryption status badge visible ("End-to-end encrypted") | Static UI badge in layout; no dynamic logic needed |
</phase_requirements>

## Standard Stack

### Core
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| `@serwist/next` | ^9.x (latest) | Next.js build plugin — injects precache manifest, generates `public/sw.js` | Successor to next-pwa; official Next.js docs recommend Serwist for offline; webpack-required |
| `serwist` | ^9.x (same version) | Runtime SW library — `NetworkOnly`, `CacheFirst`, `StaleWhileRevalidate`, `Serwist` class | Workbox spiritual successor; used as devDependency (SW code only) |
| Next.js `app/manifest.ts` | Built-in (Next 15) | Web app manifest served at `/manifest.webmanifest` | No extra package; type-safe via `MetadataRoute.Manifest` |
| Dexie.js | ^4.4.3 (already installed) | IndexedDB wrapper — extend with `outbox` table | Already in use from Phase 3 |

### Supporting
| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| `fake-indexeddb` | ^6.x (already installed) | Vitest test environment for IDB | Already used in `db.test.ts` |

### Alternatives Considered
| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| `@serwist/next` | Manual `public/sw.js` | Manual SW doesn't get precache manifest injection; much more boilerplate |
| `@serwist/next` | `next-pwa` (shadowwalker fork) | next-pwa is unmaintained; Serwist is the active successor |
| `window.online` event | SW Background Sync only | Background Sync is Chromium-only; `online` event works everywhere; use both |

**Installation:**
```bash
npm install @serwist/next
npm install --save-dev serwist
```

Note: `@serwist/next` requires webpack (not Turbopack) for the build that generates `sw.js`. The project's `next.config.ts` currently uses `output: "standalone"`. Serwist is compatible with standalone output — the generated `public/sw.js` is a static file served directly.

**Important:** The dev script uses `--turbopack` but Serwist must be disabled in development (`disable: process.env.NODE_ENV !== "production"`). The production build uses `npx next build` (no `--turbopack`) per the Phase 1 decision, so Serwist's webpack requirement is satisfied in production.

## Architecture Patterns

### Recommended Project Structure (additions to existing)
```
apps/web/
├── app/
│   ├── manifest.ts          # PWA manifest (new)
│   ├── sw.ts                # Service worker source (new, compiled to public/sw.js)
│   └── layout.tsx           # Add apple-touch-icon link + SW registration
├── lib/
│   ├── db.ts                # Extend: add outbox table (existing)
│   ├── sync.ts              # Outbox flush logic (new)
│   └── storage.ts           # persist() + estimate() + incognito detection (new)
├── components/
│   ├── SyncStatus.tsx        # "Synced/Saving.../Offline—N pending" (new)
│   ├── InstallPrompt.tsx     # iOS coaching + beforeinstallprompt (new)
│   └── SwUpdateToast.tsx     # SW update notification (new)
└── public/
    ├── sw.js                # Generated by Serwist build (do not edit)
    ├── icon-192x192.png     # Required (new)
    ├── icon-512x512.png     # Required (new)
    └── apple-touch-icon.png # 180x180, iOS home screen (new)
```

### Pattern 1: Serwist next.config.ts Integration
**What:** Wrap `nextConfig` with `withSerwistInit` to inject precache manifest at build time.
**When to use:** Always — this is the only way to get automatic precaching with Next.js.
**Example:**
```typescript
// Source: https://serwist.pages.dev/docs/next/getting-started
// apps/web/next.config.ts
import { spawnSync } from "node:child_process";
import { randomUUID } from "node:crypto";
import withSerwistInit from "@serwist/next";
import type { NextConfig } from "next";

const revision =
  spawnSync("git", ["rev-parse", "HEAD"], { encoding: "utf-8" }).stdout.trim() ||
  randomUUID();

const withSerwist = withSerwistInit({
  swSrc: "app/sw.ts",
  swDest: "public/sw.js",
  additionalPrecacheEntries: [{ url: "/offline", revision }],
  disable: process.env.NODE_ENV !== "production",
});

const nextConfig: NextConfig = {
  output: "standalone",
};

export default withSerwist(nextConfig);
```

### Pattern 2: Service Worker with NetworkOnly for API Routes
**What:** All `/api/*` routes bypass the cache entirely. App shell routes use Serwist's `defaultCache`.
**When to use:** Always — crypto and session endpoints must never be served from cache.
**Example:**
```typescript
// Source: pattern confirmed via serwist.pages.dev/docs/serwist/runtime-caching/caching-strategies/network-only
// apps/web/app/sw.ts
/// <reference lib="webworker" />

import { defaultCache } from "@serwist/next/worker";
import type { PrecacheEntry, RuntimeCaching, SerwistGlobalConfig } from "serwist";
import { NetworkOnly, Serwist } from "serwist";

declare global {
  interface WorkerGlobalScope extends SerwistGlobalConfig {
    __SW_MANIFEST: (PrecacheEntry | string)[] | undefined;
  }
}

declare const self: ServiceWorkerGlobalScope;

// CRITICAL: NetworkOnly entries MUST appear before defaultCache
const runtimeCaching: RuntimeCaching[] = [
  {
    matcher: ({ url }) => url.pathname.startsWith("/api/"),
    handler: new NetworkOnly(),
  },
  ...defaultCache,
];

const serwist = new Serwist({
  precacheEntries: self.__SW_MANIFEST,
  precacheOptions: { cleanupOutdatedCaches: true },
  skipWaiting: false,  // PWA-04: manual update control
  clientsClaim: true,
  navigationPreload: true,
  runtimeCaching,
  fallbacks: {
    entries: [
      {
        url: "/offline",
        matcher({ request }) {
          return request.mode === "navigate";
        },
      },
    ],
  },
});

serwist.addEventListeners();
```

### Pattern 3: Outbox Sync Queue (Dexie Extension)
**What:** Extend the existing Dexie DB with an `outbox` table. Each pending server submission is an outbox row. Flush on `online` event.
**When to use:** OFFLINE-02 — encrypted entry needs to reach the server but connection is unavailable.
**Example:**
```typescript
// apps/web/lib/db.ts (extended)
export interface OutboxEntry {
  id: string;           // same as DraftEntry.id
  ciphertext: ArrayBuffer;
  iv: Uint8Array;
  aad: Uint8Array;
  wordCount: number;
  queuedAt: number;
  attempts: number;
}

class DeadLetterDiaryDB extends Dexie {
  drafts!: Table<DraftEntry, string>;
  outbox!: Table<OutboxEntry, string>;

  constructor() {
    super("DeadLetterDiary");
    this.version(1).stores({ drafts: "id, updatedAt" });
    this.version(2).stores({
      drafts: "id, updatedAt",
      outbox: "id, queuedAt",
    });
  }
}
```

### Pattern 4: Incognito Detection
**What:** Attempt an IndexedDB write plus `storage.persist()`. If both fail (SecurityError or persist returns false without user interaction), treat as private mode.
**When to use:** On every page load before showing diary content.
**Example:**
```typescript
// apps/web/lib/storage.ts
export async function detectPrivateMode(): Promise<boolean> {
  try {
    // Attempt a write — throws SecurityError in some private modes
    const req = indexedDB.open("__priv_test__", 1);
    await new Promise<void>((resolve, reject) => {
      req.onerror = () => reject(req.error);
      req.onsuccess = () => {
        req.result.close();
        indexedDB.deleteDatabase("__priv_test__");
        resolve();
      };
    });
    // persist() returning false in a non-interactive context is an additional signal
    // but NOT definitive — some browsers always return false without user install
    return false;
  } catch {
    return true; // SecurityError = private mode
  }
}
```

**Note:** Chrome 2025 defeats quota-based detection by reporting a fixed artificial quota. Do NOT rely on `storage.estimate().quota` threshold comparisons. The SecurityError on `indexedDB.open()` is the only reliable signal — and it only works in some browser/mode combinations (Safari private, some Firefox configs). Display the refusal screen on SecurityError; do not gate on estimated quota.

### Pattern 5: PWA Manifest (Next.js built-in)
**What:** `app/manifest.ts` exports a function returning `MetadataRoute.Manifest`. Next.js serves it at `/manifest.webmanifest` and auto-links it in `<head>`.
**Example:**
```typescript
// apps/web/app/manifest.ts
// Source: https://nextjs.org/docs/app/guides/progressive-web-apps
import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Dead Letter Diary",
    short_name: "Dead Letter",
    description: "A diary with a cryptographic dead man's switch",
    start_url: "/",
    display: "standalone",
    background_color: "#0a0a0a",
    theme_color: "#0a0a0a",
    icons: [
      { src: "/icon-192x192.png", sizes: "192x192", type: "image/png" },
      { src: "/icon-512x512.png", sizes: "512x512", type: "image/png" },
      {
        src: "/icon-512x512.png",
        sizes: "512x512",
        type: "image/png",
        purpose: "maskable",
      },
    ],
  };
}
```

Also add to `app/layout.tsx`:
```html
<link rel="apple-touch-icon" href="/apple-touch-icon.png" />
```

### Anti-Patterns to Avoid
- **Caching `/api/*` routes with any strategy other than NetworkOnly:** A cached session token or crypto response would serve stale/wrong data silently.
- **Setting `skipWaiting: true` in Serwist:** This activates a new SW immediately, potentially mid-write. Use `skipWaiting: false` and notify the user via toast.
- **Using `reloadOnOnline: true`:** Forces a full page reload when connection restores, discarding unsaved text. Keep `reloadOnOnline: false`.
- **Relying on quota heuristics for incognito detection:** Chrome 2025+ reports a fixed artificial quota in all modes. Use SecurityError approach only.
- **Adding `outbox` in DB version 1:** The existing `drafts` table is version 1. Adding `outbox` requires bumping to version 2 — Dexie handles migration automatically when the version number increases.

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| SW precache manifest generation | Custom webpack plugin or manual manifest | `@serwist/next` | Content hashing, revision tracking, cleanup of outdated caches — all handled |
| SW caching strategies | Custom fetch event handlers | `serwist` `NetworkOnly`, `CacheFirst`, `StaleWhileRevalidate` | Race conditions, cache expiration, error handling are well-tested in Workbox lineage |
| PWA manifest linking | Manual `<link rel="manifest">` in layout | `app/manifest.ts` Next.js convention | Auto-linked by Next.js; type-safe; no manual head management |
| IndexedDB CRUD boilerplate | Raw IDB transactions | Dexie (already installed) | Already used for `drafts`; same pattern for `outbox` |

**Key insight:** Service worker caching is deceptively complex — the order of `runtimeCaching` entries matters (first match wins), stale-while-revalidate can serve old HTML with new JS chunks (causing chunk load errors), and Background Sync has no Safari support. Serwist's `defaultCache` handles these ordering and expiry concerns; custom SW code should only add the `NetworkOnly` API overrides before it.

## Common Pitfalls

### Pitfall 1: Turbopack Build Breaks Serwist
**What goes wrong:** `@serwist/next` requires webpack. If the production build uses `--turbopack`, the `__SW_MANIFEST` injection doesn't happen and `sw.ts` fails to compile.
**Why it happens:** Serwist's Next.js plugin hooks into webpack's compilation lifecycle.
**How to avoid:** Keep `disable: process.env.NODE_ENV !== "production"` in Serwist config. Production Docker build uses `npx next build` (no `--turbopack`) per Phase 1 decision — this is already correct.
**Warning signs:** `self.__SW_MANIFEST` is `undefined` at runtime; precaching silently does nothing.

### Pitfall 2: API Routes Cached by defaultCache
**What goes wrong:** A fetch to `/api/entries` is served from cache after an auth change, returning data for the wrong session.
**Why it happens:** `defaultCache` uses `NetworkFirst` for same-origin requests by default.
**How to avoid:** Place the `NetworkOnly` matcher for `/api/` as the FIRST entry in `runtimeCaching` — before spreading `defaultCache`. First match wins.
**Warning signs:** Stale API responses in DevTools Network tab showing `(ServiceWorker)` source.

### Pitfall 3: IndexedDB Version Conflict
**What goes wrong:** Dexie throws `VersionError` because `outbox` table is added without a version bump.
**Why it happens:** The Phase 3 DB is at version 1 with only `drafts`. Adding a new table requires `version(2).stores({...})`.
**How to avoid:** Add `this.version(2).stores({ drafts: "id, updatedAt", outbox: "id, queuedAt" })` alongside the existing version 1 declaration. Dexie upgrades automatically.
**Warning signs:** `Dexie.VersionError: Version X is older than the existing database` console error.

### Pitfall 4: iOS Storage Persist Timing
**What goes wrong:** `navigator.storage.persist()` returns `false` on iOS even after install.
**Why it happens:** On iOS Safari, persistent storage is granted only when the user has added the app to Home Screen AND the call is made from a user gesture or from within the installed standalone context.
**How to avoid:** Call `persist()` inside the `appinstalled` event handler AND on each launch when `window.matchMedia('(display-mode: standalone)').matches`. Do not treat `false` from the browser-tab context as private mode.
**Warning signs:** Storage.persist() always returns false even in regular Safari.

### Pitfall 5: SW Update Activation Wipes In-Progress Write
**What goes wrong:** A new SW activates mid-write (between keystrokes and auto-save), triggering a page reload that loses the current draft.
**Why it happens:** `skipWaiting: true` makes the new SW take control immediately.
**How to avoid:** Set `skipWaiting: false`. Show an "Update available" toast only when the write surface is empty (check `textarea.value.length === 0`) or when the user explicitly navigates away. The SW update flow: detect `registration.waiting` → show toast → on user confirm → post `SKIP_WAITING` message → SW calls `self.skipWaiting()` → page reloads.
**Warning signs:** User reports losing text after an update.

### Pitfall 6: WKWebView Blocks Service Worker
**What goes wrong:** The diary loads in an in-app browser (WKWebView) without SW support, and IndexedDB may also be restricted.
**Why it happens:** Apps like Instagram, Twitter, LinkedIn open links in WKWebView, not Safari. WKWebView does not support Service Workers unless App-Bound Domains is configured by the native app.
**How to avoid:** Detect WKWebView by checking UA for `iPhone|iPad` + absence of proper `Safari/` version token OR presence of known in-app browser tokens. Show a redirect page: "Open in Safari to use Dead Letter Diary."
**Warning signs:** SW registration fails silently; no `serviceWorker` in `navigator`.

## Code Examples

### SW Registration with Update Detection
```typescript
// Source: pattern from https://developer.chrome.com/docs/workbox/handling-service-worker-updates
// apps/web/app/layout.tsx (client component hook)
"use client";
import { useEffect } from "react";

export function useServiceWorker(onUpdateAvailable: () => void) {
  useEffect(() => {
    if (typeof window === "undefined" || !("serviceWorker" in navigator)) return;

    navigator.serviceWorker.register("/sw.js", {
      scope: "/",
      updateViaCache: "none",
    }).then((registration) => {
      if (registration.waiting) {
        onUpdateAvailable();
      }
      registration.addEventListener("updatefound", () => {
        const newWorker = registration.installing;
        newWorker?.addEventListener("statechange", () => {
          if (newWorker.state === "installed" && registration.waiting) {
            onUpdateAvailable();
          }
        });
      });
    });
  }, [onUpdateAvailable]);
}

// To activate: registration.waiting.postMessage({ type: "SKIP_WAITING" })
```

### Sync Status Derivation
```typescript
// apps/web/lib/sync.ts
import { db } from "./db";

export type SyncStatus =
  | { state: "synced" }
  | { state: "saving" }
  | { state: "offline"; pendingCount: number };

export async function getSyncStatus(
  isSaving: boolean,
): Promise<SyncStatus> {
  if (isSaving) return { state: "saving" };
  const pendingCount = await db.outbox.count();
  if (!navigator.onLine && pendingCount > 0) {
    return { state: "offline", pendingCount };
  }
  if (pendingCount > 0) return { state: "saving" }; // online but queue not flushed yet
  return { state: "synced" };
}

export async function flushOutbox(
  submitFn: (entry: OutboxEntry) => Promise<void>,
): Promise<void> {
  const pending = await db.outbox.orderBy("queuedAt").toArray();
  for (const entry of pending) {
    try {
      await submitFn(entry);
      await db.outbox.delete(entry.id);
    } catch {
      await db.outbox.update(entry.id, { attempts: entry.attempts + 1 });
    }
  }
}
```

### Storage Quota Display
```typescript
// Source: https://developer.mozilla.org/en-US/docs/Web/API/StorageManager/estimate
export async function getStorageInfo(): Promise<{
  usedMb: number;
  quotaMb: number;
  percentUsed: number;
} | null> {
  if (!navigator.storage?.estimate) return null;
  const { usage = 0, quota = 0 } = await navigator.storage.estimate();
  return {
    usedMb: Math.round(usage / 1024 / 1024),
    quotaMb: Math.round(quota / 1024 / 1024),
    percentUsed: quota > 0 ? Math.round((usage / quota) * 100) : 0,
  };
}
```

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| `next-pwa` (shadowwalker) | `@serwist/next` | 2023 | next-pwa abandoned; Serwist is active fork with Workbox v7 alignment |
| Manual `public/manifest.json` | `app/manifest.ts` Next.js convention | Next.js 14+ | Type-safe, auto-linked, no `<link>` in layout needed |
| Quota-threshold incognito detection | Not reliably possible | Chrome 2024–2025 | Chrome reports artificial quota; only SecurityError on IDB open is viable signal |
| `next-pwa` `register.js` | `navigator.serviceWorker.register()` in layout | Serwist v9 | Registration is explicit in app code, not auto-injected |
| `skipWaiting: true` by default | `skipWaiting: false` + user-triggered | PWA best practices 2024+ | Prevents mid-write disruption |

**Deprecated/outdated:**
- `next-pwa` (shadowwalker/next-pwa): unmaintained, do not use
- `workbox-webpack-plugin` directly: superseded by Serwist
- `dexie-observable` / `dexie-syncable`: deprecated by Dexie team; use manual outbox pattern

## Open Questions

1. **Compression of stored ciphertext (OFFLINE-06)**
   - What we know: AES-GCM ciphertext is cryptographically random and incompressible
   - What's unclear: Whether OFFLINE-06 intends compression of the raw plaintext before encryption (would help) or of the stored ciphertext (would not help)
   - Recommendation: Treat OFFLINE-06 as: display `storage.estimate()` usage; no compression of ciphertext. If plaintext compression is wanted, it must happen before `encrypt()` in the crypto pipeline — and Phase 3 did not include it. Skip compression; report storage usage only.

2. **Background Sync on Safari (OFFLINE-02)**
   - What we know: Background Sync API is Chromium-only; Firefox keeps it behind a flag; Safari has no support as of 2025
   - What's unclear: Whether to register a Background Sync tag at all or rely solely on `window.online` event
   - Recommendation: Use `window.addEventListener('online', flushOutbox)` as the primary mechanism (works everywhere). Register a Background Sync tag if `registration.sync` exists, as an enhancement for Chromium. Don't gate the feature on Background Sync availability.

## Validation Architecture

### Test Framework
| Property | Value |
|----------|-------|
| Framework | Vitest ^4.1.8 |
| Config file | `apps/web/vitest.config.ts` (environment: happy-dom) |
| Quick run command | `cd apps/web && npx vitest run` |
| Full suite command | `cd apps/web && npx vitest run --reporter=verbose` |

### Phase Requirements → Test Map
| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| OFFLINE-01 | App shell loads from SW cache offline | smoke (manual) | manual — requires real browser + SW | ❌ Wave 0 (manual only) |
| OFFLINE-02 | Outbox flushes entries when online restores | unit | `npx vitest run lib/__tests__/sync.test.ts` | ❌ Wave 0 |
| OFFLINE-03 | SyncStatus returns correct state for saving/offline/synced | unit | `npx vitest run lib/__tests__/sync.test.ts` | ❌ Wave 0 |
| OFFLINE-04 | `navigator.storage.persist()` called on install | manual | manual — browser API | manual only |
| OFFLINE-05 | `detectPrivateMode()` returns true on IDB SecurityError | unit | `npx vitest run lib/__tests__/storage.test.ts` | ❌ Wave 0 |
| OFFLINE-06 | `getStorageInfo()` returns usage/quota numbers | unit | `npx vitest run lib/__tests__/storage.test.ts` | ❌ Wave 0 |
| PWA-01 | manifest.ts exports required icon sizes | unit | `npx vitest run app/__tests__/manifest.test.ts` | ❌ Wave 0 |
| PWA-02 | NetworkOnly matcher covers /api/ routes | unit (mock fetch) | `npx vitest run app/__tests__/sw-routing.test.ts` | ❌ Wave 0 |
| PWA-03 | InstallPrompt shows iOS instructions when on iOS + not standalone | unit | `npx vitest run components/__tests__/InstallPrompt.test.tsx` | ❌ Wave 0 |
| PWA-04 | SW update toast shown; skipWaiting not called automatically | unit (mock SW) | `npx vitest run components/__tests__/SwUpdateToast.test.tsx` | ❌ Wave 0 |
| PWA-05 | WKWebView user agent triggers redirect component | unit | `npx vitest run components/__tests__/WkWebViewGuard.test.tsx` | ❌ Wave 0 |
| PWA-06 | Encryption badge renders in layout | unit | covered by existing layout render test or new smoke | ❌ Wave 0 |

### Sampling Rate
- **Per task commit:** `cd apps/web && npx vitest run`
- **Per wave merge:** `cd apps/web && npx vitest run --reporter=verbose`
- **Phase gate:** Full suite green before `/gsd:verify-work`

### Wave 0 Gaps
- [ ] `apps/web/lib/__tests__/sync.test.ts` — covers OFFLINE-02, OFFLINE-03
- [ ] `apps/web/lib/__tests__/storage.test.ts` — covers OFFLINE-05, OFFLINE-06
- [ ] `apps/web/app/__tests__/manifest.test.ts` — covers PWA-01
- [ ] `apps/web/app/__tests__/sw-routing.test.ts` — covers PWA-02
- [ ] `apps/web/components/__tests__/InstallPrompt.test.tsx` — covers PWA-03
- [ ] `apps/web/components/__tests__/SwUpdateToast.test.tsx` — covers PWA-04
- [ ] `apps/web/components/__tests__/WkWebViewGuard.test.tsx` — covers PWA-05

## Sources

### Primary (HIGH confidence)
- Next.js official PWA guide (https://nextjs.org/docs/app/guides/progressive-web-apps) — manifest.ts, SW registration, security headers, install prompt patterns
- MDN StorageManager.persist() (https://developer.mozilla.org/en-US/docs/Web/API/StorageManager/persist) — persist() behavior per browser
- MDN Storage quotas and eviction (https://developer.mozilla.org/en-US/docs/Web/API/Storage_API/Storage_quotas_and_eviction_criteria) — eviction policy details

### Secondary (MEDIUM confidence)
- Serwist getting-started page (https://serwist.pages.dev/docs/next/getting-started) — confirmed via multiple derivative articles; direct fetch failed (ECONNREFUSED in research environment)
- Rajesh Biswas, Medium Apr 2026 (https://rajesh-biswas.medium.com/how-i-set-up-a-pwa-in-next-js-app-router-typescript-with-serwist-50f55e698ad5) — complete sw.ts pattern with NetworkOnly, confirmed against official Serwist docs structure
- Chris Suke, DEV Community (https://dev.to/sukechris/building-offline-apps-with-nextjs-and-serwist-2cbj) — `reloadOnOnline: false` pitfall, development disable pattern

### Tertiary (LOW confidence — needs validation)
- Chrome Chromium blink-dev thread on predictable quota (https://groups.google.com/a/chromium.org/g/blink-dev/c/7q0YGQNVkjs/) — incognito quota detection defeated; confirm by testing actual Chrome behavior

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH — Serwist is the documented successor to next-pwa; Next.js manifest.ts is in official docs; Dexie already installed
- Architecture: HIGH — SW NetworkOnly pattern is confirmed from working code examples from 2026 articles
- Pitfalls: HIGH for turbopack/webpack, DB versioning, skipWaiting timing; MEDIUM for iOS persist timing (browser-specific)
- Incognito detection: MEDIUM — quota approach confirmed defeated; SecurityError approach confirmed as the only signal but not exhaustive

**Research date:** 2026-06-07
**Valid until:** 2026-09-07 (stable APIs; Serwist versioning may change faster)
