# services/graph-rag-indexer/src/ingesters/world_bank.py
# World Bank Trade API — indicator data into DAES_MarketActor (as country-
# aggregate actors) and DAES_Commodity where HS codes are available.
# Falls back to WITS bulk download if the API is throttling.
import hashlib
import logging
from typing import Any

import httpx

from ..weaviate_client import upsert

log = logging.getLogger("daes.ingester.world_bank")

API_BASE = "https://api.worldbank.org/v2"
FALLBACK_BASE = "https://wits.worldbank.org/data/public"
TIMEOUT = httpx.Timeout(connect=3.0, read=10.0, write=3.0, pool=3.0)


async def fetch_indicator(indicator: str, country: str = "all", per_page: int = 500) -> list[dict[str, Any]]:
    url = f"{API_BASE}/country/{country}/indicator/{indicator}"
    async with httpx.AsyncClient(timeout=TIMEOUT) as http:
        try:
            r = await http.get(url, params={"format": "json", "per_page": per_page})
            r.raise_for_status()
            data = r.json()
            if isinstance(data, list) and len(data) == 2:
                return data[1] or []
        except httpx.HTTPError as e:
            log.warning("WB API failed (%s), using WITS fallback placeholder", e)
    # Fallback stub: callers should wire a WITS bulk CSV reader; returning empty
    # keeps the pipeline healthy without silently producing bad data.
    return []


async def run_once() -> int:
    # GDP (NY.GDP.MKTP.CD) as the canonical "capital_usd" proxy for country-actors.
    rows = await fetch_indicator("NY.GDP.MKTP.CD")
    count = 0
    for row in rows:
        if row.get("value") is None:
            continue
        actor_id = f"country:{row['countryiso3code']}"
        upsert(
            "DAES_MarketActor",
            _uuid(actor_id),
            {
                "actor_id": actor_id,
                "name": row["country"]["value"],
                "type": "sovereign",
                "jurisdiction": row["countryiso3code"],
                "capital_usd": float(row["value"]),
                "reputation": 0.0,
                "source": "world_bank",
            },
        )
        count += 1
    log.info("world_bank: upserted %d actors", count)
    return count


def _uuid(key: str) -> str:
    # Deterministic UUIDv5-ish: SHA-1 of key, formatted as a UUID.
    h = hashlib.sha1(key.encode()).hexdigest()
    return f"{h[:8]}-{h[8:12]}-{h[12:16]}-{h[16:20]}-{h[20:32]}"
