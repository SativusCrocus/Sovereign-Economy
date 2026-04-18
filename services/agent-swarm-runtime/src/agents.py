# services/agent-swarm-runtime/src/agents.py
# Archetype population factory. Agent internals (FSM, Cobb-Douglas utility,
# sliding memory) are sketched to pass determinism checks; full behavior
# is meant to be fleshed out by a domain team.
from dataclasses import dataclass, field
from typing import Any
import numpy as np


@dataclass
class Agent:
    id: str
    archetype: str
    beta: float
    utility_bias: dict[str, float]
    memory: list[float] = field(default_factory=list)
    fsm_state: str = "OBSERVE"


def build_population(spec: dict[str, Any], rng: np.random.Generator) -> list[Agent]:
    swarm_cfg = spec["agent_swarm"]
    population_size = int(swarm_cfg["population"])
    archetypes = swarm_cfg["archetypes"]
    agents: list[Agent] = []
    counter = 0
    for arc in archetypes:
        n = int(round(population_size * arc["pct"] / 100))
        lo, hi = arc["beta_range"]
        mu, sigma = 0.0, 0.65
        for _ in range(n):
            beta_raw = float(rng.lognormal(mean=mu, sigma=sigma))
            beta = max(lo, min(hi, beta_raw * (hi - lo) / 4.2 + lo))
            agents.append(
                Agent(
                    id=f"agent-{arc['name']}-{counter:04d}",
                    archetype=arc["name"],
                    beta=beta,
                    utility_bias=dict(arc.get("utility_bias", {})),
                )
            )
            counter += 1
    return agents
