---
phase: 6
slug: wipe-and-ceremony
status: draft
nyquist_compliant: false
wave_0_complete: false
created: 2026-06-07
---

# Phase 6 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | vitest (API: node env; web: happy-dom env) |
| **Config file (API)** | `apps/api/vitest.config.ts` |
| **Config file (web)** | `apps/web/vitest.config.ts` |
| **Quick run command** | `cd apps/api && npx vitest run src/routes/__tests__/wipe.test.ts && cd ../web && npx vitest run lib/__tests__/wipe.test.ts` |
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
| 6-01-01 | 01 | 1 | WIPE-01 | unit | `cd apps/api && npx vitest run src/lib/__tests__/deadline-engine.test.ts` | ✅ exists | ⬜ pending |
| 6-01-02 | 01 | 1 | WIPE-05 | unit | `cd apps/api && npx vitest run src/routes/__tests__/wipe.test.ts` | ❌ W0 | ⬜ pending |
| 6-02-01 | 02 | 2 | WIPE-02, WIPE-06 | unit | `cd apps/web && npx vitest run lib/__tests__/wipe.test.ts` | ❌ W0 | ⬜ pending |
| 6-02-02 | 02 | 2 | WIPE-03 | unit | `cd apps/web && npx vitest run app/wiped/__tests__/page.test.tsx` | ❌ W0 | ⬜ pending |
| 6-02-03 | 02 | 2 | WIPE-05 | unit | `cd apps/web && npx vitest run components/__tests__/PanicEncryptButton.test.tsx` | ❌ W0 | ⬜ pending |
| 6-03-01 | 03 | 2 | WIPE-04 | unit | `cd apps/api && npx vitest run src/routes/__tests__/wipe.test.ts` | ❌ W0 | ⬜ pending |
| 6-03-02 | 03 | 2 | INST-07 | manual | `psql -c "\dt shards.*"` | ❌ W0 | ⬜ pending |
| 6-03-03 | 03 | 2 | INST-08 | unit | `bash scripts/backup.sh && pg_restore --list backup.sql \| grep -v server_shards` | ❌ W0 | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

- [ ] `apps/api/src/routes/__tests__/wipe.test.ts` — stubs for WIPE-04 (epitaph routes), WIPE-05 (panic route)
- [ ] `apps/api/src/lib/__tests__/deadline-engine.test.ts` — extend existing: add stub for `sendWipeNotification` called after `confirmWipe`
- [ ] `apps/web/lib/__tests__/wipe.test.ts` — stubs for WIPE-02 (IDB clear on push), WIPE-06 (performClientWipe, session guard redirect)
- [ ] `apps/web/components/__tests__/PanicEncryptButton.test.tsx` — stubs for WIPE-05 (confirmation dialog, API call)
- [ ] `apps/web/app/wiped/__tests__/page.test.tsx` — stubs for WIPE-03 (blank screen, epitaph display)
- [ ] `apps/api/migrations/002.do.shard-schema.sql` — covers INST-07 (migration file itself)
- [ ] `scripts/backup.sh` — covers INST-08

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| `server_shards` table lives in `shards` schema after migration | INST-07 | Requires live PostgreSQL instance | Run migration, then `psql -c "\dt shards.*"` — verify `shards.server_shards` exists and `public.server_shards` is gone |
| Client wipe clears all data on iOS PWA after push notification | WIPE-02 | Requires physical device + push delivery | Let deadline expire on iOS PWA; verify app shows wipe screen after notification arrives |
| Wipe is irreversible — diary cannot be decrypted after shard deletion | WIPE-01 | Requires full E2E integration | After wipe, attempt to open diary; verify decryption fails even with correct passphrase |

---

## Validation Sign-Off

- [ ] All tasks have `<automated>` verify or Wave 0 dependencies
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify
- [ ] Wave 0 covers all MISSING references
- [ ] No watch-mode flags
- [ ] Feedback latency < 25s
- [ ] `nyquist_compliant: true` set in frontmatter

**Approval:** pending
