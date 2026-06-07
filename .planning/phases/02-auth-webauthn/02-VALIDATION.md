---
phase: 2
slug: auth-webauthn
status: draft
nyquist_compliant: false
wave_0_complete: false
created: 2026-06-06
---

# Phase 2 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | vitest (not yet installed — Wave 0) |
| **Config file** | none — Wave 0 installs |
| **Quick run command** | `npx vitest run --reporter=verbose` |
| **Full suite command** | `npx vitest run` |
| **Estimated runtime** | ~5 seconds |

---

## Sampling Rate

- **After every task commit:** Run `npx vitest run --reporter=verbose`
- **After every plan wave:** Run `npx vitest run`
- **Before `/gsd:verify-work`:** Full suite must be green
- **Max feedback latency:** 5 seconds

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|-----------|-------------------|-------------|--------|
| 02-01-01 | 01 | 1 | AUTH-01 | unit | `npx vitest run apps/api/src/routes/__tests__/auth.test.ts -t "register"` | ❌ W0 | ⬜ pending |
| 02-01-02 | 01 | 1 | AUTH-04 | unit | `npx vitest run apps/api/src/routes/__tests__/auth.test.ts -t "unlock"` | ❌ W0 | ⬜ pending |
| 02-02-01 | 02 | 1 | AUTH-02 | unit | `npx vitest run apps/api/src/routes/__tests__/webauthn.test.ts -t "register"` | ❌ W0 | ⬜ pending |
| 02-02-02 | 02 | 1 | AUTH-03 | unit | `npx vitest run apps/api/src/routes/__tests__/webauthn.test.ts -t "authenticate"` | ❌ W0 | ⬜ pending |
| 02-02-03 | 02 | 1 | AUTH-07 | unit | `npx vitest run apps/api/src/routes/__tests__/webauthn.test.ts -t "UV"` | ❌ W0 | ⬜ pending |
| 02-03-01 | 03 | 1 | AUTH-05 | manual-only | Verify no /api/auth/pin endpoint exists | N/A | ⬜ pending |
| 02-03-02 | 03 | 1 | AUTH-06 | manual-only | Visual check of unlock page | N/A | ⬜ pending |
| 02-03-03 | 03 | 1 | AUTH-08 | integration | `npx vitest run apps/api/src/routes/__tests__/session.test.ts` | ❌ W0 | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

- [ ] `vitest` — install in API workspace: `npm install -D vitest @vitest/coverage-v8`
- [ ] `apps/api/vitest.config.ts` — Vitest config for API
- [ ] `apps/api/src/routes/__tests__/auth.test.ts` — stubs for AUTH-01, AUTH-04
- [ ] `apps/api/src/routes/__tests__/webauthn.test.ts` — stubs for AUTH-02, AUTH-03, AUTH-07
- [ ] `apps/api/src/routes/__tests__/session.test.ts` — stubs for AUTH-08
- [ ] `apps/api/src/test-helpers/` — shared fixtures (mock pg pool, mock Fastify instance)

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| PIN is client-side only | AUTH-05 | No server endpoint to test | Verify no /api/auth/pin route exists; PIN stored in sessionStorage |
| Both unlock methods visible | AUTH-06 | UI layout verification | Open unlock page, verify passphrase and biometric options both visible |

---

## Validation Sign-Off

- [ ] All tasks have `<automated>` verify or Wave 0 dependencies
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify
- [ ] Wave 0 covers all MISSING references
- [ ] No watch-mode flags
- [ ] Feedback latency < 5s
- [ ] `nyquist_compliant: true` set in frontmatter

**Approval:** pending
