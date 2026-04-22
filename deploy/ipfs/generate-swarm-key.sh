#!/usr/bin/env bash
# deploy/ipfs/generate-swarm-key.sh
# Generate a kubo private-network swarm key. When mounted at
# /data/ipfs/swarm.key and the LIBP2P_FORCE_PNET=1 env var is set, the
# daemon refuses to peer with any node that doesn't share the same key —
# audit-log data never leaks to the public IPFS DHT.
#
# Key format (libp2p PNet v1): three lines:
#   /key/swarm/psk/1.0.0/
#   /base16/
#   <64 random hex chars>
#
# Rotate by deleting the file and re-running. All previously-peered nodes
# must be updated at the same time; rotation is not graceful.
set -euo pipefail

KEY_DIR="$(cd "$(dirname "$0")" && pwd)"
KEY_PATH="$KEY_DIR/swarm.key"

if [[ -f "$KEY_PATH" ]]; then
  echo "error: $KEY_PATH already exists. Delete it explicitly if you want to rotate." >&2
  exit 1
fi

HEX=$(openssl rand -hex 32)
{
  echo "/key/swarm/psk/1.0.0/"
  echo "/base16/"
  echo "$HEX"
} > "$KEY_PATH"
chmod 600 "$KEY_PATH"
echo "wrote $KEY_PATH (chmod 600)"
echo
echo "Next:"
echo "  - commit nothing (deploy/ipfs/swarm.key is gitignored)"
echo "  - distribute the same file to every peer you want in the private net"
echo "  - restart the ipfs service so LIBP2P_FORCE_PNET=1 picks up the key"
