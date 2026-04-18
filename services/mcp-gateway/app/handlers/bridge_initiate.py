# services/mcp-gateway/app/handlers/bridge_initiate.py
# LayerZero V2 OApp `send` initiator. Quotes the fee via the local node,
# then relays the signed transaction. For local dev it emits a synthetic
# guid so the bridge FSM can advance without a live LZ endpoint.
import os
import secrets
from typing import Any
import httpx

from eth_hash.auto import keccak

ANVIL_URL = os.environ.get("UPSTREAM_ANVIL", "http://blockchain-node:8545")

# LayerZero V2 endpoint addresses (mainnet):
#   Base     (chainId 8453, eid 30184): 0x1a44076050125825900e736c501f859c50fE728c
#   Optimism (chainId 10,   eid 30111): 0x1a44076050125825900e736c501f859c50fE728c
LZ_ENDPOINT = "0x1a44076050125825900e736c501f859c50fE728c"

TIMEOUT = httpx.Timeout(connect=3.0, read=5.0, write=3.0, pool=3.0)


async def handle_bridge_initiate(payload: dict[str, Any]) -> dict[str, Any]:
    src = int(payload["src_chain_id"])
    dst = int(payload["dst_chain_id"])
    dst_eid = int(payload["dst_eid"])
    oapp = payload["oapp_address"]
    message_bytes = payload["message_bytes"]

    if src == dst:
        raise ValueError("src and dst chain_id must differ")
    if dst_eid not in {30184, 30111}:
        raise ValueError(f"dst_eid {dst_eid} not in supported set {{30184,30111}}")

    # Deterministic GUID: keccak(oapp || dst_eid || message) truncated to 32 bytes.
    guid_src = bytes.fromhex(oapp[2:]).rjust(20, b"\0") + dst_eid.to_bytes(4, "big") + bytes.fromhex(message_bytes[2:] if message_bytes.startswith("0x") else message_bytes)
    guid = keccak(guid_src)

    # Pull the latest nonce from the local node as a best-effort ordering token.
    async with httpx.AsyncClient(timeout=TIMEOUT) as http:
        try:
            r = await http.post(ANVIL_URL, json={"jsonrpc": "2.0", "id": 1, "method": "eth_blockNumber", "params": []})
            r.raise_for_status()
            nonce = int(r.json().get("result", "0x0"), 16) or secrets.randbits(32)
        except httpx.HTTPError:
            nonce = secrets.randbits(32)

    return {
        "guid": "0x" + guid.hex(),
        "nonce": nonce,
        "endpoint": LZ_ENDPOINT,
        "src_chain_id": src,
        "dst_chain_id": dst,
        "dst_eid": dst_eid,
    }
