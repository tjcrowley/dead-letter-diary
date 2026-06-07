#!/usr/bin/env bash
# test-phase1.sh — Smoke test for all Phase 1 INST requirements
# Usage: ./scripts/test-phase1.sh
# Exit 0 = all pass, Exit 1 = one or more failed

set -uo pipefail

# Move to repo root so relative paths and docker compose work correctly
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$SCRIPT_DIR/.."

PASS=0
FAIL=0
CHECKS_TOTAL=6

pass() { echo "[PASS] $1"; ((PASS++)); }
fail() { echo "[FAIL] $1"; ((FAIL++)); }

echo "========================================"
echo "  Dead Letter Diary — Phase 1 Smoke Test"
echo "========================================"
echo ""

# ---------------------------------------------------------------------------
# INST-01: Docker Compose services — all 5 must be running
# ---------------------------------------------------------------------------
echo "--- INST-01: Docker Compose services ---"
SERVICES_JSON=$(docker compose ps --format json 2>/dev/null || echo "")
if [ -z "$SERVICES_JSON" ]; then
  fail "INST-01: docker compose ps returned no output"
else
  # docker compose ps --format json may output multiple JSON objects (one per line) or array
  # Count running services by checking for each by name
  REQUIRED_SERVICES=(postgres redis api web caddy)
  ALL_UP=true
  for svc in "${REQUIRED_SERVICES[@]}"; do
    # The name field in docker compose ps json includes the project prefix
    if echo "$SERVICES_JSON" | grep -q "\"Service\":\"${svc}\"" || \
       echo "$SERVICES_JSON" | grep -q "\"Name\":\"[^\"]*_${svc}[^\"]*\"" || \
       docker compose ps --status running 2>/dev/null | grep -q "${svc}"; then
      echo "  [ok] service '${svc}' is running"
    else
      echo "  [!!] service '${svc}' not found in running services"
      ALL_UP=false
    fi
  done
  if $ALL_UP; then
    pass "INST-01: All 5 services running (postgres, redis, api, web, caddy)"
  else
    fail "INST-01: One or more services not running"
  fi
fi

echo ""

# ---------------------------------------------------------------------------
# INST-02: Caddy HTTPS — must respond to https://localhost/api/health
# ---------------------------------------------------------------------------
echo "--- INST-02: Caddy HTTPS reverse proxy ---"
HEALTH_RESPONSE=$(curl -sf -k https://localhost/api/health 2>/dev/null || echo "CURL_FAILED")
if echo "$HEALTH_RESPONSE" | grep -q '"healthy"' || echo "$HEALTH_RESPONSE" | grep -q 'healthy'; then
  pass "INST-02: HTTPS endpoint https://localhost/api/health returns healthy"
else
  fail "INST-02: HTTPS health check failed (response: ${HEALTH_RESPONSE})"
fi

echo ""

# ---------------------------------------------------------------------------
# INST-05: Secret auto-generation — all 4 secrets must exist after ensureSecrets()
# ---------------------------------------------------------------------------
echo "--- INST-05: Secret auto-generation ---"
# Secrets are set dynamically by ensureSecrets() into process.env at runtime.
# They are NOT visible via 'docker compose exec printenv' (which only shows the
# container's initial environment). Instead, we verify via a Node.js check that
# loads the generated secrets file and reports their presence.
SECRETS_FOUND=0
SECRETS_NEEDED=(SESSION_SECRET VAPID_PUBLIC_KEY VAPID_PRIVATE_KEY SHARD_ENCRYPTION_KEY)
# Use node to call ensureSecrets (loads from volume) and check each key
NODE_CHECK=$(docker compose exec -T api node -e "
require('./dist/boot/secrets.js').ensureSecrets().then(() => {
  const keys = ['SESSION_SECRET','VAPID_PUBLIC_KEY','VAPID_PRIVATE_KEY','SHARD_ENCRYPTION_KEY'];
  keys.forEach(k => console.log(k + '=' + (process.env[k] ? 'SET' : 'MISSING')));
});
" 2>/dev/null || echo "NODE_EXEC_FAILED")

if echo "$NODE_CHECK" | grep -q "NODE_EXEC_FAILED"; then
  fail "INST-05: Could not exec node in API container"
else
  for secret in "${SECRETS_NEEDED[@]}"; do
    if echo "$NODE_CHECK" | grep -q "^${secret}=SET"; then
      echo "  [ok] ${secret} is set"
      ((SECRETS_FOUND++))
    else
      echo "  [!!] ${secret} is MISSING"
    fi
  done
  if [ "$SECRETS_FOUND" -eq 4 ]; then
    pass "INST-05: All 4 secrets present in API container (SESSION_SECRET, VAPID keys, SHARD_ENCRYPTION_KEY)"
  else
    fail "INST-05: Only ${SECRETS_FOUND}/4 secrets found in API container"
  fi
fi

echo ""

# ---------------------------------------------------------------------------
# INST-06: .env in .gitignore + .env.example exists
# ---------------------------------------------------------------------------
echo "--- INST-06: .env git hygiene ---"
GITIGNORE_OK=false
EXAMPLE_OK=false

if grep -qE '^\.env$|^\.env[[:space:]]' .gitignore 2>/dev/null; then
  echo "  [ok] .env is in .gitignore"
  GITIGNORE_OK=true
else
  echo "  [!!] .env is NOT in .gitignore"
fi

if [ -f ".env.example" ]; then
  echo "  [ok] .env.example exists"
  EXAMPLE_OK=true
else
  echo "  [!!] .env.example does not exist"
fi

if $GITIGNORE_OK && $EXAMPLE_OK; then
  pass "INST-06: .env gitignored and .env.example present"
else
  fail "INST-06: .env git hygiene check failed"
fi

echo ""

# ---------------------------------------------------------------------------
# INST-09: Named Docker volumes — at least 4 with deadletter_ substring
# ---------------------------------------------------------------------------
echo "--- INST-09: Named Docker volumes ---"
# Docker Compose prefixes volumes with the project name (dead-letter-diary_).
# We match any volume that contains 'deadletter_' anywhere in the name.
VOLUME_LIST=$(docker volume ls --format '{{.Name}}' 2>/dev/null | grep 'deadletter_' || true)
VOLUME_COUNT=$(echo "$VOLUME_LIST" | grep -c 'deadletter_' 2>/dev/null || echo 0)
# grep -c may include a trailing newline — strip it
VOLUME_COUNT=$(echo "$VOLUME_COUNT" | tr -d '[:space:]')
echo "  Found ${VOLUME_COUNT} named volume(s) containing 'deadletter_':"
echo "$VOLUME_LIST" | sed 's/^/    /'
if [ "${VOLUME_COUNT}" -ge 4 ] 2>/dev/null; then
  pass "INST-09: ${VOLUME_COUNT} named volumes with deadletter_ substring (>= 4 required)"
else
  fail "INST-09: Only ${VOLUME_COUNT} named volumes containing deadletter_ (need >= 4)"
fi

echo ""

# ---------------------------------------------------------------------------
# INST-10: HTTPS-only boot check — verify HTTPS works (localhost exception active)
# ---------------------------------------------------------------------------
echo "--- INST-10: HTTPS-only enforcement ---"
# For localhost deployments the HTTP exception applies, so we verify:
# 1. HTTPS endpoint is reachable (already proven in INST-02)
# 2. The API's onRequest hook code is present (server.ts)
HOOK_PRESENT=false
if grep -q "x-forwarded-proto\|HTTPS required" apps/api/src/server.ts 2>/dev/null; then
  HOOK_PRESENT=true
fi

HTTPS_WORKS=$(curl -sf -k https://localhost/api/health 2>/dev/null | grep -c '"healthy"\|healthy' || echo 0)
if $HOOK_PRESENT && [ "$HTTPS_WORKS" -ge 1 ]; then
  pass "INST-10: HTTPS boot check hook present; HTTPS endpoint reachable (localhost dev exception active)"
else
  fail "INST-10: HTTPS check hook missing or HTTPS endpoint unreachable"
fi

echo ""

# ---------------------------------------------------------------------------
# Summary
# ---------------------------------------------------------------------------
echo "========================================"
echo "  Results: ${PASS}/${CHECKS_TOTAL} checks passed"
echo "========================================"

if [ "$PASS" -eq "$CHECKS_TOTAL" ]; then
  echo "  ALL PHASE 1 REQUIREMENTS SATISFIED"
  exit 0
else
  echo "  ${FAIL} check(s) FAILED — see above for details"
  exit 1
fi
