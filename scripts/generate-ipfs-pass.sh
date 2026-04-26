#!/usr/bin/env bash
# scripts/generate-ipfs-pass.sh — generate the bcrypt hash for the IPFS
# HTTP gateway's basic_auth and write it into deploy/.env.
#
# The IPFS HTTP gateway sits behind Caddy basic_auth in the prod overlay;
# DAES_IPFS_USER and DAES_IPFS_PASS_HASH must be set before bringing the
# stack up. The hash is bcrypt; Caddy's `caddy hash-password` is the
# canonical generator.
#
# Usage:
#   bash scripts/generate-ipfs-pass.sh
#   bash scripts/generate-ipfs-pass.sh --user alice
#
# Reads the password interactively (stty -echo) so it never appears in
# shell history. Writes/updates DAES_IPFS_USER and DAES_IPFS_PASS_HASH
# in deploy/.env, preserving any existing keys above/below.

set -euo pipefail

HERE="$(cd "$(dirname "$0")/.." && pwd)"
ENV_FILE="$HERE/deploy/.env"

USER_NAME="operator"
if [[ "${1:-}" == "--user" && -n "${2:-}" ]]; then
  USER_NAME="$2"
fi

if ! command -v docker >/dev/null 2>&1; then
  echo "error: docker not on PATH; required for caddy:2.8.4-alpine hash-password" >&2
  exit 1
fi

# Read password silently.
read -r -s -p "Password for IPFS HTTP gateway user '$USER_NAME': " PASS1; echo
read -r -s -p "Confirm: " PASS2; echo
if [[ "$PASS1" != "$PASS2" ]]; then
  echo "error: passwords do not match" >&2
  exit 1
fi
if [[ ${#PASS1} -lt 12 ]]; then
  echo "error: password must be at least 12 chars (it sits behind a public TLS endpoint)" >&2
  exit 1
fi

# Pipe via stdin so the plaintext doesn't appear in process args.
HASH="$(printf '%s' "$PASS1" | docker run --rm -i caddy:2.8.4-alpine caddy hash-password)"
unset PASS1 PASS2

mkdir -p "$(dirname "$ENV_FILE")"
touch "$ENV_FILE"

# Replace or append DAES_IPFS_USER and DAES_IPFS_PASS_HASH.
# Use tmp file + mv to keep file mode + avoid sed -i portability traps.
TMP="$(mktemp)"
trap 'rm -f "$TMP"' EXIT
{
  awk -v u="$USER_NAME" -v h="$HASH" '
    BEGIN { had_u=0; had_h=0 }
    /^DAES_IPFS_USER=/      { print "DAES_IPFS_USER=" u; had_u=1; next }
    /^DAES_IPFS_PASS_HASH=/ { print "DAES_IPFS_PASS_HASH=" h; had_h=1; next }
    { print }
    END {
      if (!had_u) print "DAES_IPFS_USER=" u
      if (!had_h) print "DAES_IPFS_PASS_HASH=" h
    }
  ' "$ENV_FILE"
} > "$TMP"
mv "$TMP" "$ENV_FILE"
chmod 600 "$ENV_FILE"

echo "✓ updated $ENV_FILE"
echo "  DAES_IPFS_USER=$USER_NAME"
echo "  DAES_IPFS_PASS_HASH=<bcrypt, $(echo -n "$HASH" | wc -c | tr -d ' ') chars>"
echo
echo "Next: bring up the prod overlay with"
echo "  docker compose -f deploy/docker-compose.yaml -f deploy/docker-compose.prod.yaml up -d --build"
