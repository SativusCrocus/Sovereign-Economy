# services/agent-swarm-runtime/tests/test_determinism.py
import yaml
from src.determinism import seeded_rng, state_hash
from src.agents import build_population


def _spec():
    with open("/spec/components.yaml") as f:
        return yaml.safe_load(f)


def test_same_seed_same_state_hash():
    spec = _spec()
    pop_a = build_population(spec, seeded_rng(0xDEADBEEF))
    pop_b = build_population(spec, seeded_rng(0xDEADBEEF))

    assert len(pop_a) == len(pop_b) == spec["agent_swarm"]["population"]

    sa = sorted(f"{a.id}|{a.beta:.9f}".encode() for a in pop_a)
    sb = sorted(f"{a.id}|{a.beta:.9f}".encode() for a in pop_b)
    assert state_hash(sa) == state_hash(sb)


def test_different_seed_different_state_hash():
    spec = _spec()
    pop_a = build_population(spec, seeded_rng(0xDEADBEEF))
    pop_b = build_population(spec, seeded_rng(0xCAFEBABE))
    sa = sorted(f"{a.id}|{a.beta:.9f}".encode() for a in pop_a)
    sb = sorted(f"{a.id}|{a.beta:.9f}".encode() for a in pop_b)
    assert state_hash(sa) != state_hash(sb)
