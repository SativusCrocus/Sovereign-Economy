#!/usr/bin/env bash
# deploy/rollback.sh — restart prod against a previously-built sha.
#
# Pinning by sha (not "latest") means the rollback is deterministic: we
# point the stack at images that were already built and previously
# bless-tested by deploy-staging.sh. No rebuild, no fresh CI run, no
# chance of a non-reproducible regression.
#
# Usage:
#   bash deploy/rollback.sh                  # uses deploy/.prod-prev
#   bash deploy/rollback.sh <sha>            # operator-chosen sha
#   ENV_FILE=deploy/.env.alt bash rollback.sh
#
# Exit 0 on green smoke. If the requested sha's images are missing
# locally, the script aborts BEFORE touching the running stack — better
# to leave the broken-but-up prod alone than half-roll into a stack with
# no images.

set -euo pipefail

HERE="$(cd "$(dirname "$0")/.." && pwd)"
ENV_FILE="${ENV_FILE:-$HERE/deploy/.env}"
PROD_PREV="$HERE/deploy/.prod-prev"
PROD_LAST_GOOD="$HERE/deploy/.prod-last-good"

# ---------------------------------------------------------------------------
# 1. Resolve target sha
# ---------------------------------------------------------------------------
if [[ "$#" -ge 1 ]]; then
  REF="$1"
  SHA=$(git -C "$HERE" rev-parse --verify "$REF^{commit}" 2>/dev/null || true)
  if [[ -z "$SHA" ]]; then
    echo "error: cannot resolve '$REF' to a commit" >&2; exit 1
  fi
else
  if [[ ! -f "$PROD_PREV" ]]; then
    echo "error: $PROD_PREV not found — there is no previous prod sha to roll back to" >&2
    echo "       (the very first prod deploy has no predecessor; pass a sha explicitly)" >&2
    exit 1
  fi
  SHA=$(< "$PROD_PREV")
  if [[ -z "$SHA" ]]; then
    echo "error: $PROD_PREV is empty" >&2; exit 1
  fi
fi
SHORT="${SHA:0:12}"
printf '\033[1mrollback\033[0m  sha=%s\n' "$SHORT"

# ---------------------------------------------------------------------------
# 2. Verify all 5 built images for this sha exist locally
# ---------------------------------------------------------------------------
required_images=(
  "daes-rag-ingester:$SHORT"
  "daes-agent-swarm-runtime:$SHORT"
  "daes-goose-executor:$SHORT"
  "daes-mcp-gateway:$SHORT"
  "daes-frontend:$SHORT"
)
missing=()
for img in "${required_images[@]}"; do
  docker image inspect "$img" >/dev/null 2>&1 || missing+=("$img")
done
if (( ${#missing[@]} > 0 )); then
  echo "error: cannot roll back to $SHORT — images missing locally:" >&2
  printf '       %s\n' "${missing[@]}" >&2
  echo "       Re-build them with: bash deploy/deploy-staging.sh $SHORT" >&2
  echo "       (this will rehearse the rollback target through staging first)" >&2
  exit 1
fi
printf '  all 5 images present locally\n'

# ---------------------------------------------------------------------------
# 3. Confirm — rollback is a destructive-ish action (state may diverge
#    between schemas if a forward migration ran). Always prompt.
# ---------------------------------------------------------------------------
if [[ -t 0 && "${ROLLBACK_NONINTERACTIVE:-0}" != "1" ]]; then
  printf '\n\033[1;33mrollback will restart prod containers at %s\033[0m\n' "$SHORT"
  printf '  - if forward migrations ran since this sha, manual schema rollback may be needed\n'
  printf '  - mounted volumes (weaviate/, prom/, grafana/, geth/, ipfs/) are NOT touched\n'
  printf 'continue? [y/N] '
  read -r ans
  [[ "$ans" =~ ^[Yy]$ ]] || { echo "aborted"; exit 1; }
fi

# ---------------------------------------------------------------------------
# 4. Up the stack at the rollback sha
# ---------------------------------------------------------------------------
COMPOSE_FILES=(
  -f "$HERE/deploy/docker-compose.yaml"
  -f "$HERE/deploy/docker-compose.prod.yaml"
  -f "$HERE/deploy/docker-compose.tagged.yaml"
)

printf '\n\033[1mup\033[0m\n'
DAES_TAG="$SHORT" docker compose "${COMPOSE_FILES[@]}" \
  --env-file "$ENV_FILE" up -d

# ---------------------------------------------------------------------------
# 5. Smoke
# ---------------------------------------------------------------------------
printf '\n\033[1msmoke\033[0m  (warming up 15s)\n'
sleep 15

if ENV_FILE="$ENV_FILE" bash "$HERE/scripts/post-deploy-smoke.sh"; then
  # The rollback target is now the production-current sha. Update
  # last-good but do NOT touch .prod-prev — keeping the chain intact lets
  # an operator roll back AGAIN to two-versions-prior in an emergency.
  printf '%s\n' "$SHA" > "$PROD_LAST_GOOD"
  printf '\n\033[32m✓ rolled back to %s\033[0m\n' "$SHORT"
  exit 0
else
  printf '\n\033[31m✗ rollback smoke failed at %s — escalate\033[0m\n' "$SHORT" >&2
  exit 1
fi
