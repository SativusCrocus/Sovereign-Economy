#!/usr/bin/env bash
# .claude/scripts/verify.sh — pre-commit/pre-push verification.
#
# Wired in via PreToolUse hook on the Bash tool (.claude/settings.local.json).
# Reads the tool input JSON on stdin; if the command contains `git commit` or
# `git push`, runs scoped verification on the change set:
#   - staged   files for `git commit`
#   - branch-vs-upstream files for `git push`
# Blocks the bash call (exit 2) on any failed check.
#
# Bypass: set DAES_SKIP_VERIFY=1 in the environment.
#
# Exit codes:
#   0 — allow the bash command (no checks needed, or all passed)
#   2 — block; reason printed to stderr.
#
# Tools that are not installed are SKIPPED with a warning, not failed —
# verification is best-effort, but the docs mirror + gitleaks are universal.

set -uo pipefail

log() { printf '[verify] %s\n' "$*" >&2; }
die() { printf '[verify] BLOCK: %s\n' "$*" >&2; exit 2; }

INPUT="$(cat)"
CMD="$(printf '%s' "$INPUT" | jq -r '.tool_input.command // ""' 2>/dev/null || echo "")"

# Fast path: not a git commit/push, allow with no work.
case "$CMD" in
  *"git commit"*|*"git push"*) ;;
  *) exit 0 ;;
esac

if [[ "${DAES_SKIP_VERIFY:-0}" == "1" ]]; then
  log "DAES_SKIP_VERIFY=1 — skipping (you assert the tree is clean)"
  exit 0
fi

REPO_ROOT="${CLAUDE_PROJECT_DIR:-$(git rev-parse --show-toplevel 2>/dev/null || echo "")}"
if [[ -z "$REPO_ROOT" || ! -d "$REPO_ROOT" ]]; then
  die "could not resolve repo root (CLAUDE_PROJECT_DIR='${CLAUDE_PROJECT_DIR:-}' PWD='$PWD')"
fi
cd "$REPO_ROOT"

# Compute change set.
case "$CMD" in
  *"git commit"*)
    CHANGED="$(git diff --cached --name-only)"
    SCOPE="staged"
    ;;
  *"git push"*)
    UPSTREAM="$(git rev-parse --abbrev-ref --symbolic-full-name '@{u}' 2>/dev/null || echo "")"
    if [[ -n "$UPSTREAM" ]]; then
      CHANGED="$(git diff "$UPSTREAM"..HEAD --name-only 2>/dev/null || echo "")"
      SCOPE="branch ahead of $UPSTREAM"
    else
      CHANGED="$(git diff HEAD~1..HEAD --name-only 2>/dev/null || echo "")"
      SCOPE="last commit (no upstream)"
    fi
    ;;
esac

if [[ -z "$CHANGED" ]]; then
  log "no changes detected ($SCOPE) — nothing to verify, allowing"
  exit 0
fi

NUM=$(printf '%s\n' "$CHANGED" | wc -l | tr -d ' ')
log "verifying $NUM file(s) ($SCOPE)..."

has_changes() {
  printf '%s\n' "$CHANGED" | grep -E "$1" >/dev/null 2>&1
}

run_check() {
  local name="$1"; shift
  log "running $name..."
  if ! "$@" >&2; then
    die "$name failed — fix and retry. Bypass: DAES_SKIP_VERIFY=1"
  fi
  log "$name ✓"
}

run_check_optional() {
  local name="$1" bin="$2"; shift 2
  if ! command -v "$bin" >/dev/null 2>&1; then
    log "$name: '$bin' not installed — skipping (recommended but not required)"
    return 0
  fi
  run_check "$name" "$bin" "$@"
}

# ---------------------------------------------------------------------------
# Always-on
# ---------------------------------------------------------------------------

# gitleaks — scan staged content (commit) or full history-since-upstream (push)
if command -v gitleaks >/dev/null 2>&1; then
  if [[ "$SCOPE" == "staged" ]]; then
    run_check "gitleaks (staged)" gitleaks protect --staged --redact -v
  else
    run_check "gitleaks (history)" gitleaks detect --redact -v
  fi
else
  log "gitleaks: not installed — skipping (brew install gitleaks)"
fi

# Docs mirror drift — canonical files in docs/ must match frontend/docs/.
# Caught two stale-mirror bugs already; cheap to enforce.
if has_changes '^(docs|frontend/docs)/.*\.md$'; then
  for f in audit-notes.md architecture.md; do
    if [[ -f "docs/$f" && -f "frontend/docs/$f" ]]; then
      if ! diff -q "docs/$f" "frontend/docs/$f" >/dev/null 2>&1; then
        die "docs/$f and frontend/docs/$f are out of sync — copy the canonical doc/ over to frontend/docs/"
      fi
    fi
  done
  log "docs mirror ✓"
fi

# ---------------------------------------------------------------------------
# Solidity / Hardhat / Foundry — only when contracts touched
# ---------------------------------------------------------------------------

if has_changes '^contracts/(src|test|interfaces|test-forge)/.*\.(sol|ts)$'; then
  ( cd contracts && run_check "solhint" npx --no-install solhint --max-warnings 0 "src/**/*.sol" )
  ( cd contracts && run_check "hardhat test" npx --no-install hardhat test )
fi

if has_changes '^contracts/(src|test-forge)/.*\.sol$'; then
  ( cd contracts && run_check_optional "forge invariants" forge test --match-path "test-forge/**" )
fi

if has_changes '^contracts/(src|interfaces)/.*\.sol$'; then
  # slither is slowest — gate it last, after fast checks have already failed fast.
  ( cd contracts && run_check_optional "slither" slither . )
fi

# ---------------------------------------------------------------------------
# Python — only when agent-swarm-runtime touched
# ---------------------------------------------------------------------------

if has_changes '^services/agent-swarm-runtime/.*\.py$'; then
  ( cd services/agent-swarm-runtime && run_check_optional "ruff" ruff check . )
  if command -v pytest >/dev/null 2>&1 && [[ -d services/agent-swarm-runtime/tests ]]; then
    ( cd services/agent-swarm-runtime && run_check "pytest" pytest -x -q )
  fi
fi

# ---------------------------------------------------------------------------
# TypeScript — only when goose-executor touched
# ---------------------------------------------------------------------------

if has_changes '^services/goose-executor/.*\.(ts|tsx|js)$'; then
  ( cd services/goose-executor && run_check "tsc" npx --no-install tsc --noEmit )
fi

# ---------------------------------------------------------------------------
# YAML / Caddy
# ---------------------------------------------------------------------------

YAML_FILES="$(printf '%s\n' "$CHANGED" | grep -E '\.(ya?ml)$' || true)"
if [[ -n "$YAML_FILES" ]]; then
  if command -v yamllint >/dev/null 2>&1; then
    # Loosen rules: line-length and document-start are stylistic; truthy bites
    # docker-compose `on: [push]` style.
    run_check "yamllint" yamllint -d "{rules: {line-length: disable, document-start: disable, truthy: disable}}" $YAML_FILES
  else
    log "yamllint: not installed — skipping (pip install yamllint)"
  fi
fi

if has_changes '(^|/)Caddyfile$'; then
  if command -v docker >/dev/null 2>&1 && docker info >/dev/null 2>&1; then
    run_check "caddy validate" docker run --rm \
      -e DAES_PUBLIC_DOMAIN=example.com \
      -e DAES_CONSOLE_DOMAIN=console.example.com \
      -e DAES_IPFS_DOMAIN=ipfs.example.com \
      -e DAES_IPFS_USER=u \
      -e DAES_IPFS_PASS_HASH='$2a$14$exampleexampleexampleexampleexampleexampleexampleexample' \
      -e DAES_ACME_EMAIL=ops@example.com \
      -v "$REPO_ROOT/deploy/Caddyfile:/etc/caddy/Caddyfile:ro" \
      caddy:2.8.4-alpine caddy validate --config /etc/caddy/Caddyfile
  else
    log "caddy validate: docker not available — skipping"
  fi
fi

log "all checks passed — proceeding"
exit 0
