#!/usr/bin/env bash
# Smoke-Test für Herzblatt-Backend + Frontend-Proxies.
# Läuft gegen Production (default) oder via BACKEND_URL-Env gegen lokales Backend.
#
# Usage:
#   ./scripts/smoke-test.sh
#   ADMIN_TOKEN=xxx ./scripts/smoke-test.sh
#   BACKEND_URL=http://localhost:3001 FRONTEND_URL=http://localhost:4321 ./scripts/smoke-test.sh
#
# Exit 0 = alle Tests grün, exit 1 = mindestens 1 rot.

set -u
shopt -s nocasematch

BACKEND_URL="${BACKEND_URL:-https://backend-production-c327.up.railway.app}"
FRONTEND_URL="${FRONTEND_URL:-https://herzblatt-journal.com}"
ADMIN_TOKEN="${ADMIN_TOKEN:-}"

PASS=0
FAIL=0
SKIP=0

green() { printf '\033[32m%s\033[0m' "$1"; }
red()   { printf '\033[31m%s\033[0m' "$1"; }
yellow() { printf '\033[33m%s\033[0m' "$1"; }
dim()   { printf '\033[2m%s\033[0m' "$1"; }

check() {
  local name="$1"
  local expected="$2"
  local actual="$3"
  local detail="${4:-}"
  if [[ "$actual" =~ $expected ]]; then
    echo "  $(green ✓) $name $(dim "($actual)")"
    PASS=$((PASS+1))
  else
    echo "  $(red ✗) $name  expected=$expected got=$actual"
    [[ -n "$detail" ]] && echo "    $(dim "$detail")"
    FAIL=$((FAIL+1))
  fi
}

skip() {
  echo "  $(yellow '○') $1  $(dim "(skipped)")"
  SKIP=$((SKIP+1))
}

section() { echo; echo "━━━ $1 ━━━"; }

# ═══════════════════════════════════════════════════════════════
section "BACKEND DIRECT ($BACKEND_URL)"
# ═══════════════════════════════════════════════════════════════

# 1. Health
code=$(curl -sS -o /tmp/out1.json -w '%{http_code}' "$BACKEND_URL/health" 2>/dev/null || echo "000")
check "GET /health → 200" "^200$" "$code"
grep -q '"ok":true' /tmp/out1.json 2>/dev/null && PASS=$((PASS+1)) && echo "  $(green ✓) body hat ok:true" || { FAIL=$((FAIL+1)); echo "  $(red ✗) body ohne ok:true: $(cat /tmp/out1.json 2>/dev/null | head -c 200)"; }

# 2. Pageview POST
code=$(curl -sS -o /tmp/out2.json -w '%{http_code}' -X POST \
  -H 'Content-Type: application/json' \
  -d '{"path":"/smoke-test","referrer":"smoke"}' \
  "$BACKEND_URL/pageview" 2>/dev/null || echo "000")
check "POST /pageview → 200" "^200$" "$code"

# 3. Track-click POST
code=$(curl -sS -o /tmp/out3.json -w '%{http_code}' -X POST \
  -H 'Content-Type: application/json' \
  -d '{"target":"partnervermittlung","source":"smoke-test"}' \
  "$BACKEND_URL/track-click" 2>/dev/null || echo "000")
check "POST /track-click → 200" "^200$" "$code"

# 4. Newsletter mit fake email
smoke_email="smoke-$(date +%s)-$(head -c 4 /dev/urandom | od -An -tx1 | tr -d ' \n')@example.com"
code=$(curl -sS -o /tmp/out4.json -w '%{http_code}' -X POST \
  -H 'Content-Type: application/json' \
  -d "{\"email\":\"$smoke_email\",\"source\":\"newsletter-footer\"}" \
  "$BACKEND_URL/newsletter" 2>/dev/null || echo "000")
check "POST /newsletter → 200" "^200$" "$code"

# 5. Readers GET
code=$(curl -sS -o /tmp/out5.json -w '%{http_code}' "$BACKEND_URL/readers" 2>/dev/null || echo "000")
check "GET /readers → 200" "^200$" "$code"

# 6. Auth-Verify ohne Cookie
code=$(curl -sS -o /tmp/out6.json -w '%{http_code}' "$BACKEND_URL/auth/verify" 2>/dev/null || echo "000")
check "GET /auth/verify (no cookie) → 401" "^401$" "$code"

# 7. Herzraum ohne Cookie
code=$(curl -sS -o /tmp/out7.json -w '%{http_code}' "$BACKEND_URL/herzraum/stats" 2>/dev/null || echo "000")
check "GET /herzraum/stats (no cookie) → 401" "^401$" "$code"

# 8. Admin ohne Bearer
code=$(curl -sS -o /tmp/out8.json -w '%{http_code}' "$BACKEND_URL/admin/subscribers.csv" 2>/dev/null || echo "000")
check "GET /admin/subscribers.csv (no bearer) → 401" "^401$" "$code"

# 9. Admin-Metrics ohne Bearer
code=$(curl -sS -o /tmp/out9.json -w '%{http_code}' "$BACKEND_URL/admin/metrics" 2>/dev/null || echo "000")
check "GET /admin/metrics (no bearer) → 401" "^401$" "$code"

# 10. Digistore-IPN ohne Signature
code=$(curl -sS -o /tmp/out10.json -w '%{http_code}' "$BACKEND_URL/digistore-ipn" 2>/dev/null || echo "000")
check "GET /digistore-ipn → 200 (info page)" "^200$" "$code"

# ═══════════════════════════════════════════════════════════════
section "ADMIN ENDPOINTS (mit Bearer)"
# ═══════════════════════════════════════════════════════════════

if [[ -z "$ADMIN_TOKEN" ]]; then
  skip "ADMIN_TOKEN env nicht gesetzt → überspringe bearer-tests"
else
  # 11. Admin Metrics
  code=$(curl -sS -o /tmp/out11.json -w '%{http_code}' \
    -H "Authorization: Bearer $ADMIN_TOKEN" \
    "$BACKEND_URL/admin/metrics" 2>/dev/null || echo "000")
  check "GET /admin/metrics (bearer) → 200" "^200$" "$code"
  grep -q '"pageviews"' /tmp/out11.json 2>/dev/null && \
    echo "  $(green ✓) metrics hat DB-counts" && PASS=$((PASS+1)) || \
    { FAIL=$((FAIL+1)); echo "  $(red ✗) metrics body ohne counts"; }

  # 12. Admin Backup
  code=$(curl -sS -o /tmp/out12.json -w '%{http_code}' \
    -H "Authorization: Bearer $ADMIN_TOKEN" \
    "$BACKEND_URL/admin/backup.json" 2>/dev/null || echo "000")
  check "GET /admin/backup.json (bearer) → 200" "^200$" "$code"

  # 13. SendGrid Status
  code=$(curl -sS -o /tmp/out13.json -w '%{http_code}' \
    -H "Authorization: Bearer $ADMIN_TOKEN" \
    "$BACKEND_URL/admin/sendgrid/status" 2>/dev/null || echo "000")
  check "GET /admin/sendgrid/status (bearer) → 200" "^200$" "$code"

  # 14. Cron Cleanup
  code=$(curl -sS -o /tmp/out14.json -w '%{http_code}' \
    -H "Authorization: Bearer $ADMIN_TOKEN" \
    -X POST "$BACKEND_URL/admin/cron/cleanup" 2>/dev/null || echo "000")
  check "POST /admin/cron/cleanup (bearer) → 200" "^200$" "$code"
fi

# ═══════════════════════════════════════════════════════════════
section "FRONTEND PROXIES ($FRONTEND_URL)"
# ═══════════════════════════════════════════════════════════════

# 15. Homepage
code=$(curl -sS -o /dev/null -w '%{http_code}' "$FRONTEND_URL/" 2>/dev/null || echo "000")
check "GET / (homepage) → 200" "^200$" "$code"

# 16. Frontend /api/pageview proxy
code=$(curl -sS -o /tmp/out16.json -w '%{http_code}' -X POST \
  -H 'Content-Type: application/json' \
  -d '{"path":"/smoke-frontend","referrer":"smoke"}' \
  "$FRONTEND_URL/api/pageview" 2>/dev/null || echo "000")
check "POST /api/pageview (frontend proxy) → 200" "^200$" "$code"

# 17. /herzraum → redirect zu /herzraum/login
code=$(curl -sS -o /dev/null -w '%{http_code}' "$FRONTEND_URL/herzraum" 2>/dev/null || echo "000")
check "GET /herzraum (unauth) → 302" "^302$" "$code"

# 18. /herzraum/login reachable
code=$(curl -sS -o /dev/null -w '%{http_code}' "$FRONTEND_URL/herzraum/login" 2>/dev/null || echo "000")
check "GET /herzraum/login → 200" "^200$" "$code"

# 19. E-Book-Page
code=$(curl -sS -o /dev/null -w '%{http_code}' "$FRONTEND_URL/ebook" 2>/dev/null || echo "000")
check "GET /ebook → 200" "^200$" "$code"

# ═══════════════════════════════════════════════════════════════
section "ZUSAMMENFASSUNG"
# ═══════════════════════════════════════════════════════════════

TOTAL=$((PASS+FAIL+SKIP))
echo
echo "  Total:  $TOTAL Tests"
echo "  $(green Passed):  $PASS"
echo "  $(red Failed):  $FAIL"
echo "  $(yellow Skipped): $SKIP"
echo

if [[ "$FAIL" -gt 0 ]]; then
  echo "$(red '✗ SOME TESTS FAILED')"
  exit 1
else
  echo "$(green '✓ ALL TESTS PASSED')"
  exit 0
fi
