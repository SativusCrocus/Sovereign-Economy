#!/usr/bin/env bash
# deploy/promote-to-prod.sh — promote a staging-blessed sha to production.
#
# Strict gate: the script REFUSES to act unless deploy/.staging-last-good
# exists and is recent (default: less than 24h old). That file is only
# written by deploy-staging.sh after smoke tests pass, so prod deploys
# inherit a verified-green build.
#
# Usage:
#   bash deploy/promote-to-prod.sh                 # uses .staging-last-good
#   bash deploy/promote-to-prod.sh <sha>           # operator-pinned override
#   STAGING_MAX_AGE_S=86400 bash promote-to-prod.sh
#   ENV_FILE=deploy/.env.alt bash promote-to-prod.sh
#
# Side effects:
#   - rotates deploy/.prod-last-good (current sha → deploy/.prod-prev for one-shot rollback)
#   - brings up the prod stack with the staging-built images (NO rebuild)
#   - runs preflight + smoke against the prod env
#
# Exit 0 = prod is live and smoke is green. Smoke failure leaves prod
# running on the new sha; operator should run rollback.sh immediately.

set -euo pipefail

HERE="$(cd "$(dirname "$0")/.." && pwd)"
ENV_FILE="${ENV_FILE:-$HERE/deploy/.env}"
STAGING_LAST_GOOD="$HERE/deploy/.staging-last-good"
PROD_LAST_GOOD="$HERE/deploy/.prod-last-good"
PROD_PREV="$HERE/deploy/.prod-prev"
STAGING_MAX_AGE_S="${STAGING_MAX_AGE_S:-86400}"  # 24h default

# ---------------------------------------------------------------------------
# 1. Resolve sha — either operator-pinned or from .staging-last-good
# ---------------------------------------------------------------------------
if [[ "$#" -ge 1 ]]; then
  REF="$1"
  SHA=$(git -C "$HERE" rev-parse --verify "$REF^{commit}" 2>/dev/null || true)
  if [[ -z "$SHA" ]]; then
    echo "error: cannot resolve '$REF' to a commit" >&2; exit 1
  fi
  printf '\033[33mwarn:\033[0m operator override — promoting %s without checking .staging-last-good\n' "${SHA:0:12}"
else
  if [[ ! -f "$STAGING_LAST_GOOD" ]]; then
    echo "error: $STAGING_LAST_GOOD not found — run deploy-staging.sh first" >&2
    echo "       (or pass an explicit sha to override, but only after a manual rehearsal)" >&2
    exit 1
  fi
  SHA=$(< "$STAGING_LAST_GOOD")
  if [[ -z "$SHA" ]]; then
    echo "error: $STAGING_LAST_GOOD is empty" >&2; exit 1
  fi

  # Refuse to promote a stale staging run. Catches the "deployed staging
  # last week, drifted, forgot to re-rehearse" foot-gun.
  age_s=$(( $(date +%s) - $(stat -f %m "$STAGING_LAST_GOOD" 2>/dev/null || stat -c %Y "$STAGING_LAST_GOOD") ))
  if (( age_s > STAGING_MAX_AGE_S )); then
    echo "error: $STAGING_LAST_GOOD is ${age_s}s old (> ${STAGING_MAX_AGE_S}s) — re-run deploy-staging.sh" >&2
    echo "       (override: STAGING_MAX_AGE_S=$age_s bash $0)" >&2
    exit 1
  fi
fi
SHORT="${SHA:0:12}"
printf '\033[1mpromote-to-prod\033[0m  sha=%s\n' "$SHORT"

# ---------------------------------------------------------------------------
# 2. Verify the local images for this sha exist (built by deploy-staging.sh)
# ---------------------------------------------------------------------------
required_images=(
  "daes-rag-ingester:$SHORT"
  "daes-agent-swarm-runtime:$SHORT"
  "daes-goose-executor:$SHORT"
  "daes-mcp-gateway:$SHORT"
  "daes-frontend:$SHORT"
)
for img in "${required_images[@]}"; do
  if ! docker image inspect "$img" >/dev/null 2>&1; then
    echo "error: image $img not present locally — run deploy-staging.sh first" >&2
    exit 1
  fi
done
printf '  all 5 images present locally\n'

# ---------------------------------------------------------------------------
# 3. Prod env file + preflight
# ---------------------------------------------------------------------------
if [[ ! -f "$ENV_FILE" ]]; then
  echo "error: $ENV_FILE not found" >&2
  exit 1
fi

# Mainnet-promotion gate: prod env may set DAES_ALLOW_MAINNET=1. Surface it
# so the operator confirms intent.
if grep -q '^DAES_ALLOW_MAINNET=1' "$ENV_FILE" 2>/dev/null; then
  printf '\n\033[1;31m!!! mainnet flag is ON — this promotion can deploy to L1 mainnet !!!\033[0m\n'
  printf '    Tier 4 audit must be complete. See docs/runbook.md → "Mainnet promotion".\n'
  printf '    Continue? [y/N] '
  read -r ans
  [[ "$ans" =~ ^[Yy]$ ]] || { echo "aborted"; exit 1; }
fi

printf '\n\033[1mpreflight\033[0m (env=%s)\n' "$ENV_FILE"
ENV_FILE="$ENV_FILE" bash "$HERE/scripts/preflight.sh"

# ---------------------------------------------------------------------------
# 4. Rotate last-good pointers BEFORE bringing the new stack up, so a
#    failed promotion still leaves a usable .prod-prev for rollback.
# ---------------------------------------------------------------------------
if [[ -f "$PROD_LAST_GOOD" ]]; then
  cp "$PROD_LAST_GOOD" "$PROD_PREV"
  printf '\nprev-prod: %s -> deploy/.prod-prev\n' "$(< "$PROD_PREV" | cut -c1-12)"
fi

# ---------------------------------------------------------------------------
# 5. Bring up prod stack with the staging-built images (no --build)
# ---------------------------------------------------------------------------
COMPOSE_FILES=(
  -f "$HERE/deploy/docker-compose.yaml"
  -f "$HERE/deploy/docker-compose.prod.yaml"
  -f "$HERE/deploy/docker-compose.tagged.yaml"
)

printf '\n\033[1mup\033[0m  (no rebuild — using staging-blessed images)\n'
DAES_TAG="$SHORT" docker compose "${COMPOSE_FILES[@]}" \
  --env-file "$ENV_FILE" up -d

# ---------------------------------------------------------------------------
# 6. Smoke
# ---------------------------------------------------------------------------
printf '\n\033[1msmoke\033[0m  (warming up 15s)\n'
sleep 15

if ENV_FILE="$ENV_FILE" bash "$HERE/scripts/post-deploy-smoke.sh"; then
  printf '%s\n' "$SHA" > "$PROD_LAST_GOOD"
  printf '\n\033[32m✓ prod live at %s\033[0m  (recorded in deploy/.prod-last-good)\n' "$SHORT"
  exit 0
else
  printf '\n\033[31m✗ prod smoke failed at %s\033[0m\n' "$SHORT" >&2
  printf '   .prod-prev still points at the previous good sha — run:\n' >&2
  printf '   bash deploy/rollback.sh\n' >&2
  exit 1
fi
