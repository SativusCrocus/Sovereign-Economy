# services/agent-swarm-runtime/src/consensus.py
# Consensus gate: ≥67% of agents within ±1.5σ of the median signal score.
# Tiebreak=HOLD. Emits at most `emission_rate_limit_per_minute` per minute.
import time
import threading
import numpy as np

from .determinism import state_hash


SIGNAL_KINDS = ["BUY", "SELL", "HOLD", "ESCALATE_TO_GUARDIAN"]


def _score_agent(agent, tick: int, rng: np.random.Generator) -> float:
    # Placeholder deterministic scoring — the real implementation queries
    # retrieval results and the agent's memory window.
    x = agent.beta * np.sin(tick * 0.07 + hash(agent.id) % 1000)
    return float(x)


def consensus_loop(spec, population, rng, stop_event: threading.Event, signals_counter, tick_hash_gauge):
    cfg = spec["consensus"]
    threshold_pct = float(cfg["fire_threshold_pct"])
    sigma_band    = float(cfg["sigma_band"])
    max_per_min   = int(cfg.get("emission_rate_limit_per_minute", 6))

    min_interval_s = 60.0 / max_per_min
    last_emit = 0.0
    tick = 0

    while not stop_event.is_set():
        scores = np.array([_score_agent(a, tick, rng) for a in population])
        med    = float(np.median(scores))
        std    = float(np.std(scores)) or 1e-9
        in_band = np.abs(scores - med) <= sigma_band * std
        agreement = 100.0 * in_band.mean()

        fired = False
        if agreement >= threshold_pct and (time.time() - last_emit) >= min_interval_s:
            kind = "BUY" if med > 0.1 else ("SELL" if med < -0.1 else "HOLD")
            signals_counter.labels(kind=kind).inc()
            last_emit = time.time()
            fired = True

        sorted_state = [f"{a.id}|{scores[i]:.6f}".encode() for i, a in enumerate(population)]
        sorted_state.sort()
        h = state_hash(sorted_state)
        tick_hash_gauge.set(int.from_bytes(h[-8:], "big"))

        tick += 1
        stop_event.wait(0.25)  # 4 Hz tick
