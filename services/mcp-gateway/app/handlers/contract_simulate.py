# services/mcp-gateway/app/handlers/contract_simulate.py
# Simulates a contract call. If TENDERLY_URL is set, uses a Tenderly fork
# (richer trace). Otherwise falls back to the local Anvil/Geth node via
# debug_traceCall (best-effort trace).
import os
from typing import Any
import httpx

TENDERLY_URL = os.environ.get("UPSTREAM_TENDERLY", "") or os.environ.get("TENDERLY_URL", "")
ANVIL_URL    = os.environ.get("UPSTREAM_ANVIL",    "http://blockchain-node:8545")

TIMEOUT = httpx.Timeout(connect=3.0, read=5.0, write=3.0, pool=3.0)


async def _rpc(url: str, method: str, params: list[Any]) -> Any:
    async with httpx.AsyncClient(timeout=TIMEOUT) as http:
        r = await http.post(url, json={"jsonrpc": "2.0", "id": 1, "method": method, "params": params})
        r.raise_for_status()
        body = r.json()
        if "error" in body:
            raise RuntimeError(f"{method} failed: {body['error']}")
        return body.get("result")


async def handle_contract_simulate(payload: dict[str, Any]) -> dict[str, Any]:
    call = {
        "from":  payload["from"],
        "to":    payload["to"],
        "value": payload.get("value", "0x0"),
        "data":  payload["data"],
    }
    block_tag = payload.get("block_tag", "latest")

    url    = TENDERLY_URL or ANVIL_URL
    source = "tenderly_fork" if TENDERLY_URL else "anvil_local_fork"

    try:
        if TENDERLY_URL:
            # Tenderly simulation API format:
            # POST {account}/project/{project}/simulate with network_id, from, to, input, value.
            tenderly_payload = {
                "network_id": str(payload.get("chain_id", 8453)),
                "from": call["from"],
                "to": call["to"],
                "input": call["data"],
                "value": call.get("value", "0x0"),
                "block_number": None if block_tag == "latest" else int(block_tag, 16) if block_tag.startswith("0x") else int(block_tag),
                "save": False,
                "save_if_fails": False,
            }
            async with httpx.AsyncClient(timeout=TIMEOUT) as http:
                r = await http.post(
                    f"{TENDERLY_URL}/simulate",
                    json=tenderly_payload,
                    headers={"X-Access-Key": os.environ.get("TENDERLY_ACCESS_KEY", "")},
                )
                r.raise_for_status()
                sim = r.json()
            tx = sim.get("transaction") or {}
            return {
                "success": bool(tx.get("status", True)),
                "gas_used": int(tx.get("gas_used", 0)),
                "return_data": "0x" + (tx.get("transaction_info", {}).get("call_trace", {}).get("output", "").lstrip("0x") or ""),
                "trace": tx.get("transaction_info", {}).get("call_trace", []),
                "source": source,
            }
        ret  = await _rpc(url, "eth_call", [call, block_tag])
        gest = await _rpc(url, "eth_estimateGas", [call])
        return {
            "success": True,
            "gas_used": int(gest, 16),
            "return_data": ret,
            "trace": [],
            "source": source,
        }
    except RuntimeError as e:
        return {"success": False, "gas_used": 0, "return_data": "0x", "trace": [], "source": source, "error": str(e)}
