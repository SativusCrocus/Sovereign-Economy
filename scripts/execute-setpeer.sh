#!/usr/bin/env bash
# scripts/execute-setpeer.sh
# Runs executeAction on both chains' governors for the staged setPeer actions.
# Safe to run any time after the 24h timelock expires (2026-04-21 ~12:47 UTC
# for the April 2026 staging). executeAction is permissionless post-timelock,
# so it can be called by any funded EOA — we use DEPLOYER_PRIVATE_KEY.
#
# Prints the post-execution peer configuration so you can verify wiring.
set -euo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
set -a; source "$REPO_ROOT/deploy/.env"; set +a

BASE_RPC=$BASE_SEPOLIA_RPC_URL
OP_RPC=$OP_SEPOLIA_RPC_URL
KEY=$DEPLOYER_PRIVATE_KEY

BASE_GOV=0x6002f6697d254c7e3b2AB43C11787a9e50efAAAc
BASE_OAPP=0x92613892913C4671d2c53396d916dB3F027A9160
BASE_ACTION=0xbdbad4a9067bb237da878e24e3f5161a99406a072256c176ff234afe29c85f5b
BASE_PEER_EID=40232

OP_GOV=0x3c51bee21067a5BF95B1b6e3578dd361c1cE6c66
OP_OAPP=0x30fda921802C5a755ef6bC27Dd9A36e1f76e2299
OP_ACTION=0x9ffcd0c5e4953cfc7534be8e9bcde94b24ef7f0e1ea32709210e40a9d4986640
OP_PEER_EID=40245

echo "=== BASE SEPOLIA executeAction ==="
cast send --rpc-url "$BASE_RPC" --private-key "$KEY" "$BASE_GOV" "executeAction(bytes32)" "$BASE_ACTION" \
  | grep -E "^(status|transactionHash|blockNumber)"

echo "=== OP SEPOLIA executeAction ==="
cast send --rpc-url "$OP_RPC" --private-key "$KEY" "$OP_GOV" "executeAction(bytes32)" "$OP_ACTION" \
  | grep -E "^(status|transactionHash|blockNumber)"

echo
echo "=== Verify peers are now wired ==="
echo "Base OApp.peers[$BASE_PEER_EID] = $(cast call --rpc-url "$BASE_RPC" "$BASE_OAPP" 'peers(uint32)(bytes32)' "$BASE_PEER_EID")"
echo "OP   OApp.peers[$OP_PEER_EID] = $(cast call --rpc-url "$OP_RPC"   "$OP_OAPP"   'peers(uint32)(bytes32)' "$OP_PEER_EID")"
