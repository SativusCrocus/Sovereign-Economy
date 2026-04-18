# services/mcp-gateway/app/handlers/audit_log.py
# Writes an audit entry to IPFS (kubo) and optionally pins to Filecoin
# via web3.storage (OSS fallback path). Returns the CID.
import json
import os
from typing import Any
import httpx

IPFS_API = os.environ.get("IPFS_API_URL", "http://ipfs:5001")
WEB3_STORAGE_TOKEN = os.environ.get("WEB3_STORAGE_TOKEN", "")

TIMEOUT = httpx.Timeout(connect=3.0, read=10.0, write=10.0, pool=3.0)


async def handle_audit_log(payload: dict[str, Any]) -> dict[str, Any]:
    record = {
        "subject": payload["subject"],
        "event_type": payload["event_type"],
        "payload": payload["payload"],
    }
    blob = json.dumps(record, separators=(",", ":"), sort_keys=True).encode()

    async with httpx.AsyncClient(timeout=TIMEOUT) as http:
        r = await http.post(
            f"{IPFS_API}/api/v0/add",
            params={"pin": "true", "cid-version": "1"},
            files={"file": ("audit.json", blob, "application/json")},
        )
        r.raise_for_status()
        cid = r.json()["Hash"]

        pinned_by = ["local_ipfs_cluster"]
        if WEB3_STORAGE_TOKEN:
            try:
                p = await http.post(
                    "https://api.web3.storage/upload",
                    headers={"Authorization": f"Bearer {WEB3_STORAGE_TOKEN}"},
                    content=blob,
                )
                if p.status_code // 100 == 2:
                    pinned_by.append("filecoin_web3storage_fallback")
            except httpx.HTTPError:
                pass

    return {"cid": cid, "pinned_by": pinned_by}
