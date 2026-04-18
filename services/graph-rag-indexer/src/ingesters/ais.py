# services/graph-rag-indexer/src/ingesters/ais.py
# AIS ship-telemetry streamer. Subscribes to aisstream.io over WebSocket
# (free-tier API key) and updates DAES_TradeRoute.congestion_score with
# a moving average of vessel counts per origin→dest corridor.
import asyncio
import hashlib
import json
import logging
import os
import time
from collections import defaultdict, deque
from typing import Any

import websockets

from ..weaviate_client import upsert

log = logging.getLogger("daes.ingester.ais")

WS_URL  = "wss://stream.aisstream.io/v0/stream"
API_KEY = os.environ.get("AISSTREAM_API_KEY", "")

CORRIDORS: dict[str, tuple[tuple[float, float], tuple[float, float]]] = {
    "USA->CHN": ((-130.0, 20.0),  (-100.0, 50.0)),
    "EUR->USA": ((-80.0, 30.0),   (-10.0, 55.0)),
    "SEA->EUR": ((30.0, -10.0),   (120.0, 30.0)),
}

_WINDOW_S = 600
_counts: dict[str, deque[float]] = defaultdict(deque)


async def run_forever() -> None:
    if not API_KEY:
        log.warning("AISSTREAM_API_KEY not set; AIS ingester idle")
        while True:
            await asyncio.sleep(60)

    sub = {
        "APIKey": API_KEY,
        "BoundingBoxes": [[[list(lo), list(hi)]] for lo, hi in CORRIDORS.values()],
        "FilterMessageTypes": ["PositionReport"],
    }

    while True:
        try:
            async with websockets.connect(WS_URL, ping_interval=30) as ws:
                await ws.send(json.dumps(sub))
                async for raw in ws:
                    _handle(json.loads(raw))
        except Exception as e:
            log.warning("AIS WS disconnect (%s) — reconnecting in 5s", e)
            await asyncio.sleep(5)


def _handle(msg: dict[str, Any]) -> None:
    meta = msg.get("MetaData", {})
    lon, lat = meta.get("longitude"), meta.get("latitude")
    if lon is None or lat is None:
        return
    now = time.time()
    for corridor, ((lo_x, lo_y), (hi_x, hi_y)) in CORRIDORS.items():
        if lo_x <= lon <= hi_x and lo_y <= lat <= hi_y:
            dq = _counts[corridor]
            dq.append(now)
            while dq and now - dq[0] > _WINDOW_S:
                dq.popleft()
            score = len(dq)
            upsert(
                "DAES_TradeRoute",
                _uuid(corridor),
                {
                    "route_id": corridor,
                    "origin_port": corridor.split("->")[0],
                    "dest_port": corridor.split("->")[1],
                    "transit_days": 21.0,
                    "congestion_score": float(score),
                    "last_ais_update": _iso(now),
                },
            )
            break


def _uuid(key: str) -> str:
    h = hashlib.sha1(key.encode()).hexdigest()
    return f"{h[:8]}-{h[8:12]}-{h[12:16]}-{h[16:20]}-{h[20:32]}"


def _iso(ts: float) -> str:
    from datetime import datetime, timezone
    return datetime.fromtimestamp(ts, tz=timezone.utc).isoformat()
