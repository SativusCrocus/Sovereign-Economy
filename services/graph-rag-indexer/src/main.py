# services/graph-rag-indexer/src/main.py
# Orchestrates the 4 ingesters. Runs a /healthz + /metrics HTTP server
# and schedules batch ingesters on a timer while the AIS stream runs
# continuously in the background.
import asyncio
import logging
import os
from contextlib import asynccontextmanager

from fastapi import FastAPI
from prometheus_client import Counter, make_asgi_app
import uvicorn

from .weaviate_client import ensure_schema
from .ingesters import world_bank, comtrade, ais, chainlink

log = logging.getLogger("daes.ingester")
logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(name)s %(message)s")

ingested = Counter("daes_ingester_rows_total", "Rows upserted", ["source"])

SCHEMA_PATH     = os.environ.get("DAES_SCHEMA_PATH",    "/app/schema.json")
BATCH_PERIOD_S  = int(os.environ.get("INGEST_PERIOD_S", "900"))  # 15 min


async def _batch_loop():
    while True:
        try:
            ingested.labels(source="world_bank").inc(await world_bank.run_once())
            ingested.labels(source="comtrade").inc(await comtrade.run_once())
            ingested.labels(source="chainlink").inc(await chainlink.run_once())
        except Exception as e:
            log.exception("batch cycle failed: %s", e)
        await asyncio.sleep(BATCH_PERIOD_S)


@asynccontextmanager
async def lifespan(_app: FastAPI):
    ensure_schema(SCHEMA_PATH)
    log.info("schema ensured; starting ingesters")
    t1 = asyncio.create_task(_batch_loop(), name="batch")
    t2 = asyncio.create_task(ais.run_forever(), name="ais")
    try:
        yield
    finally:
        for t in (t1, t2):
            t.cancel()


app = FastAPI(lifespan=lifespan, title="daes-graph-rag-ingester")
app.mount("/metrics", make_asgi_app())


@app.get("/healthz")
async def healthz():
    return {"status": "ok"}


if __name__ == "__main__":
    uvicorn.run(app, host="0.0.0.0", port=9300, log_level="info")
