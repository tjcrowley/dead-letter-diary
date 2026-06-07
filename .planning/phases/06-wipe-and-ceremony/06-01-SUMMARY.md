---
phase: 06-wipe-and-ceremony
plan: 01
subsystem: wipe-pipeline
tags: [push-notifications, wipe, panic-route, deadline-engine, tdd]
dependency_graph:
  requires: [05-dead-mans-switch]
  provides: [sendWipeNotification, POST /api/wipe/panic]
  affects: [deadline-engine, notification-sender, server]
tech_stack:
  added: []
  patterns: [transactional-wipe, best-effort-push-after-commit, FOR-UPDATE-concurrency-lock]
key_files:
  created:
    - apps/api/src/routes/wipe.ts
    - apps/api/src/routes/__tests__/wipe.test.ts
  modified:
    - apps/api/src/lib/notification-sender.ts
    - apps/api/src/lib/deadline-engine.ts
    - apps/api/src/lib/__tests__/deadline-engine.test.ts
    - apps/api/src/server.ts
decisions:
  - "sendWipeNotification called after COMMIT in both checkDeadlines and panic route — push is best-effort and must not hold DB locks"
  - "Panic wipe sets confirmed_at=now() immediately (no 60s settle window) — wipe_log has both initiated_at and confirmed_at set in single INSERT"
  - "409 returned for both missing deadline_state row and non-active state — unified non-active error response"
metrics:
  duration_minutes: 12
  completed_date: "2026-06-07T22:43:00Z"
  tasks_completed: 2
  files_changed: 6
---

# Phase 06 Plan 01: Wipe Pipeline — sendWipeNotification + Panic Route Summary

**One-liner:** Server-side wipe pipeline completed: push notification hook wired into checkDeadlines after confirmWipe, plus immediate `POST /api/wipe/panic` route with FOR UPDATE locking and transactional shard deletion.

## Tasks Completed

| # | Task | Commit | Files |
|---|------|--------|-------|
| 1 | sendWipeNotification + wire into checkDeadlines (WIPE-01) | 48cbd3e | notification-sender.ts, deadline-engine.ts, deadline-engine.test.ts |
| 2 | POST /api/wipe/panic route + register in server (WIPE-05) | b26e037 | wipe.ts, wipe.test.ts, server.ts |

## What Was Built

### Task 1: sendWipeNotification (WIPE-01)

Added `sendWipeNotification(pool, userId, log)` to `notification-sender.ts`:
- Queries `notifications` table for user's push subscription
- If no subscription: returns immediately (no-op)
- Sends push with `{ type: 'wipe', title: 'Dead Letter Diary', body: 'Your diary has been permanently destroyed.' }` using urgency=high, TTL=0
- Catches push errors and logs as warn (non-fatal — wipe is complete regardless)
- Always deletes subscription row after attempt (subscription no longer needed post-wipe)

Wired into `checkDeadlines` step 2 loop: `await sendWipeNotification(pool, userId, log)` called immediately after `await confirmWipe(client, userId)` returns.

### Task 2: POST /api/wipe/panic (WIPE-05)

Created `apps/api/src/routes/wipe.ts` as fp-wrapped Fastify plugin:
- Requires `requireAuth` preHandler
- Acquires pool client, BEGIN, SELECT deadline_state FOR UPDATE
- 409 if no row or state !== 'active'
- If active: INSERT wipe_log (reason='panic', initiated_at=now(), shard_deleted=true, confirmed_at=now())
- DELETE server_shards (immediate — no settle window for panic)
- UPDATE deadline_state SET state='wiped'
- COMMIT, then sendWipeNotification outside transaction
- Returns 200 { ok: true }
- DB errors trigger ROLLBACK + rethrow (Fastify 500)

Registered in `server.ts` alongside existing routes.

## Test Coverage

- 12 deadline-engine tests (all pass), including:
  - `sendWipeNotification` spy called with correct args after confirmWipe
  - `sendWipeNotification` NOT called when no settled pending_wipe rows
- 7 wipe route tests (all pass), including:
  - 200 happy path: shard deleted, wipe_log with reason='panic', state='wiped'
  - sendWipeNotification called after COMMIT
  - 409 for pending_wipe, wiped, and missing row states
  - 500 on DB error mid-wipe

**Full suite: 90 tests passing across 13 test files — no regressions.**

## Deviations from Plan

None — plan executed exactly as written.

The plan referenced `app.ts` but the actual entry point is `server.ts`. This was an auto-corrected naming deviation (Rule 3 auto-fix) — no architectural change.

## Self-Check: PASSED

- apps/api/src/routes/wipe.ts: FOUND
- apps/api/src/routes/__tests__/wipe.test.ts: FOUND
- apps/api/src/lib/notification-sender.ts exports sendWipeNotification: FOUND
- deadline-engine.ts calls sendWipeNotification after confirmWipe: FOUND (line 176)
- server.ts registers wipeRoutes: FOUND (line 70)
- Commit 48cbd3e: FOUND
- Commit b26e037: FOUND
