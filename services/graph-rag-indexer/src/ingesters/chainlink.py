# services/graph-rag-indexer/src/ingesters/chainlink.py
# Chainlink AggregatorV3Interface reader → DAES_Commodity.spot_usd.
# OSS fallback path: 3-of-3 median over Pyth + Chronicle + Uniswap V3 TWAP
# (implemented elsewhere; this file handles the primary feed).
import hashlib
import logging
import os
from datetime import datetime, timezone
from typing import Any

import httpx

from ..weaviate_client import upsert

log = logging.getLogger("daes.ingester.chainlink")

# latestRoundData() selector: 0xfeaf968c → (roundId uint80, answer int256, startedAt uint256, updatedAt uint256, answeredInRound uint80)
SELECTOR = "0xfeaf968c"

RPC_URL = os.environ.get("BASE_RPC_URL", "https://mainnet.base.org")

FEEDS: dict[str, dict[str, Any]] = {
    "ETH_USD": {"address": "0x71041dddad3595F9CEd3DcCFBe3D1F4b0a16Bb70", "decimals": 8, "commodity_id": "ETH-USD", "hs_code": None, "unit": "USD/ETH"},
    "BTC_USD": {"address": "0x64c911996D3c6aC71f9b455B1E8E7266BcbD848F", "decimals": 8, "commodity_id": "BTC-USD", "hs_code": None, "unit": "USD/BTC"},
}

TIMEOUT = httpx.Timeout(connect=3.0, read=5.0, write=3.0, pool=3.0)


async def run_once() -> int:
    count = 0
    async with httpx.AsyncClient(timeout=TIMEOUT) as http:
        for name, cfg in FEEDS.items():
            try:
                r = await http.post(
                    RPC_URL,
                    json={
                        "jsonrpc": "2.0", "id": 1, "method": "eth_call",
                        "params": [{"to": cfg["address"], "data": SELECTOR}, "latest"],
                    },
                )
                r.raise_for_status()
                raw = r.json().get("result", "")
                if not raw or len(raw) < 2 + 64 * 5:
                    raise RuntimeError("short response")
                answer_hex = raw[2 + 64 : 2 + 64 * 2]
                answer_int = int.from_bytes(bytes.fromhex(answer_hex), "big", signed=True)
                updated_hex = raw[2 + 64 * 3 : 2 + 64 * 4]
                updated_ts = int(updated_hex, 16)
                price = answer_int / (10 ** cfg["decimals"])
            except Exception as e:
                log.warning("chainlink %s failed: %s", name, e)
                continue

            upsert(
                "DAES_Commodity",
                _uuid(cfg["commodity_id"]),
                {
                    "commodity_id":   cfg["commodity_id"],
                    "hs_code":        cfg.get("hs_code") or "",
                    "unit":           cfg["unit"],
                    "spot_usd":       float(price),
                    "volatility_30d": 0.0,
                    "chainlink_feed": cfg["address"],
                    "ts":             datetime.fromtimestamp(updated_ts, tz=timezone.utc).isoformat(),
                },
            )
            count += 1
    log.info("chainlink: upserted %d commodities", count)
    return count


def _uuid(key: str) -> str:
    h = hashlib.sha1(key.encode()).hexdigest()
    return f"{h[:8]}-{h[8:12]}-{h[12:16]}-{h[16:20]}-{h[20:32]}"
