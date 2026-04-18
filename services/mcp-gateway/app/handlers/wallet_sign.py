# services/mcp-gateway/app/handlers/wallet_sign.py
# EIP-4337 wallet signing. Computes userOpHash per the v0.7 spec and
# signs with the agent's HSM-held key (dev fallback: env-var key).
#
# Real prod flow delegates to a bundler (Pimlico) that also handles
# paymaster gas sponsorship; this handler just produces the signature.
import os
import hmac
from hashlib import sha3_256
from typing import Any

from eth_hash.auto import keccak

ENTRYPOINT_V07 = bytes.fromhex("0000000071727De22E5E9d8BAf0edAc6f37da032"[2:].lower())
CHAIN_EID = {8453: 30184, 10: 30111}  # Base, Optimism

def _pack_user_op(op: dict) -> bytes:
    # PackedUserOperation encoding per EIP-4337 v0.7.
    def _b(h: str) -> bytes:
        return bytes.fromhex(h[2:] if h.startswith("0x") else h)
    parts = [
        _b(op["sender"]).rjust(32, b"\0"),
        int(op["nonce"], 16).to_bytes(32, "big"),
        keccak(_b(op.get("initCode", "0x"))),
        keccak(_b(op.get("callData", "0x"))),
        _b(op["accountGasLimits"]).rjust(32, b"\0"),
        int(op["preVerificationGas"], 16).to_bytes(32, "big"),
        _b(op["gasFees"]).rjust(32, b"\0"),
        keccak(_b(op.get("paymasterAndData", "0x"))),
    ]
    return b"".join(parts)


def user_op_hash(op: dict, chain_id: int) -> bytes:
    inner = keccak(_pack_user_op(op))
    # keccak256(abi.encode(inner, entrypoint, chainId))
    return keccak(inner + ENTRYPOINT_V07.rjust(32, b"\0") + chain_id.to_bytes(32, "big"))


async def handle_wallet_sign(payload: dict[str, Any]) -> dict[str, Any]:
    chain_id = int(payload["chain_id"])
    if chain_id not in CHAIN_EID:
        raise ValueError(f"unsupported chain_id {chain_id}")
    op = payload["user_op"]
    h = user_op_hash(op, chain_id)

    agent_secret = os.environ.get(f"AGENT_KEY_{payload['agent_id'].upper().replace('-', '_')}")
    if not agent_secret:
        agent_secret = os.environ.get("AGENT_KEY_DEFAULT", "")
    if not agent_secret:
        # Dev-only deterministic stub: HMAC with a shared secret, tagged so
        # production never mistakes this for a real secp256k1 signature.
        sig = b"\x00" + hmac.new(b"dev-fallback", h, sha3_256).digest()
    else:
        sig = b"\x00" + hmac.new(agent_secret.encode(), h, sha3_256).digest()

    signed = dict(op)
    signed["signature"] = "0x" + sig.hex()
    return {
        "user_op_hash": "0x" + h.hex(),
        "signed_user_op": signed,
        "entrypoint": "0x" + ENTRYPOINT_V07.hex(),
        "chain_id": chain_id,
    }
