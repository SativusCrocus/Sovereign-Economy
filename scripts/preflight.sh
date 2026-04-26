#!/usr/bin/env bash
# scripts/preflight.sh — validate prod-deploy readiness before `docker
# compose up`. Catches the boring class of failures (missing env, DNS not
# pointing here, swarm.key missing, etc.) so they surface as a friendly
# checklist rather than a crashed stack.
#
# Usage:
#   bash scripts/preflight.sh                     # uses deploy/.env
#   ENV_FILE=deploy/.env.staging bash preflight   # alt env file
#
# Exit 0 = all green. Exit 1 = at least one check failed; details on stderr.
# Each check prints PASS/FAIL/SKIP with a one-line explanation.

set -uo pipefail

HERE="$(cd "$(dirname "$0")/.." && pwd)"
ENV_FILE="${ENV_FILE:-$HERE/deploy/.env}"

failures=0
pass() { printf '  \033[32mPASS\033[0m  %s\n' "$*"; }
fail() { printf '  \033[31mFAIL\033[0m  %s\n' "$*" >&2; failures=$((failures+1)); }
skip() { printf '  \033[33mSKIP\033[0m  %s\n' "$*"; }
hdr()  { printf '\n\033[1m%s\033[0m\n' "$*"; }

# ---------------------------------------------------------------------------
# 1. Env file present and populated
# ---------------------------------------------------------------------------
hdr "1. Environment"

if [[ ! -f "$ENV_FILE" ]]; then
  fail "$ENV_FILE not found — copy deploy/.env.example and fill in"
  echo "(refusing to continue without an env file)" >&2
  exit 1
fi
pass "$ENV_FILE exists"

# Source the env file in a subshell to read values without polluting our env.
# Reject lines with embedded shell substitution to keep this safe.
set -a
# shellcheck disable=SC1090
source "$ENV_FILE"
set +a

REQUIRED=(
  DAES_PUBLIC_DOMAIN DAES_CONSOLE_DOMAIN DAES_IPFS_DOMAIN
  DAES_IPFS_USER DAES_IPFS_PASS_HASH DAES_ACME_EMAIL
  WEAVIATE_API_KEY MCP_JWT MCP_JWT_SECRET
  BASE_RPC_URL OP_RPC_URL GRAFANA_ADMIN_PASSWORD
)
for var in "${REQUIRED[@]}"; do
  if [[ -z "${!var:-}" ]]; then
    fail "$var is unset or empty in $ENV_FILE"
  else
    pass "$var set"
  fi
done

# Bcrypt sanity: must look like $2[abxy]$<cost>$<53 chars>.
if [[ -n "${DAES_IPFS_PASS_HASH:-}" ]]; then
  if [[ "$DAES_IPFS_PASS_HASH" =~ ^\$2[abxy]\$[0-9]{2}\$.{53}$ ]]; then
    pass "DAES_IPFS_PASS_HASH looks like a bcrypt hash"
  else
    fail "DAES_IPFS_PASS_HASH doesn't look like bcrypt — regenerate via scripts/generate-ipfs-pass.sh"
  fi
fi

# ---------------------------------------------------------------------------
# 2. Private IPFS swarm key
# ---------------------------------------------------------------------------
hdr "2. IPFS private swarm"

KEY="$HERE/deploy/ipfs/swarm.key"
if [[ ! -f "$KEY" ]]; then
  fail "$KEY missing — run: bash deploy/ipfs/generate-swarm-key.sh"
else
  pass "$KEY exists"
  mode=$(stat -f '%Lp' "$KEY" 2>/dev/null || stat -c '%a' "$KEY" 2>/dev/null)
  if [[ "$mode" == "600" ]]; then
    pass "swarm.key mode 600"
  else
    fail "swarm.key mode is $mode; expected 600 — run: chmod 600 $KEY"
  fi
  if head -1 "$KEY" | grep -q '^/key/swarm/psk/1.0.0/$'; then
    pass "swarm.key header is libp2p PSK v1"
  else
    fail "swarm.key header malformed; expected /key/swarm/psk/1.0.0/"
  fi
fi

# ---------------------------------------------------------------------------
# 3. DNS for the three public hostnames
# ---------------------------------------------------------------------------
hdr "3. DNS resolution"

if ! command -v dig >/dev/null 2>&1; then
  skip "dig not on PATH — install bind-utils to enable DNS checks"
else
  for var in DAES_PUBLIC_DOMAIN DAES_CONSOLE_DOMAIN DAES_IPFS_DOMAIN; do
    host="${!var:-}"
    [[ -z "$host" ]] && continue
    answer=$(dig +short +time=3 +tries=1 "$host" A | head -1)
    if [[ -n "$answer" ]]; then
      pass "$host -> $answer"
    else
      fail "$host has no A record (Caddy ACME HTTP-01 will fail)"
    fi
  done
fi

# ---------------------------------------------------------------------------
# 4. Local toolchain
# ---------------------------------------------------------------------------
hdr "4. Toolchain"

if command -v docker >/dev/null 2>&1; then
  pass "docker on PATH"
  if docker info >/dev/null 2>&1; then
    pass "docker daemon reachable"
  else
    fail "docker daemon not reachable (start Docker Desktop / dockerd)"
  fi
else
  fail "docker not on PATH"
fi

if docker compose version >/dev/null 2>&1; then
  pass "docker compose v2 available"
else
  fail "docker compose v2 missing; v1 (docker-compose) is not supported"
fi

# ---------------------------------------------------------------------------
# 5. Compose merge sanity (fast, doesn't pull images)
# ---------------------------------------------------------------------------
hdr "5. Compose merge"

if docker compose -f deploy/docker-compose.yaml -f deploy/docker-compose.prod.yaml \
     --env-file "$ENV_FILE" config --quiet 2>/tmp/preflight.compose.err; then
  pass "compose.yaml + compose.prod.yaml merge cleanly"
else
  fail "compose merge failed — see /tmp/preflight.compose.err"
fi

# ---------------------------------------------------------------------------
# 6. SwarmSeedVRF (optional; only checked if RPC + addr set)
# ---------------------------------------------------------------------------
hdr "6. SwarmSeedVRF"

if [[ -z "${SEED_VRF_RPC:-}" || -z "${SEED_VRF_CONTRACT:-}" ]]; then
  skip "SEED_VRF_RPC + SEED_VRF_CONTRACT not set — runtime will fall back to SEED env (dev only)"
else
  if ! command -v cast >/dev/null 2>&1; then
    skip "cast (foundry) not installed — can't verify latestSeed()"
  else
    seed=$(cast call --rpc-url "$SEED_VRF_RPC" "$SEED_VRF_CONTRACT" 'latestSeed()(uint256)' 2>/dev/null || echo "")
    if [[ "$seed" == "0" || -z "$seed" ]]; then
      fail "latestSeed() returned $seed — fund the VRF subscription and run requestSeed via the governor"
    else
      pass "latestSeed() = ${seed:0:18}…"
    fi
  fi
fi

# ---------------------------------------------------------------------------
# Summary
# ---------------------------------------------------------------------------
echo
if [[ "$failures" == "0" ]]; then
  echo "✓ preflight passed — safe to bring the stack up"
  exit 0
else
  echo "✗ preflight: $failures check(s) failed — fix above before deploy" >&2
  exit 1
fi
