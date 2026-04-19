#!/usr/bin/env bash
# scripts/sync-abi.sh — copy contracts/abi/*.abi.json into frontend/lib/abi/
# Run after `npx hardhat compile` + `scripts/extract-abi.ts` in contracts/.
set -euo pipefail

HERE="$(cd "$(dirname "$0")/.." && pwd)"
SRC="$HERE/contracts/abi"
DST="$HERE/frontend/lib/abi"

mkdir -p "$DST"
cp -v "$SRC"/*.abi.json "$DST/"
echo "→ synced $(ls "$SRC" | wc -l | tr -d ' ') ABIs into $DST"
