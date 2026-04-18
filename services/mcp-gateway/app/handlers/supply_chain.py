# services/mcp-gateway/app/handlers/supply_chain.py
# DHL / Maersk / customs query with GDELT fallback. Any proprietary 404 or
# quota error triggers the OSS fallback without changing the response shape.
import os
from typing import Any
import httpx

DHL_BASE    = os.environ.get("DHL_API_BASE",    "https://api-eu.dhl.com/track/shipments")
MAERSK_BASE = os.environ.get("MAERSK_API_BASE", "https://api.maersk.com/track")
GDELT_BASE  = "https://api.gdeltproject.org/api/v2/doc/doc"

TIMEOUT = httpx.Timeout(connect=3.0, read=5.0, write=3.0, pool=3.0)


async def handle_supply_chain(payload: dict[str, Any]) -> dict[str, Any]:
    carrier = payload["carrier"]
    query_type = payload["query_type"]
    params = payload.get("params", {}) or {}

    async with httpx.AsyncClient(timeout=TIMEOUT) as http:
        try:
            if carrier == "dhl":
                r = await http.get(
                    DHL_BASE,
                    params={"trackingNumber": params.get("tracking_number", "")},
                    headers={"DHL-API-Key": os.environ.get("DHL_API_KEY", "")},
                )
                r.raise_for_status()
                return {"records": r.json().get("shipments", []), "source": "dhl"}
            if carrier == "maersk":
                r = await http.get(
                    f"{MAERSK_BASE}/{params.get('bill_of_lading', '')}",
                    headers={"Consumer-Key": os.environ.get("MAERSK_API_KEY", "")},
                )
                r.raise_for_status()
                return {"records": r.json(), "source": "maersk"}
            if carrier == "customs":
                r = await http.get(
                    os.environ["CUSTOMS_API_BASE"],
                    params=params,
                )
                r.raise_for_status()
                return {"records": r.json(), "source": "customs"}
            # Explicit fallback request or unknown carrier ⇒ GDELT
        except (httpx.HTTPStatusError, httpx.HTTPError, KeyError):
            pass

        # GDELT 2.0 Doc API — no auth, broad logistics coverage.
        r = await http.get(
            GDELT_BASE,
            params={
                "query": params.get("query_text", f"{query_type} logistics"),
                "mode": "artlist",
                "format": "json",
                "maxrecords": 25,
            },
        )
        r.raise_for_status()
        return {"records": r.json().get("articles", []), "source": "gdelt_fallback"}
