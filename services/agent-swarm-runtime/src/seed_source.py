# services/agent-swarm-runtime/src/seed_source.py
# Resolve the swarm deterministic seed.
#
# Priority:
#   1. On-chain SwarmSeedVRF.latestSeed() via SEED_VRF_RPC + SEED_VRF_CONTRACT
#      (production path — seed is Chainlink VRF output, rotation gated by the
#      DAESGovernor 3-of-5 + 86400s pipeline).
#   2. SEED env var (local dev / bootstrap before the first VRF fulfilment).
#
# Hand-rolled JSON-RPC so we don't pull in web3.py for one view call.
import logging
import os
from typing import Optional

import httpx
from eth_hash.auto import keccak

log = logging.getLogger("daes.swarm.seed")

# 4-byte selector for SwarmSeedVRF.latestSeed()
_LATEST_SEED_SELECTOR = "0x" + keccak(b"latestSeed()")[:4].hex()


def _resolve_from_vrf(rpc_url: str, contract: str, timeout_s: float = 5.0) -> Optional[int]:
    """Return the seed via eth_call to SwarmSeedVRF.latestSeed(); None if unavailable."""
    try:
        with httpx.Client(timeout=timeout_s) as c:
            r = c.post(
                rpc_url,
                json={
                    "jsonrpc": "2.0",
                    "id": 1,
                    "method": "eth_call",
                    "params": [{"to": contract, "data": _LATEST_SEED_SELECTOR}, "latest"],
                },
            )
            r.raise_for_status()
            body = r.json()
            if "error" in body:
                # Most commonly NoSeedYet() before the first VRF fulfilment.
                log.warning("latestSeed() reverted: %s", body["error"])
                return None
            raw = body.get("result", "0x")
            if not raw or raw in ("0x", "0x0"):
                return None
            # Return ABI layout: (uint256 seed, uint256 fulfilledAtBlock)
            #   bytes 0-63  = seed (first 32 bytes, hex chars 2..66)
            #   bytes 64-127 = fulfilledAtBlock
            seed_hex = raw[2:66]
            return int(seed_hex, 16)
    except (httpx.HTTPError, ValueError) as e:
        log.warning("VRF fetch failed (%s); falling back to SEED env", e)
        return None


def resolve_seed() -> int:
    """Resolve the deterministic swarm seed. See module docstring for priority."""
    rpc_url = os.environ.get("SEED_VRF_RPC", "")
    contract = os.environ.get("SEED_VRF_CONTRACT", "")
    if rpc_url and contract:
        seed = _resolve_from_vrf(rpc_url, contract)
        if seed is not None:
            log.info("seed resolved from SwarmSeedVRF @ %s", contract)
            return seed
        log.warning("SEED_VRF_* set but unreachable or not-yet-fulfilled; falling back to SEED env")
    return int(os.environ.get("SEED", "0xDEADBEEF"), 16)
