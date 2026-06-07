---
phase: 07-installer-and-polish
plan: 01
subsystem: infra
tags: [bash, docker, launchd, systemd, installer]

# Dependency graph
requires:
  - phase: 01-foundation
    provides: docker-compose.yml with dead-letter-diary project name and Caddy on https://localhost
  - phase: 06-wipe-and-ceremony
    provides: completed application logic — installer wraps the finished app
provides:
  - scripts/install.sh: one-command installer with Docker check, compose start, health poll, service registration, browser open
  - scripts/com.deadletterdiary.plist: macOS launchd LaunchAgent for post-reboot persistence
  - scripts/dead-letter-diary.service: Linux systemd user unit for post-reboot persistence
affects: [readme, docs, release]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "INSTALL_DIR_PLACEHOLDER token in service manifests — sed-substituted at install time, no hardcoded paths"
    - "set -euo pipefail in all install scripts — fail-fast with visible errors"
    - "Health poll loop (curl -sk, 2s interval, 30s max) before browser open"

key-files:
  created:
    - scripts/install.sh
    - scripts/com.deadletterdiary.plist
    - scripts/dead-letter-diary.service
  modified: []

key-decisions:
  - "INSTALL_DIR_PLACEHOLDER token pattern: sed substitution at install time rather than eval or relative paths — works regardless of where user clones the repo"
  - "launchd KeepAlive=false: Docker manages container restarts (restart: always in compose); launchd only needs to fire docker compose up once at login"
  - "systemd Type=oneshot with RemainAfterExit=yes: mirrors the docker compose up -d semantics — command exits immediately, service stays 'active'"
  - "Health poll: non-fatal timeout (warning only) so install succeeds even on slow machines"
  - "Browser open: detect open vs xdg-open; fallback message if neither present (e.g. headless servers)"

patterns-established:
  - "Service manifest placeholder pattern: INSTALL_DIR_PLACEHOLDER replaced by sed in install.sh"
  - "Idempotent launchctl install: unload before load so re-running install.sh does not error"

requirements-completed: [INST-03, INST-04]

# Metrics
duration: 6min
completed: 2026-06-07
---

# Phase 7 Plan 01: Installer and System Service Summary

**One-command installer (install.sh) that checks Docker, starts Compose, polls health, registers launchd/systemd auto-start service, and opens the browser — with sed-substituted path placeholders in both service manifests**

## Performance

- **Duration:** 6 min
- **Started:** 2026-06-07T23:11:30Z
- **Completed:** 2026-06-07T23:17:00Z
- **Tasks:** 2
- **Files modified:** 3

## Accomplishments

- scripts/install.sh: 154-line bash installer covering Docker check, compose start, health poll, macOS launchd registration, Linux systemd registration, browser open, and a friendly final message
- scripts/com.deadletterdiary.plist: macOS LaunchAgent plist with RunAtLoad=true, KeepAlive=false, logs to /tmp — activated via launchctl load
- scripts/dead-letter-diary.service: systemd user unit (Type=oneshot, RemainAfterExit=yes) — activated via systemctl --user enable

## Task Commits

Each task was committed atomically:

1. **Task 1: launchd plist and systemd unit templates** - `f7528c6` (feat)
2. **Task 2: install.sh — Docker check, compose start, service registration, browser open** - `965b508` (feat)

**Plan metadata:** (docs commit to follow)

## Files Created/Modified

- `scripts/install.sh` — One-command installer entrypoint; executable (chmod +x); 154 lines; passes bash -n
- `scripts/com.deadletterdiary.plist` — macOS launchd LaunchAgent; label com.deadletterdiary; INSTALL_DIR_PLACEHOLDER for WorkingDirectory and ProgramArguments path
- `scripts/dead-letter-diary.service` — Linux systemd user unit; WantedBy=default.target; ExecStart/ExecStop docker compose; INSTALL_DIR_PLACEHOLDER

## Decisions Made

- INSTALL_DIR_PLACEHOLDER token: sed substitution at install time rather than eval or embedded shell variables — portable and safe
- launchd KeepAlive=false: Docker compose has restart: always per service; launchd only needs to fire compose up once at login
- systemd Type=oneshot with RemainAfterExit=yes: mirrors docker compose -d semantics (command exits, containers keep running)
- Health poll is non-fatal: timeout prints a warning but installer continues — avoids blocking on slow machines
- Idempotent launchctl: unload (with || true) before load so re-running install.sh never errors

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered

None.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

- install.sh is syntactically valid and ready for functional testing on macOS with Docker
- Manual checkpoint verification (macOS: launchd plist loads, browser opens) covered in phase-end checkpoint
- Phase 7 Plan 01 complete; remaining phase 7 plans cover polish items

---
*Phase: 07-installer-and-polish*
*Completed: 2026-06-07*
