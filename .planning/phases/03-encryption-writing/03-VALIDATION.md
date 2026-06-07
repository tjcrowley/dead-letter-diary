---
phase: 3
slug: encryption-writing
status: draft
nyquist_compliant: false
wave_0_complete: false
created: 2026-06-06
---

# Phase 3 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | vitest 4.1.8 (API: installed; Web: Wave 0) |
| **Config file** | `apps/api/vitest.config.ts` (exists); `apps/web/vitest.config.ts` (Wave 0) |
| **Quick run command** | `cd apps/api && npx vitest run && cd ../web && npx vitest run` |
| **Full suite command** | `cd apps/api && npx vitest run && cd ../web && npx vitest run` |
| **Estimated runtime** | ~8 seconds |

---

## Sampling Rate

- **After every task commit:** Run quick run command
- **After every plan wave:** Run full suite command
- **Before `/gsd:verify-work`:** Full suite must be green
- **Max feedback latency:** 8 seconds

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|-----------|-------------------|-------------|--------|
| 03-01-01 | 01 | 1 | CRYPT-01, CRYPT-02, CRYPT-03, CRYPT-08 | unit | `cd apps/web && npx vitest run lib/__tests__/crypto.test.ts` | ❌ W0 | ⬜ pending |
| 03-01-02 | 01 | 1 | CRYPT-05, CRYPT-06, CRYPT-07, CRYPT-09 | unit | `cd apps/web && npx vitest run lib/__tests__/crypto.test.ts` | ❌ W0 | ⬜ pending |
| 03-02-01 | 02 | 2 | WRITE-01, WRITE-02, WRITE-04 | unit+manual | `cd apps/web && npx vitest run lib/__tests__/word-count.test.ts` | ❌ W0 | ⬜ pending |
| 03-02-02 | 02 | 2 | WRITE-03 | integration | `cd apps/web && npx vitest run lib/__tests__/db.test.ts` | ❌ W0 | ⬜ pending |
| 03-03-01 | 03 | 2 | CRYPT-04, CRYPT-10 | unit | `cd apps/api && npx vitest run src/routes/__tests__/crypto.test.ts` | ❌ W0 | ⬜ pending |
| 03-03-02 | 03 | 2 | WRITE-05 | unit | `cd apps/api && npx vitest run src/routes/__tests__/entries.test.ts` | ❌ W0 | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

- [ ] `apps/web/vitest.config.ts` — Vitest config for web (needs `environment: "happy-dom"` for Web Crypto)
- [ ] `vitest` + `happy-dom` — install in web workspace
- [ ] `apps/web/lib/__tests__/crypto.test.ts` — covers CRYPT-01 through CRYPT-08
- [ ] `apps/web/lib/__tests__/word-count.test.ts` — covers WRITE-04
- [ ] `apps/web/lib/__tests__/db.test.ts` — covers WRITE-03 (may need fake-indexeddb)
- [ ] `apps/api/src/routes/__tests__/crypto.test.ts` — covers CRYPT-04, CRYPT-10
- [ ] `apps/api/src/routes/__tests__/entries.test.ts` — covers WRITE-05

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| Write surface renders with auto-focus | WRITE-01 | UI layout | Open /write, verify editor auto-focused |
| Word count turns green at minimum | WRITE-02 | Visual styling | Type words, verify count color change |

---

## Validation Sign-Off

- [ ] All tasks have `<automated>` verify or Wave 0 dependencies
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify
- [ ] Wave 0 covers all MISSING references
- [ ] No watch-mode flags
- [ ] Feedback latency < 8s
- [ ] `nyquist_compliant: true` set in frontmatter

**Approval:** pending
