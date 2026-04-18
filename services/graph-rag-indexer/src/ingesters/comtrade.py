# services/graph-rag-indexer/src/ingesters/comtrade.py
# UN Comtrade — bilateral goods trade rows → DAES_TradeRoute with transit_days
# estimated from reporter→partner pair distance (simplified: constant per region).
import hashlib
import logging
from typing import Any

import httpx

from ..weaviate_client import upsert

log = logging.getLogger("daes.ingester.comtrade")

API_BASE = "https://comtradeapi.un.org/public/v1/get"
TIMEOUT = httpx.Timeout(connect=3.0, read=20.0, write=3.0, pool=3.0)


async def fetch(reporter: str = "840", period: str = "2023", hs: str = "TOTAL") -> list[dict[str, Any]]:
    """Fetch bilateral trade rows. reporter=840 is USA by M49 code."""
    url = f"{API_BASE}/C/A/HS"
    params = {
        "reporterCode": reporter,
        "period": period,
        "partnerCode": "all",
        "flowCode": "M",           # imports
        "cmdCode": hs,
        "max": "500",
    }
    async with httpx.AsyncClient(timeout=TIMEOUT) as http:
        try:
            r = await http.get(url, params=params)
            r.raise_for_status()
            return (r.json() or {}).get("data", []) or []
        except httpx.HTTPError as e:
            log.warning("comtrade api failed (%s)", e)
            return []


async def run_once() -> int:
    rows = await fetch()
    count = 0
    for row in rows:
        rep = row.get("reporterISO") or row.get("reporterDesc", "UNK")
        par = row.get("partnerISO")  or row.get("partnerDesc",  "UNK")
        if rep == par or par in ("World", "WLD"):
            continue
        route_id = f"{rep}->{par}:{row.get('cmdCode', 'TOTAL')}"
        upsert(
            "DAES_TradeRoute",
            _uuid(route_id),
            {
                "route_id": route_id,
                "origin_port": rep,
                "dest_port": par,
                "transit_days": _transit_days_est(rep, par),
                "congestion_score": 0.0,
            },
        )
        count += 1
    log.info("comtrade: upserted %d routes", count)
    return count


def _transit_days_est(origin_iso: str, dest_iso: str) -> float:
    # Crude placeholder: same-region 7d, inter-region 21d. Real impl should
    # join AIS voyage means.
    same_region_pairs = {("USA", "CAN"), ("USA", "MEX"), ("CHN", "JPN"), ("DEU", "FRA")}
    key = tuple(sorted([origin_iso, dest_iso]))
    return 7.0 if key in {tuple(sorted(p)) for p in same_region_pairs} else 21.0


def _uuid(key: str) -> str:
    h = hashlib.sha1(key.encode()).hexdigest()
    return f"{h[:8]}-{h[8:12]}-{h[12:16]}-{h[16:20]}-{h[20:32]}"
