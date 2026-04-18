# services/agent-swarm-runtime/src/determinism.py
import hashlib
import numpy as np


def seeded_rng(seed: int) -> np.random.Generator:
    return np.random.default_rng(np.random.SeedSequence(seed))


def state_hash(sorted_state_bytes: list[bytes]) -> bytes:
    h = hashlib.sha3_256()
    for chunk in sorted_state_bytes:
        h.update(chunk)
    return h.digest()
