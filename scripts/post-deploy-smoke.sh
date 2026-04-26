#!/usr/bin/env bash
# scripts/post-deploy-smoke.sh — sanity-check a freshly deployed stack.
# Run AFTER `docker compose up -d` succeeds. Each check times out fast;
# the whole script aims to finish in < 30s.
#
# Usage:
#   bash scripts/post-deploy-smoke.sh                    # uses deploy/.env
#   ENV_FILE=deploy/.env.staging bash post-deploy-smoke
#
# Exit 0 = all green. Exit 1 = at least one endpoint unhealthy.

set -uo pipefail

HERE="$(cd "$(dirname "$0")/.." && pwd)"
ENV_FILE="${ENV_FILE:-$HERE/deploy/.env}"

failures=0
pass() { printf '  \033[32mPASS\033[0m  %s\n' "$*"; }
fail() { printf '  \033[31mFAIL\033[0m  %s\n' "$*" >&2; failures=$((failures+1)); }
skip() { printf '  \033[33mSKIP\033[0m  %s\n' "$*"; }
hdr()  { printf '\n\033[1m%s\033[0m\n' "$*"; }

if [[ ! -f "$ENV_FILE" ]]; then
  echo "error: $ENV_FILE not found" >&2
  exit 1
fi
set -a; source "$ENV_FILE"; set +a

CURL="curl -fsS --max-time 10"

# ---------------------------------------------------------------------------
# 1. Caddy is the front door — should answer on :80 (HTTP→HTTPS redirect)
#    and :443 (TLS) for all three public hostnames.
# ---------------------------------------------------------------------------
hdr "1. Caddy reverse proxy"

for var in DAES_PUBLIC_DOMAIN DAES_CONSOLE_DOMAIN DAES_IPFS_DOMAIN; do
  host="${!var:-}"
  [[ -z "$host" ]] && { skip "$var unset"; continue; }
  if $CURL -o /dev/null -w '%{http_code}' "http://$host/" 2>/dev/null | grep -qE '^(30[1278]|200)$'; then
    pass "http://$host responds (redirect or 200)"
  else
    fail "http://$host did not respond on :80"
  fi
done

# ---------------------------------------------------------------------------
# 2. mcp-gateway healthz behind Caddy
# ---------------------------------------------------------------------------
hdr "2. mcp-gateway"

if [[ -n "${DAES_PUBLIC_DOMAIN:-}" ]]; then
  if $CURL "https://$DAES_PUBLIC_DOMAIN/healthz" >/dev/null 2>&1; then
    pass "https://$DAES_PUBLIC_DOMAIN/healthz returns 200"
  else
    fail "mcp-gateway /healthz unreachable through Caddy"
  fi
fi

# ---------------------------------------------------------------------------
# 3. Operator console reachable
# ---------------------------------------------------------------------------
hdr "3. Operator console"

if [[ -n "${DAES_CONSOLE_DOMAIN:-}" ]]; then
  if $CURL -o /dev/null "https://$DAES_CONSOLE_DOMAIN/" 2>/dev/null; then
    pass "https://$DAES_CONSOLE_DOMAIN/ reachable"
  else
    fail "operator console unreachable"
  fi
fi

# ---------------------------------------------------------------------------
# 4. IPFS HTTP gateway behind basic_auth
# ---------------------------------------------------------------------------
hdr "4. IPFS HTTP gateway"

if [[ -n "${DAES_IPFS_DOMAIN:-}" ]]; then
  # Without auth → expect 401
  code=$($CURL -o /dev/null -w '%{http_code}' "https://$DAES_IPFS_DOMAIN/" 2>/dev/null || echo "000")
  if [[ "$code" == "401" ]]; then
    pass "https://$DAES_IPFS_DOMAIN/ requires auth (HTTP 401) — basic_auth wired"
  else
    fail "https://$DAES_IPFS_DOMAIN/ returned $code (expected 401)"
  fi
fi

# ---------------------------------------------------------------------------
# 5. SwarmSeedVRF (skipped if not configured)
# ---------------------------------------------------------------------------
hdr "5. Swarm seed source"

if [[ -z "${SEED_VRF_RPC:-}" || -z "${SEED_VRF_CONTRACT:-}" ]]; then
  skip "SEED_VRF_RPC/SEED_VRF_CONTRACT not set — runtime is on dev SEED fallback"
else
  if ! command -v cast >/dev/null 2>&1; then
    skip "cast not installed — can't verify latestSeed()"
  else
    seed=$(cast call --rpc-url "$SEED_VRF_RPC" "$SEED_VRF_CONTRACT" 'latestSeed()(uint256)' 2>/dev/null || echo "")
    if [[ "$seed" == "0" || -z "$seed" ]]; then
      fail "latestSeed() = $seed — VRF not fulfilled"
    else
      pass "latestSeed() = ${seed:0:18}…"
    fi
  fi
fi

# ---------------------------------------------------------------------------
# 6. Container health (locally accessible only)
# ---------------------------------------------------------------------------
hdr "6. Container health"

if command -v docker >/dev/null 2>&1; then
  unhealthy=$(docker compose -f deploy/docker-compose.yaml -f deploy/docker-compose.prod.yaml \
      --env-file "$ENV_FILE" ps --format json 2>/dev/null | \
      python3 -c "import sys,json
unhealthy=[]
for line in sys.stdin:
    line=line.strip()
    if not line: continue
    try: rec=json.loads(line)
    except: continue
    h=rec.get('Health','')
    s=rec.get('State','')
    if h and h not in ('healthy','starting',''): unhealthy.append(rec.get('Service',rec.get('Name','?'))+'='+h)
    elif s and s not in ('running','starting'):  unhealthy.append(rec.get('Service',rec.get('Name','?'))+'='+s)
print('\n'.join(unhealthy))
" 2>/dev/null || true)
  if [[ -z "$unhealthy" ]]; then
    pass "all containers running/healthy"
  else
    fail "unhealthy containers: $unhealthy"
  fi
else
  skip "docker not on PATH — can't inspect container health"
fi

echo
if [[ "$failures" == "0" ]]; then
  echo "✓ smoke tests passed"
  exit 0
else
  echo "✗ smoke: $failures endpoint(s) unhealthy" >&2
  exit 1
fi
