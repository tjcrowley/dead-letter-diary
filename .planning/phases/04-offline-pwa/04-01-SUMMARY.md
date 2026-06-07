---
phase: 04-offline-pwa
plan: "01"
subsystem: ui
tags: [pwa, service-worker, serwist, next.js, manifest, offline, wkwebview]

# Dependency graph
requires:
  - phase: 03-encryption-writing
    provides: layout.tsx foundation and writing surface established

provides:
  - Serwist-powered service worker with NetworkOnly for /api/* routes and app shell caching
  - PWA manifest with 192/512 icons and maskable purpose
  - Offline fallback page at /offline
  - WkWebViewGuard component blocking in-app browser access
  - InstallPrompt component for iOS coaching and desktop beforeinstallprompt
  - SwUpdateToast component with textarea-safe update guard
  - EncryptionBadge static component
  - PwaShell layout wrapper composing all PWA components

affects: [05-deadline-engine, 06-shard-security, 07-installer-ux]

# Tech tracking
tech-stack:
  added: ["@serwist/next@9.5.11", "serwist@9.5.11", "@testing-library/react@16.3.2", "@testing-library/jest-dom@6.9.1", "@vitejs/plugin-react"]
  patterns:
    - "Service worker source in app/sw.ts — separate compile target from app bundle"
    - "Pure helper extraction (isApiRoute) for SW logic testability"
    - "TDD for all components using happy-dom + @testing-library/react"
    - "WKWebView detection: Mobile/ present but Safari/ absent = in-app browser"

key-files:
  created:
    - apps/web/app/sw.ts
    - apps/web/app/manifest.ts
    - apps/web/app/offline/page.tsx
    - apps/web/lib/sw-route-matcher.ts
    - apps/web/lib/__tests__/sw-routing.test.ts
    - apps/web/components/WkWebViewGuard.tsx
    - apps/web/components/InstallPrompt.tsx
    - apps/web/components/SwUpdateToast.tsx
    - apps/web/components/EncryptionBadge.tsx
    - apps/web/components/PwaShell.tsx
    - apps/web/components/__tests__/WkWebViewGuard.test.tsx
    - apps/web/components/__tests__/InstallPrompt.test.tsx
    - apps/web/components/__tests__/SwUpdateToast.test.tsx
    - apps/web/public/icon-192x192.png
    - apps/web/public/icon-512x512.png
    - apps/web/public/apple-touch-icon.png
  modified:
    - apps/web/next.config.ts
    - apps/web/app/layout.tsx
    - apps/web/vitest.config.ts

key-decisions:
  - "Serwist disabled in dev (NODE_ENV !== production) — SW only active in production builds"
  - "isApiRoute() extracted to lib/sw-route-matcher.ts for testability — sw.ts cannot be imported in vitest"
  - "skipWaiting: false in Serwist — user-triggered updates only via SKIP_WAITING message (PWA-04)"
  - "Placeholder 1x1 PNGs for icons — real branded icons can be swapped without code changes"
  - "@vitejs/plugin-react added to vitest.config.ts to enable JSX parsing in .tsx test files"

patterns-established:
  - "TDD RED/GREEN for client components: write failing tests first, then implement"
  - "Navigator API mocking in vitest: Object.defineProperty(navigator, prop, { configurable: true })"
  - "act() imported from @testing-library/react, not vitest, for React state update wrapping"

requirements-completed: [PWA-01, PWA-02, PWA-03, PWA-04, PWA-05, PWA-06]

# Metrics
duration: 15min
completed: 2026-06-07
---

# Phase 4 Plan 01: PWA Foundation Summary

**Serwist service worker with NetworkOnly /api/* routing, manifest with maskable icons, WKWebView/iOS install guards, and SW update toast with textarea-safe guard**

## Performance

- **Duration:** ~15 min
- **Started:** 2026-06-07T20:08:51Z
- **Completed:** 2026-06-07T20:24:00Z
- **Tasks:** 2
- **Files modified:** 19

## Accomplishments

- Installed Serwist and wired `next.config.ts` with `withSerwistInit` (disabled in dev), SW source at `app/sw.ts` compiled to `public/sw.js`
- Created service worker with `NetworkOnly` handler for all `/api/*` routes before `defaultCache`, offline fallback to `/offline`, and user-triggered `SKIP_WAITING` via postMessage
- Created 5 platform-aware UI components: WkWebViewGuard (in-app browser detection), InstallPrompt (iOS coaching + desktop beforeinstallprompt), SwUpdateToast (update notification with textarea guard), EncryptionBadge, PwaShell
- All 44 tests pass across 7 test files including 3 new component test files

## Task Commits

Each task was committed atomically:

1. **Task 1: Serwist build integration, service worker, manifest, icons, offline page** - `3e253b5` (feat)
2. **Task 2: SW registration in layout, WKWebView guard, iOS install prompt, SW update toast, encryption badge** - `186de46` (feat)

## Files Created/Modified

- `apps/web/next.config.ts` — withSerwistInit wrapper, disabled in dev, git-rev revision for precache
- `apps/web/app/sw.ts` — Service worker: NetworkOnly first, defaultCache, skipWaiting false, SKIP_WAITING message handler
- `apps/web/app/manifest.ts` — PWA manifest with 192/512 icons, maskable purpose, standalone display
- `apps/web/app/offline/page.tsx` — Offline fallback page with dark theme
- `apps/web/lib/sw-route-matcher.ts` — Pure `isApiRoute()` helper extracted for testability
- `apps/web/lib/__tests__/sw-routing.test.ts` — Manifest shape + route matcher tests (12 tests)
- `apps/web/components/WkWebViewGuard.tsx` — Detects WKWebView/FBAN/Instagram UAs, blocks with redirect-to-Safari page
- `apps/web/components/InstallPrompt.tsx` — iOS coaching (Share > Add to Home Screen), desktop install prompt
- `apps/web/components/SwUpdateToast.tsx` — Waiting SW detection, update toast, hasUnsavedText guard
- `apps/web/components/EncryptionBadge.tsx` — Static "E2E encrypted" badge with SVG lock icon
- `apps/web/components/PwaShell.tsx` — Composes all PWA components as layout wrapper
- `apps/web/app/layout.tsx` — Adds apple-touch-icon link, wraps children in PwaShell
- `apps/web/vitest.config.ts` — Added @vitejs/plugin-react for JSX test parsing
- `apps/web/public/icon-192x192.png`, `icon-512x512.png`, `apple-touch-icon.png` — Placeholder PNGs
- Component test files: WkWebViewGuard, InstallPrompt, SwUpdateToast (12 tests each group)

## Decisions Made

- `skipWaiting: false` in Serwist — updates only happen when user clicks "Update now" in toast, never during active text editing (PWA-04 requirement)
- `isApiRoute()` extracted to a pure helper file because `sw.ts` uses a separate webworker compile target and cannot be imported in the normal vitest environment
- Serwist disabled in dev to avoid service worker interfering with hot module replacement during development
- Placeholder 1x1 black PNGs for icons — functionally valid, real branded icons can replace these without any code changes
- Added `@vitejs/plugin-react` to vitest.config.ts after discovering JSX in `.tsx` test files caused parse errors with the default rolldown parser

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] Added @vitejs/plugin-react to vitest.config.ts**
- **Found during:** Task 2 (component tests)
- **Issue:** JSX in .tsx test files caused "Unexpected JSX expression" parse errors — vitest rolldown parser doesn't handle JSX without a React plugin
- **Fix:** Installed `@vitejs/plugin-react` and added `plugins: [react()]` to vitest.config.ts
- **Files modified:** apps/web/vitest.config.ts, package.json
- **Verification:** All 44 tests pass
- **Committed in:** 186de46 (Task 2 commit)

**2. [Rule 1 - Bug] Fixed test queries for multi-element "Open in Safari" text**
- **Found during:** Task 2 (WkWebViewGuard tests)
- **Issue:** Both h1 and p paragraph contained "Open in Safari" — `getByText(/Open in Safari/i)` threw "Found multiple elements" error
- **Fix:** Changed test to use `getByRole("heading")` + `textContent` assertion instead of text search
- **Files modified:** components/__tests__/WkWebViewGuard.test.tsx
- **Verification:** WkWebViewGuard tests pass
- **Committed in:** 186de46

**3. [Rule 1 - Bug] Fixed act() import source in InstallPrompt test**
- **Found during:** Task 2 (InstallPrompt tests)
- **Issue:** `act` imported from `vitest` — not exported by vitest; must come from `@testing-library/react`
- **Fix:** Moved `act` to `@testing-library/react` import
- **Files modified:** components/__tests__/InstallPrompt.test.tsx
- **Verification:** InstallPrompt tests pass
- **Committed in:** 186de46

---

**Total deviations:** 3 auto-fixed (1 blocking, 2 bugs)
**Impact on plan:** All fixes necessary for tests to run. No scope creep.

## Issues Encountered

- `navigator.serviceWorker.addEventListener` not mocked in SwUpdateToast tests — fixed by adding `addEventListener` and `removeEventListener` to the mock object

## User Setup Required

None — no external service configuration required. Icons will need replacement with real branded assets before production launch.

## Next Phase Readiness

- PWA shell is fully operational; app is installable with proper SW caching
- Phase 4 Plan 02 (offline writes with Dexie) can now build on SW foundation
- Phase 4 Plan 03 (sync queue) depends on SW registration from this plan
- Real PWA icons (192x192, 512x512, apple-touch-icon) should be created before public launch

---
*Phase: 04-offline-pwa*
*Completed: 2026-06-07*
