---
phase: 5
slug: dead-mans-switch
status: draft
nyquist_compliant: false
wave_0_complete: false
created: 2026-06-07
---

# Phase 5 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | vitest |
| **Config file** | apps/api/vitest.config.ts |
| **Quick run command** | `npm test -- --run` |
| **Full suite command** | `npm test -- --run` |
| **Estimated runtime** | ~20 seconds |

---

## Sampling Rate

- **After every task commit:** Run `npm test -- --run`
- **After every plan wave:** Run `npm test -- --run`
- **Before `/gsd:verify-work`:** Full suite must be green
- **Max feedback latency:** 20 seconds

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|-----------|-------------------|-------------|--------|
| 5-01-01 | 01 | 1 | DMS-01, DMS-02 | unit | `npm test -- --run deadline-engine.test` | ❌ W0 | ⬜ pending |
| 5-01-02 | 01 | 1 | DMS-03, DMS-10 | unit | `npm test -- --run poller.test` | ❌ W0 | ⬜ pending |
| 5-02-01 | 02 | 2 | NOTIF-01, NOTIF-02, NOTIF-03 | unit | `npm test -- --run push-subscription.test` | ❌ W0 | ⬜ pending |
| 5-02-02 | 02 | 2 | NOTIF-04, NOTIF-05, NOTIF-06, NOTIF-07 | unit | `npm test -- --run push-escalation.test` | ❌ W0 | ⬜ pending |
| 5-03-01 | 03 | 2 | DMS-05, DMS-06 | unit | `npm test -- --run grace-days.test` | ❌ W0 | ⬜ pending |
| 5-03-02 | 03 | 2 | DMS-07, DMS-08, DMS-09 | unit | `npm test -- --run akrasia-horizon.test` | ❌ W0 | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

- [ ] `apps/api/src/__tests__/deadline-engine.test.ts` — stubs for DMS-01, DMS-02 (state machine transitions)
- [ ] `apps/api/src/__tests__/poller.test.ts` — stubs for DMS-03, DMS-10 (60s poller, crypto gate)
- [ ] `apps/api/src/__tests__/push-subscription.test.ts` — stubs for NOTIF-01–03 (subscribe/unsubscribe, iOS PWA gate)
- [ ] `apps/api/src/__tests__/push-escalation.test.ts` — stubs for NOTIF-04–07 (escalation thresholds, urgency, dedup)
- [ ] `apps/api/src/__tests__/grace-days.test.ts` — stubs for DMS-05, DMS-06 (grace invocation, weekly budget)
- [ ] `apps/api/src/__tests__/akrasia-horizon.test.ts` — stubs for DMS-07–09 (7-day advance, pending state, immediate strengthen)

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| Push notification received on iOS PWA | NOTIF-03 | Requires physical device + installed PWA | Install PWA on iOS 16.4+, trigger notification, verify delivery |
| Push escalation urgency visibly changes | NOTIF-06 | Requires real push delivery | Let deadline approach across thresholds, observe notification urgency in device settings |
| Grace day UI shows weekly budget | DMS-06 | Requires UI interaction | Open settings, invoke grace day, verify counter decrements |
| Akrasia Horizon 7-day advance enforced in UI | DMS-08 | Requires settings UI + date math | Attempt to weaken commitment, verify 7-day pending state shown |
| Two-phase wipe 60s settle window survives server restart | DMS-09 | Requires process restart during wipe | Initiate wipe, restart server before 60s, verify wipe completes on next poller tick |

---

## Validation Sign-Off

- [ ] All tasks have `<automated>` verify or Wave 0 dependencies
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify
- [ ] Wave 0 covers all MISSING references
- [ ] No watch-mode flags
- [ ] Feedback latency < 20s
- [ ] `nyquist_compliant: true` set in frontmatter

**Approval:** pending
