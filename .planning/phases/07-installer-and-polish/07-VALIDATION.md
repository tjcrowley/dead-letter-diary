---
phase: 7
slug: installer-and-polish
status: draft
nyquist_compliant: false
wave_0_complete: false
created: 2026-06-07
---

# Phase 7 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | vitest (API: node env; web: happy-dom env) |
| **Config file (API)** | `apps/api/vitest.config.ts` |
| **Config file (web)** | `apps/web/vitest.config.ts` |
| **Quick run command** | `cd apps/api && npx vitest run src/routes/__tests__/settings.test.ts src/routes/__tests__/entries.test.ts` |
| **Full suite command** | `cd apps/api && npx vitest run && cd ../web && npx vitest run` |
| **Estimated runtime** | ~25 seconds |

---

## Sampling Rate

- **After every task commit:** Run quick run command above
- **After every plan wave:** Run full suite
- **Before `/gsd:verify-work`:** Full suite must be green
- **Max feedback latency:** 25 seconds

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|-----------|-------------------|-------------|--------|
| 7-01-01 | 01 | 1 | INST-03 | unit (shell) | `bash -n scripts/install.sh && echo PASS` | ❌ W0 | ⬜ pending |
| 7-01-02 | 01 | 1 | INST-04 | unit (shell) | `grep -q launchd scripts/com.deadletterdiary.plist && grep -q systemd scripts/dead-letter-diary.service && echo PASS` | ❌ W0 | ⬜ pending |
| 7-02-01 | 02 | 2 | SETUP-01, SETUP-02, SETUP-03 | unit | `cd apps/web && npx vitest run app/setup/__tests__/page.test.tsx` | ❌ W0 | ⬜ pending |
| 7-02-02 | 02 | 2 | SETUP-04, SETUP-05 | unit | `cd apps/api && npx vitest run src/routes/__tests__/settings.test.ts && cd ../web && npx vitest run components/__tests__/StreakCounter.test.tsx` | ❌ W0 | ⬜ pending |
| 7-03-01 | 03 | 2 | WRITE-06 | unit | `cd apps/api && npx vitest run src/routes/__tests__/entries.test.ts` | ❌ W0 | ⬜ pending |
| 7-03-02 | 03 | 2 | WRITE-06 | unit | `cd apps/web && npx vitest run app/entries/__tests__/page.test.tsx` | ❌ W0 | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

- [ ] `scripts/install.sh` — the installer itself (created by task 7-01-01; `bash -n` validates syntax)
- [ ] `scripts/com.deadletterdiary.plist` — launchd service manifest (created by task 7-01-02)
- [ ] `scripts/dead-letter-diary.service` — systemd unit (created by task 7-01-02)
- [ ] `apps/web/app/setup/__tests__/page.test.tsx` — stubs for SETUP-01/02/03 (created by TDD task 7-02-01)
- [ ] `apps/api/src/routes/__tests__/settings.test.ts` — stubs for SETUP-04 (created by TDD task 7-02-02)
- [ ] `apps/web/components/__tests__/StreakCounter.test.tsx` — stubs for SETUP-05 (created by TDD task 7-02-02)
- [ ] `apps/api/src/routes/__tests__/entries.test.ts` — stubs for WRITE-06 (created by TDD task 7-03-01)
- [ ] `apps/web/app/entries/__tests__/page.test.tsx` — stubs for WRITE-06 client (created by TDD task 7-03-02)

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| `install.sh` registers launchd service and opens browser on macOS | INST-03 | Requires live macOS + Docker | Run `bash scripts/install.sh`, verify service listed in `launchctl list`, browser opens to https://localhost |
| `install.sh` registers systemd service on Linux | INST-04 | Requires Linux + systemd + Docker | Run `bash scripts/install.sh`, verify `systemctl status dead-letter-diary` shows active |
| First-run 5-step setup completes end-to-end on real browser | SETUP-01/02 | Requires live WebAuthn device | Open setup page, complete all 5 steps including passkey enrollment and acknowledgment checkbox |
| Past entries decrypt correctly in browser | WRITE-06 | Requires live session with DMK | Write 3+ entries, open /entries, verify all decrypt and render correctly |

---

## Validation Sign-Off

- [ ] All tasks have `<automated>` verify or Wave 0 dependencies
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify
- [ ] Wave 0 covers all MISSING references
- [ ] No watch-mode flags
- [ ] Feedback latency < 25s
- [ ] `nyquist_compliant: true` set in frontmatter

**Approval:** pending
