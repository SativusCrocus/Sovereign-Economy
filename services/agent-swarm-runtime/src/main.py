# services/agent-swarm-runtime/src/main.py
# Deterministic 1000-agent swarm runtime. Boots, loads spec, exposes
# health + metrics, and runs the OBSERVE→REASON→SIGNAL→WAIT loop.
# Full agent logic lives in src/agents.py, src/consensus.py,
# src/retrieval.py, src/determinism.py.
import os
import logging
import threading
from contextlib import asynccontextmanager

import yaml
from fastapi import FastAPI
from prometheus_client import Counter, Gauge, make_asgi_app
import uvicorn

from .determinism import seeded_rng
from .agents import build_population
from .consensus import consensus_loop

SPEC_PATH = os.environ.get("DAES_SPEC_PATH", "/spec/components.yaml")
SEED      = int(os.environ.get("SEED", "0xDEADBEEF"), 16)

log = logging.getLogger("daes.swarm")
logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(name)s %(message)s")

signals_emitted = Counter("daes_swarm_signals_total", "Swarm signals emitted", ["kind"])
agents_gauge    = Gauge("daes_swarm_agents",          "Live agent count")
tick_hash_gauge = Gauge("daes_swarm_tick_hash_low64", "Low 64 bits of state hash, for determinism checks")


@asynccontextmanager
async def lifespan(_app: FastAPI):
    with open(SPEC_PATH, "r") as f:
        spec = yaml.safe_load(f)
    rng = seeded_rng(SEED)
    population = build_population(spec, rng)
    agents_gauge.set(len(population))
    log.info("boot: agents=%d seed=0x%x", len(population), SEED)

    stop = threading.Event()
    t = threading.Thread(
        target=consensus_loop,
        args=(spec, population, rng, stop, signals_emitted, tick_hash_gauge),
        name="consensus",
        daemon=True,
    )
    t.start()
    try:
        yield
    finally:
        stop.set()
        t.join(timeout=5)


app = FastAPI(lifespan=lifespan, title="daes-agent-swarm-runtime")
app.mount("/metrics", make_asgi_app())


@app.get("/healthz")
def healthz() -> dict[str, str]:
    return {"status": "ok"}


if __name__ == "__main__":
    uvicorn.run(app, host="0.0.0.0", port=9100, log_level="info")
