#!/usr/bin/env bash
# scripts/caddy-validate.sh — validate deploy/Caddyfile against a synthetic
# prod-shaped env, so the pre-commit / Claude verify hooks can catch
# Caddyfile syntax errors without needing real domains or a real bcrypt
# hash on disk.
#
# Skips silently (exit 0) if docker isn't available — the same fallback
# verify.sh:174 uses, so contributors without a docker daemon aren't
# blocked from committing Caddyfile changes (CI runs the same check).
#
# Usage:
#   bash scripts/caddy-validate.sh
#
# Exit 0 = Caddyfile parsed cleanly (or skipped).
# Exit 1 = parse error; details on stderr.

set -euo pipefail

HERE="$(cd "$(dirname "$0")/.." && pwd)"
CADDYFILE="$HERE/deploy/Caddyfile"

if [[ ! -f "$CADDYFILE" ]]; then
  echo "error: $CADDYFILE not found" >&2; exit 1
fi

if ! command -v docker >/dev/null 2>&1 || ! docker info >/dev/null 2>&1; then
  echo "caddy validate: docker unavailable — skipping (CI will catch it)" >&2
  exit 0
fi

# Synthetic placeholder values — the structure is what we're validating,
# not the values. The bcrypt-shaped string is intentionally deterministic
# so the check is reproducible.
exec docker run --rm \
  -e DAES_PUBLIC_DOMAIN=example.com \
  -e DAES_CONSOLE_DOMAIN=console.example.com \
  -e DAES_IPFS_DOMAIN=ipfs.example.com \
  -e DAES_IPFS_USER=u \
  -e 'DAES_IPFS_PASS_HASH=$2a$14$exampleexampleexampleexampleexampleexampleexampleexample' \
  -e DAES_ACME_EMAIL=ops@example.com \
  -v "$CADDYFILE:/etc/caddy/Caddyfile:ro" \
  caddy:2.8.4-alpine caddy validate --config /etc/caddy/Caddyfile
