# DAES — Decentralized Autonomous Economic System

A 4-layer system: GraphRAG-fed 1000-agent swarm → MCP tool execution → 3-of-5 multi-sig bridge → containerized deployment on Docker Compose or Akash.

Evaluation target: **a senior engineer can stand this up in <8 hours.**

## The five deliverables

| # | Artifact | Path |
|---|----------|------|
| 1 | Mermaid architecture diagram | [docs/architecture.md](docs/architecture.md) |
| 2 | Component spec YAML (single source of truth) | [spec/components.yaml](spec/components.yaml) |
| 3 | Solidity ABI stubs (7 interfaces + JSON ABIs) | [contracts/interfaces/](contracts/interfaces/) • [contracts/abi/](contracts/abi/) |
| 4 | `docker-compose.yaml` | [deploy/docker-compose.yaml](deploy/docker-compose.yaml) |
| 5 | Akash SDL manifest | [deploy/akash/deploy.yaml](deploy/akash/deploy.yaml) |

## Hard constraint compliance

- **No proprietary API without OSS fallback** — every `sources[].fallback` field in `spec/components.yaml` is populated. text-embedding-3-large → BGE-large + linear adapter; Chainlink → Pyth/Chronicle/Uniswap-TWAP 3-of-3 median; DHL/Maersk → GDELT/OSM/AIS; Tenderly → Anvil fork; Pimlico → Stackup self-hosted.
- **Deterministic agent logic** — `services/agent-swarm-runtime/src/determinism.py` wraps a `numpy.SeedSequence`; `tests/test_determinism.py` asserts same seed ⇒ same `state_hash`. Seeds come from Chainlink VRF in prod, drand as fallback.
- **No single point of failure** — `graph-rag-indexer` and `mcp-gateway` run `replicas: 2` (Compose `deploy.replicas`, Akash `count: 2`). Bridge has 4 independent stop mechanisms: FSM, multi-sig, timelock, circuit breaker.
- **Fenced code with filename headers** — every source file begins with a `# path/to/file` header.

## 8-hour deploy walkthrough

### Hour 0-1 · Prerequisites
```bash
docker --version              # ≥ 24
docker compose version        # ≥ v2.29
node --version                # ≥ 20
python --version              # ≥ 3.12
# Optional (prod)
akash version                 # ≥ 0.36
```

### Hour 1-2 · Secrets & TLS
```bash
cp deploy/.env.example deploy/.env
# Edit deploy/.env — MCP_JWT, MCP_JWT_SECRET, GRAFANA_ADMIN_PASSWORD, BASE_RPC_URL, OP_RPC_URL.
bash deploy/tls/generate-cert.sh
```

### Hour 2-4 · Local bring-up
```bash
cd deploy
docker compose up -d --build
docker compose ps                              # all healthy?
curl -k https://localhost:8443/healthz         # mcp-gateway tool list
```
Expected response: `{"status":"ok","tools":["wallet_sign_transaction","supply_chain_api_query","contract_call_simulate","cross_chain_bridge_initiate","audit_log_write"]}`

### Hour 4-5 · Contracts
```bash
cd contracts
npm install
npx hardhat compile                            # regenerates contracts/abi/*.json
npx hardhat run --network local scripts/deploy-local.ts   # optional, if you add a deploy script
```

### Hour 5-6 · Smoke tests
```bash
docker compose exec agent-swarm-runtime pytest tests/test_determinism.py -v
docker compose exec goose-executor npm run sim:buy-signal
# Grafana → http://localhost:3000 (admin / $GRAFANA_ADMIN_PASSWORD)
#   dashboard: "DAES Overview" — swarm signal rate + state-hash probe
```

### Hour 6-8 · Akash (optional, prod)
```bash
akash validate deploy/akash/deploy.yaml
akash tx deployment create deploy/akash/deploy.yaml --from <your-key>
# Review bids, accept providers matching the GPU-tier filter (a10 or a100):
akash query market bid list --owner <you> --state open
```

## Repository layout

```
Sovereign Economy/
├── docs/architecture.md              # Artifact 1
├── spec/components.yaml              # Artifact 2 (source of truth)
├── contracts/
│   ├── interfaces/*.sol              # Artifact 3 — 7 Solidity interfaces
│   ├── abi/*.abi.json                # Artifact 3 — pre-computed ABI JSONs
│   ├── hardhat.config.ts
│   ├── package.json
│   └── scripts/extract-abi.ts
├── deploy/
│   ├── docker-compose.yaml           # Artifact 4
│   ├── akash/deploy.yaml             # Artifact 5
│   ├── .env.example
│   └── tls/generate-cert.sh
├── services/
│   ├── agent-swarm-runtime/          # Layer 1 — Python 3.12, deterministic swarm
│   ├── graph-rag-indexer/            # Layer 1 — WB + Comtrade + AIS + Chainlink ingesters
│   ├── goose-executor/               # Layer 2 — Node 20, MCP client
│   └── mcp-gateway/                  # Layer 2 — FastAPI, mTLS, JWT, 5 real tool handlers
├── config/
│   ├── prometheus.yml
│   ├── alerts.yml
│   └── grafana/dashboards/daes-overview.json
└── .gitignore
```

## Production hardening checklist

The dev compose is deliberately permissive. For prod:

1. Replace self-signed TLS with cert-manager / Let's Encrypt.
2. Switch `WEAVIATE_API_KEY` and `MCP_JWT_SECRET` to a secrets manager (Vault, Doppler, Akash SealedSecrets).
3. Rotate the swarm seed from Chainlink VRF on-chain (not env-var `SEED`).
4. Handlers in [services/mcp-gateway/app/handlers/](services/mcp-gateway/app/handlers/) are real but dev-friendly (HMAC signatures, deterministic GUIDs). Swap to HSM-backed secp256k1 signing, a real Pimlico bundler, and Tenderly URL before shipping.
5. Add an audited OpenZeppelin implementation behind each interface in `contracts/interfaces/*.sol` — the current repo is interfaces-only by spec.
6. Configure the Akash placement `signedBy.anyOf` list to providers your org has actually audited.

## Safety architecture at a glance

Four independent failure stops between a swarm signal and an on-chain action:

1. **Consensus gate** — ≥67% of agents within ±1.5σ of median, rate-limited to 6 signals/min
2. **Bridge FSM** — rejects malformed signals at `SIGNAL_VALIDATED`; 3600s `GUARDIAN_TIMEOUT`
3. **3-of-5 multi-sig** — {AgentClassA, AgentClassB, HumanGuardian, TimeLock86400, DAOSnapshot}; the 86400s timelock alone means no action ships sooner than 24h
4. **Circuit breaker** — >2 failures in 600s auto-pauses; reset only by Guardian or DAO vote

See [docs/architecture.md](docs/architecture.md) for the state diagram.
