#!/usr/bin/env bash
# deploy/deploy-staging.sh — build and bring up the staging stack at a
# specific git sha. The sha is stamped onto every locally-built image so
# rollback.sh can pin to it later without rebuilding.
#
# Usage:
#   bash deploy/deploy-staging.sh                  # uses HEAD
#   bash deploy/deploy-staging.sh <sha-or-ref>     # any reachable ref
#   ENV_FILE=deploy/.env.staging.alt bash deploy/deploy-staging.sh
#
# Steps:
#   1. resolve sha and verify worktree is clean (warn if not)
#   2. preflight against the staging env file
#   3. docker compose build — tagged daes-<svc>:<sha>
#   4. docker compose up -d
#   5. post-deploy smoke
#   6. on success, record sha to deploy/.staging-last-good
#
# Exit 0 on green smoke. Any earlier failure aborts before bringing the
# stack up; smoke failure leaves the stack up but does NOT advance
# .staging-last-good — promote-to-prod.sh refuses to act on a failed sha.

set -euo pipefail

HERE="$(cd "$(dirname "$0")/.." && pwd)"
ENV_FILE="${ENV_FILE:-$HERE/deploy/.env.staging}"
LAST_GOOD="$HERE/deploy/.staging-last-good"

# ---------------------------------------------------------------------------
# 1. Resolve target sha
# ---------------------------------------------------------------------------
REF="${1:-HEAD}"
if ! command -v git >/dev/null 2>&1; then
  echo "error: git not on PATH" >&2; exit 1
fi
SHA=$(git -C "$HERE" rev-parse --verify "$REF^{commit}" 2>/dev/null || true)
if [[ -z "$SHA" ]]; then
  echo "error: cannot resolve '$REF' to a commit" >&2
  exit 1
fi
SHORT="${SHA:0:12}"

printf '\033[1mdeploy-staging\033[0m  ref=%s  sha=%s\n' "$REF" "$SHORT"

# Warn (don't block) on dirty worktree — the deployed images come from the
# Docker build context, not the index, so a dirty tree is reproducible-ish
# but not blessed.
if ! git -C "$HERE" diff --quiet || ! git -C "$HERE" diff --cached --quiet; then
  printf '\033[33mwarn:\033[0m worktree has uncommitted changes — staging build will include them\n'
fi

# ---------------------------------------------------------------------------
# 2. Env file + preflight
# ---------------------------------------------------------------------------
if [[ ! -f "$ENV_FILE" ]]; then
  echo "error: $ENV_FILE not found — copy deploy/.env.staging.example and fill in" >&2
  exit 1
fi

printf '\n\033[1mpreflight\033[0m (env=%s)\n' "$ENV_FILE"
ENV_FILE="$ENV_FILE" bash "$HERE/scripts/preflight.sh"

# ---------------------------------------------------------------------------
# 3. Build images tagged with the sha
# ---------------------------------------------------------------------------
COMPOSE_FILES=(
  -f "$HERE/deploy/docker-compose.yaml"
  -f "$HERE/deploy/docker-compose.prod.yaml"
  -f "$HERE/deploy/docker-compose.tagged.yaml"
)

printf '\n\033[1mbuild\033[0m  tag=%s\n' "$SHORT"
DAES_TAG="$SHORT" docker compose "${COMPOSE_FILES[@]}" \
  --env-file "$ENV_FILE" build

# ---------------------------------------------------------------------------
# 4. Bring up
# ---------------------------------------------------------------------------
printf '\n\033[1mup\033[0m\n'
DAES_TAG="$SHORT" docker compose "${COMPOSE_FILES[@]}" \
  --env-file "$ENV_FILE" up -d

# ---------------------------------------------------------------------------
# 5. Smoke (give Caddy + Let's Encrypt a few seconds to issue certs)
# ---------------------------------------------------------------------------
printf '\n\033[1msmoke\033[0m  (warming up 15s before probes)\n'
sleep 15

if ENV_FILE="$ENV_FILE" bash "$HERE/scripts/post-deploy-smoke.sh"; then
  # ---------------------------------------------------------------------------
  # 6. Record sha as last-good staging
  # ---------------------------------------------------------------------------
  printf '%s\n' "$SHA" > "$LAST_GOOD"
  printf '\n\033[32m✓ staging green at %s\033[0m  (recorded in deploy/.staging-last-good)\n' "$SHORT"
  printf 'next: bash deploy/promote-to-prod.sh\n'
  exit 0
else
  printf '\n\033[31m✗ smoke failed — staging stack is up but NOT promoted\033[0m\n' >&2
  printf '   inspect with: docker compose -f deploy/docker-compose.yaml -f deploy/docker-compose.prod.yaml -f deploy/docker-compose.tagged.yaml --env-file %s logs --tail=200\n' "$ENV_FILE" >&2
  exit 1
fi
