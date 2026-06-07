---
phase: 1
slug: foundation
status: draft
nyquist_compliant: false
wave_0_complete: false
created: 2026-06-06
---

# Phase 1 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | vitest |
| **Config file** | none — Wave 0 installs |
| **Quick run command** | `docker compose exec api npx vitest run --reporter=verbose` |
| **Full suite command** | `docker compose exec api npx vitest run` |
| **Estimated runtime** | ~10 seconds |

---

## Sampling Rate

- **After every task commit:** Run `docker compose exec api npx vitest run --reporter=verbose`
- **After every plan wave:** Run full suite
- **Before `/gsd:verify-work`:** Full suite must be green
- **Max feedback latency:** 15 seconds

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|-----------|-------------------|-------------|--------|
| 01-01-01 | 01 | 1 | INST-01 | integration | `docker compose up -d --wait` | ❌ W0 | ⬜ pending |
| 01-01-02 | 01 | 1 | INST-02 | integration | `curl -sk https://localhost/api/health` | ❌ W0 | ⬜ pending |
| 01-01-03 | 01 | 1 | INST-05 | unit | `vitest run --grep migration` | ❌ W0 | ⬜ pending |
| 01-02-01 | 02 | 1 | INST-06 | integration | `curl -sk https://localhost/api/health` | ❌ W0 | ⬜ pending |
| 01-02-02 | 02 | 1 | INST-09 | integration | `curl -sk https://localhost` | ❌ W0 | ⬜ pending |
| 01-03-01 | 03 | 2 | INST-10 | integration | `docker compose exec api node -e "require('./src/secrets')"` | ❌ W0 | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

- [ ] `apps/api/vitest.config.ts` — vitest configuration
- [ ] `apps/api/tests/health.test.ts` — health check test stub
- [ ] `apps/api/tests/migration.test.ts` — migration runner test stub
- [ ] vitest + @types/node installed in api package

*If none: "Existing infrastructure covers all phase requirements."*

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| Caddy HTTPS trusted cert | INST-02 | Browser cert trust varies by OS | Open https://localhost in browser, verify no cert warning |
| `.env` RP ID prominence | INST-05 | Documentation/UX quality | Inspect `.env.example`, verify RP ID warning is prominent |

---

## Validation Sign-Off

- [ ] All tasks have `<automated>` verify or Wave 0 dependencies
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify
- [ ] Wave 0 covers all MISSING references
- [ ] No watch-mode flags
- [ ] Feedback latency < 15s
- [ ] `nyquist_compliant: true` set in frontmatter

**Approval:** pending
