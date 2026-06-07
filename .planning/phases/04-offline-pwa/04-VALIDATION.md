---
phase: 4
slug: offline-pwa
status: draft
nyquist_compliant: false
wave_0_complete: false
created: 2026-06-07
---

# Phase 4 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | vitest |
| **Config file** | vitest.config.ts |
| **Quick run command** | `npm test -- --run` |
| **Full suite command** | `npm test -- --run` |
| **Estimated runtime** | ~15 seconds |

---

## Sampling Rate

- **After every task commit:** Run `npm test -- --run`
- **After every plan wave:** Run `npm test -- --run`
- **Before `/gsd:verify-work`:** Full suite must be green
- **Max feedback latency:** 15 seconds

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|-----------|-------------------|-------------|--------|
| 4-01-01 | 01 | 1 | PWA-02 | integration | `npm test -- --run sw.test` | ❌ W0 | ⬜ pending |
| 4-01-02 | 01 | 1 | PWA-01 | manual | see Manual-Only | n/a | ⬜ pending |
| 4-01-03 | 01 | 1 | PWA-04 | unit | `npm test -- --run sw-update.test` | ❌ W0 | ⬜ pending |
| 4-01-04 | 01 | 1 | PWA-03 | unit | `npm test -- --run install-prompt.test` | ❌ W0 | ⬜ pending |
| 4-01-05 | 01 | 1 | PWA-05 | unit | `npm test -- --run wkwebview.test` | ❌ W0 | ⬜ pending |
| 4-01-06 | 01 | 1 | PWA-06 | unit | `npm test -- --run encryption-badge.test` | ❌ W0 | ⬜ pending |
| 4-02-01 | 02 | 2 | OFFLINE-01 | unit | `npm test -- --run outbox.test` | ❌ W0 | ⬜ pending |
| 4-02-02 | 02 | 2 | OFFLINE-02 | unit | `npm test -- --run sync-queue.test` | ❌ W0 | ⬜ pending |
| 4-02-03 | 02 | 2 | OFFLINE-03 | unit | `npm test -- --run sync-status.test` | ❌ W0 | ⬜ pending |
| 4-03-01 | 03 | 2 | OFFLINE-04 | unit | `npm test -- --run storage-persist.test` | ❌ W0 | ⬜ pending |
| 4-03-02 | 03 | 2 | OFFLINE-05 | unit | `npm test -- --run incognito-detection.test` | ❌ W0 | ⬜ pending |
| 4-03-03 | 03 | 2 | OFFLINE-06 | unit | `npm test -- --run storage-quota.test` | ❌ W0 | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

- [ ] `__tests__/sw.test.ts` — stubs for PWA-02 (NetworkOnly routing)
- [ ] `__tests__/sw-update.test.ts` — stubs for PWA-04 (skipWaiting toast)
- [ ] `__tests__/install-prompt.test.ts` — stubs for PWA-03 (iOS coaching)
- [ ] `__tests__/wkwebview.test.ts` — stubs for PWA-05 (WKWebView detection)
- [ ] `__tests__/encryption-badge.test.ts` — stubs for PWA-06 (badge render)
- [ ] `__tests__/outbox.test.ts` — stubs for OFFLINE-01/02 (Dexie outbox table)
- [ ] `__tests__/sync-queue.test.ts` — stubs for OFFLINE-02 (flush on online)
- [ ] `__tests__/sync-status.test.ts` — stubs for OFFLINE-03 (status indicator states)
- [ ] `__tests__/storage-persist.test.ts` — stubs for OFFLINE-04 (persist() call)
- [ ] `__tests__/incognito-detection.test.ts` — stubs for OFFLINE-05 (SecurityError path)
- [ ] `__tests__/storage-quota.test.ts` — stubs for OFFLINE-06 (estimate() display)

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| PWA installs on iOS home screen with correct icon | PWA-01 | Requires physical device / Safari | Add to Home Screen on iPhone; verify icon, name, splash |
| PWA installs on Android with manifest icons | PWA-01 | Requires Chrome Android | Install via Chrome; verify 192/512 icons and maskable |
| App loads offline after SW registration | PWA-02 | Requires DevTools Network throttle | Install PWA, go offline in DevTools, reload; verify app shell loads |
| SW update toast appears on new deploy | PWA-04 | Requires two SW versions running | Deploy new SW, reopen app; verify toast without auto-reload |
| iOS coaching sheet appears in Safari (not standalone) | PWA-03 | Requires Safari on iPhone | Open in Safari; verify share icon instructions appear |

---

## Validation Sign-Off

- [ ] All tasks have `<automated>` verify or Wave 0 dependencies
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify
- [ ] Wave 0 covers all MISSING references
- [ ] No watch-mode flags
- [ ] Feedback latency < 15s
- [ ] `nyquist_compliant: true` set in frontmatter

**Approval:** pending
