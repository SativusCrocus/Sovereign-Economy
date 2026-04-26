#!/usr/bin/env bash
# scripts/docs-sync.sh — sync canonical docs/ into frontend/docs/.
#
# docs/ is the source of truth; frontend/docs/ is a mirror consumed by the
# Next.js console. The CI `docs-mirror` job and the Claude pre-commit hook
# both refuse to let the two diverge. This script is the fix step: edit
# under docs/, then run this to bring frontend/docs/ back into sync.
#
# Usage:
#   bash scripts/docs-sync.sh           # apply
#   bash scripts/docs-sync.sh --check   # exit 1 if drift exists; don't write

set -euo pipefail

HERE="$(cd "$(dirname "$0")/.." && pwd)"
SRC="$HERE/docs"
DST="$HERE/frontend/docs"

# Files mirrored. Keep in lock-step with .github/workflows/ci.yml::docs-mirror.
FILES=(audit-notes.md architecture.md)

CHECK_ONLY=0
if [[ "${1:-}" == "--check" ]]; then
  CHECK_ONLY=1
fi

drift=0
for f in "${FILES[@]}"; do
  src="$SRC/$f"
  dst="$DST/$f"
  if [[ ! -f "$src" ]]; then
    echo "  skip $f — missing in docs/" >&2
    continue
  fi
  if [[ ! -f "$dst" ]] || ! diff -q "$src" "$dst" >/dev/null 2>&1; then
    if [[ "$CHECK_ONLY" == "1" ]]; then
      echo "  DRIFT $f" >&2
      drift=1
    else
      mkdir -p "$DST"
      cp -v "$src" "$dst"
    fi
  fi
done

if [[ "$CHECK_ONLY" == "1" ]]; then
  if [[ "$drift" == "0" ]]; then
    echo "docs mirror in sync ✓"
  else
    echo "drift detected — run: bash scripts/docs-sync.sh" >&2
    exit 1
  fi
fi
