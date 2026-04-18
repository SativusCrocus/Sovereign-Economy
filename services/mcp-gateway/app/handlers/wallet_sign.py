# services/mcp-gateway/app/handlers/wallet_sign.py
# EIP-4337 v0.7 userOpHash computation + real secp256k1 signing via
# eth-account. If a Pimlico bundler URL is configured, the handler ALSO
# submits the signed UserOp via eth_sendUserOperation and returns the
# bundler's tx hash.
#
# Key resolution order (first match wins):
#   1. AGENT_KEY_<UPPER_SNAKE_AGENT_ID>  (e.g. AGENT_KEY_AGENT_SPECULATOR_0001)
#   2. AGENT_KEY_<ARCHETYPE>             (e.g. AGENT_KEY_SPECULATOR)
#   3. AGENT_KEY_DEFAULT
# No dev fallback — if no key resolves we reject the request. Dev
# deployments must set AGENT_KEY_DEFAULT=<hex private key>.
import logging
import os
from typing import Any

import httpx
from eth_account import Account
from eth_hash.auto import keccak

log = logging.getLogger("daes.mcp.wallet_sign")

ENTRYPOINT_V07_STR = "0x0000000071727De22E5E9d8BAf0edAc6f37da032"
ENTRYPOINT_V07 = bytes.fromhex(ENTRYPOINT_V07_STR[2:])
CHAIN_EID = {8453: 30184, 10: 30111}

PIMLICO_URL_TMPL = os.environ.get("PIMLICO_URL_TEMPLATE", "https://api.pimlico.io/v2/{chain}/rpc?apikey={apikey}")
PIMLICO_API_KEY  = os.environ.get("PIMLICO_API_KEY", "")

TIMEOUT = httpx.Timeout(connect=3.0, read=10.0, write=3.0, pool=3.0)


def _pack_user_op(op: dict[str, Any]) -> bytes:
    def _b(h: str) -> bytes:
        return bytes.fromhex(h[2:] if h.startswith("0x") else h)
    return b"".join([
        _b(op["sender"]).rjust(32, b"\0"),
        int(op["nonce"], 16).to_bytes(32, "big"),
        keccak(_b(op.get("initCode", "0x"))),
        keccak(_b(op.get("callData", "0x"))),
        _b(op["accountGasLimits"]).rjust(32, b"\0"),
        int(op["preVerificationGas"], 16).to_bytes(32, "big"),
        _b(op["gasFees"]).rjust(32, b"\0"),
        keccak(_b(op.get("paymasterAndData", "0x"))),
    ])


def user_op_hash(op: dict[str, Any], chain_id: int) -> bytes:
    inner = keccak(_pack_user_op(op))
    return keccak(inner + ENTRYPOINT_V07.rjust(32, b"\0") + chain_id.to_bytes(32, "big"))


def _resolve_key(agent_id: str) -> str:
    id_key = f"AGENT_KEY_{agent_id.upper().replace('-', '_')}"
    archetype = agent_id.split("-")[1] if "-" in agent_id else ""
    archetype_key = f"AGENT_KEY_{archetype.upper()}"
    for env in (id_key, archetype_key, "AGENT_KEY_DEFAULT"):
        v = os.environ.get(env, "")
        if v:
            return v if v.startswith("0x") else f"0x{v}"
    raise ValueError(f"no AGENT_KEY_* env var resolves for {agent_id}")


async def _bundler_submit(signed_op: dict[str, Any], chain: str) -> str | None:
    if not PIMLICO_API_KEY:
        return None
    url = PIMLICO_URL_TMPL.format(chain=chain, apikey=PIMLICO_API_KEY)
    async with httpx.AsyncClient(timeout=TIMEOUT) as http:
        r = await http.post(url, json={
            "jsonrpc": "2.0", "id": 1,
            "method": "eth_sendUserOperation",
            "params": [signed_op, ENTRYPOINT_V07_STR],
        })
        r.raise_for_status()
        body = r.json()
        if "error" in body:
            raise RuntimeError(f"bundler rejected: {body['error']}")
        return body.get("result")


async def handle_wallet_sign(payload: dict[str, Any]) -> dict[str, Any]:
    chain_id = int(payload["chain_id"])
    if chain_id not in CHAIN_EID:
        raise ValueError(f"unsupported chain_id {chain_id}")
    op = payload["user_op"]
    h = user_op_hash(op, chain_id)

    priv = _resolve_key(payload["agent_id"])
    acct = Account.from_key(priv)
    sig = acct.unsafe_sign_hash(h).signature  # 65-byte v||r||s → r||s||v per eth-account

    signed = dict(op)
    signed["signature"] = "0x" + sig.hex()

    chain_name = {8453: "base", 10: "optimism"}[chain_id]
    bundler_tx_hash: str | None
    try:
        bundler_tx_hash = await _bundler_submit(signed, chain_name)
    except (httpx.HTTPError, RuntimeError) as e:
        log.warning("pimlico submission failed (%s); returning signed op only", e)
        bundler_tx_hash = None

    return {
        "user_op_hash":   "0x" + h.hex(),
        "signed_user_op": signed,
        "signer_address": acct.address,
        "entrypoint":     ENTRYPOINT_V07_STR,
        "chain_id":       chain_id,
        "bundler_tx_hash": bundler_tx_hash,
    }
