# DAES — Decentralized Autonomous Economic System

A 4-layer system: GraphRAG-fed 1000-agent swarm → MCP tool execution → 3-of-5 multi-sig bridge → containerized deployment on Docker Compose or Akash.

Evaluation target: **a senior engineer can stand this up in <8 hours.**

## The five deliverables

| # | Artifact | Path |
|---|----------|------|
| 1 | Mermaid architecture diagram | [docs/architecture.md](docs/architecture.md) |
| 2 | Component spec YAML (single source of truth) | [spec/components.yaml](spec/components.yaml) |
| 3 | Solidity interfaces + reference impls + ABI JSONs | [contracts/interfaces/](contracts/interfaces/) • [contracts/src/](contracts/src/) • [contracts/abi/](contracts/abi/) |
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
npx hardhat compile                            # compiles 28 artifacts (7 interfaces + 8 impls + OZ)
npx hardhat test                               # 14 tests pass
npx ts-node scripts/extract-abi.ts             # refresh contracts/abi/*.json
npx hardhat run --network local scripts/deploy-local.ts
```

### Hour 5-6 · Smoke tests
```bash
docker compose exec agent-swarm-runtime pytest tests/test_determinism.py -v
docker compose exec goose-executor npm run sim:buy-signal
# Grafana → http://localhost:3000 (admin / $GRAFANA_ADMIN_PASSWORD)
#   dashboard: "DAES Overview" — swarm signal rate + state-hash probe
# Console  → http://localhost:3001
#   pages: / (health + grafana), /bridge (FSM), /accounts (EIP-4337), /audit (IPFS)
```

### Hour 6-8 · Akash (optional, prod)
Full walkthrough in [docs/deploy-akash.md](docs/deploy-akash.md). Short version:
```bash
git tag v1.0.0 && git push --tags   # triggers GHCR image publish
akash validate deploy/akash/deploy.yaml
akash tx deployment create deploy/akash/deploy.yaml --from <your-key>
```

## Repository layout

```
Sovereign Economy/
├── docs/architecture.md              # Artifact 1
├── spec/components.yaml              # Artifact 2 (source of truth)
├── contracts/
│   ├── interfaces/*.sol              # Artifact 3 — 7 Solidity interfaces
│   ├── src/*.sol                     # Reference implementations (8 contracts, 14 Hardhat tests)
│   ├── test/*.test.ts                # Hardhat test suite
│   ├── abi/*.abi.json                # Pre-computed ABI JSONs (solc-generated)
│   ├── hardhat.config.ts
│   ├── package.json
│   └── scripts/{extract-abi,deploy-local}.ts
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
├── frontend/                         # Layer 4 — Next.js 15 + wagmi v2 operator console
│   ├── app/{page,bridge,accounts,audit}.tsx
│   ├── lib/{config,contracts,mcp}.ts
│   └── Dockerfile
├── config/
│   ├── prometheus.yml
│   ├── alerts.yml
│   └── grafana/dashboards/daes-overview.json
└── .gitignore
```

## Production hardening checklist

The dev compose is deliberately permissive. For prod:

1. Replace self-signed TLS with cert-manager / Let's Encrypt.
2. Switch `WEAVIATE_API_KEY`, `MCP_JWT_SECRET`, and `AGENT_KEY_*` to a secrets manager (Vault, Doppler, Akash SealedSecrets) or better, an HSM.
3. Rotate the swarm seed from Chainlink VRF on-chain (not env-var `SEED`).
4. [services/mcp-gateway/app/handlers/wallet_sign.py](services/mcp-gateway/app/handlers/wallet_sign.py) uses real secp256k1 via eth-account; provision distinct `AGENT_KEY_<ARCHETYPE>` keys via HSM in prod. Configure `PIMLICO_API_KEY` for bundler submission; `TENDERLY_URL` for simulation.
5. Run the full audit checklist in [docs/audit-notes.md](docs/audit-notes.md) — at minimum, fix the **H-1/H-2/H-3** findings before mainnet, and commission a third-party audit (Trail of Bits / OpenZeppelin / Spearbit).
6. Configure the Akash placement `signedBy.anyOf` list to providers your org has actually audited.

## Safety architecture at a glance

Four independent failure stops between a swarm signal and an on-chain action:

1. **Consensus gate** — ≥67% of agents within ±1.5σ of median, rate-limited to 6 signals/min
2. **Bridge FSM** — rejects malformed signals at `SIGNAL_VALIDATED`; 3600s `GUARDIAN_TIMEOUT`
3. **3-of-5 multi-sig** — {AgentClassA, AgentClassB, HumanGuardian, TimeLock86400, DAOSnapshot}; the 86400s timelock alone means no action ships sooner than 24h
4. **Circuit breaker** — >2 failures in 600s auto-pauses; reset only by Guardian or DAO vote

See [docs/architecture.md](docs/architecture.md) for the state diagram.
