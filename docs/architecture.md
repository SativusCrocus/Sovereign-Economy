# DAES Architecture

Two Mermaid diagrams: a **system flowchart** across all 4 layers, and a **state diagram** for the Bridge FSM.

## System Flowchart

```mermaid
%%{init: {'theme':'neutral','flowchart':{'htmlLabels':true,'curve':'basis'}}}%%
flowchart TB
    classDef ext fill:#eef,stroke:#335,color:#113;
    classDef svc fill:#efe,stroke:#353,color:#131;
    classDef chain fill:#fee,stroke:#533,color:#311;
    classDef safety fill:#fef6e0,stroke:#aa7a00,color:#6b4a00;

    %% ---------- LAYER 1 ----------
    subgraph L1["Layer 1 — Mirofish Simulation Swarm"]
        direction TB
        WB["World Bank Trade API"]:::ext
        CL["Chainlink price feeds"]:::ext
        UC["UN Comtrade"]:::ext
        AIS["AIS ship telemetry"]:::ext
        EMB["Embedder: text-embedding-3-large (3072)<br/>Fallback: BGE-large + linear proj"]:::svc
        WV["Weaviate 1.24 (Qdrant fallback)<br/>Nodes: MarketActor|Commodity|TradeRoute|RegulatorEvent<br/>Edges: TRANSACTS|COMPETES|REGULATES|DISRUPTS"]:::svc
        RET["Retrieval: top-k=20, MMR λ=0.5, cos≥0.72"]:::svc
        POP["Agent pool (N=1000)<br/>Spec 20% / Arb 25% / Sov 10% / MM 30% / BS 15%<br/>FSM: OBSERVE→REASON→SIGNAL→WAIT<br/>Cobb-Douglas, memory=48 ticks, β∈[0.1,4.2] lognormal"]:::svc
        CON["Consensus gate<br/>≥67% agents within ±1.5σ of median"]:::safety
        SIG["SwarmSignal<br/>{BUY|SELL|HOLD|ESCALATE_TO_GUARDIAN}"]:::svc
    end
    WB & CL & UC & AIS --> EMB --> WV --> RET --> POP --> CON --> SIG

    %% ---------- LAYER 2 ----------
    subgraph L2["Layer 2 — Goose Execution Layer (MCP)"]
        direction TB
        GOOSE["Goose runtime (Node 20)"]:::svc
        GW["mcp-gateway (FastAPI, mTLS on :8443)"]:::svc
        T1["wallet_sign_transaction (EIP-4337)"]:::svc
        T2["supply_chain_api_query (DHL/Maersk/customs → GDELT)"]:::svc
        T3["contract_call_simulate (Tenderly → Anvil)"]:::svc
        T4["cross_chain_bridge_initiate (LayerZero V2)"]:::svc
        T5["audit_log_write (IPFS → Filecoin)"]:::svc
        SA_SPEC["Smart Account: Speculator"]:::chain
        SA_ARB["Smart Account: Arbitrageur"]:::chain
        SA_SOV["Smart Account: Sovereign"]:::chain
        SA_MM["Smart Account: MarketMaker"]:::chain
        SA_BS["Smart Account: BlackSwan"]:::chain
    end
    SIG --> GOOSE --> GW --> T1 & T2 & T3 & T4 & T5
    T1 --> SA_SPEC & SA_ARB & SA_SOV & SA_MM & SA_BS

    %% ---------- LAYER 3 ----------
    subgraph L3["Layer 3 — Decision-to-Action Bridge"]
        direction TB
        BR["BridgeExecutor FSM<br/>(see state diagram below)"]:::safety
        MS["3-of-5 multi-sig<br/>[AgentA, AgentB, HumanGuardian, TimeLock(86400s), DAO Snapshot]"]:::safety
        TL["GuardianTimelock (86400s)"]:::safety
        CB["CircuitBreaker<br/>>2 failures / 10 min ⇒ auto-pause"]:::safety
    end
    SA_SPEC & SA_ARB & SA_SOV & SA_MM & SA_BS --> BR --> MS --> TL --> CB

    %% ---------- LAYER 4 ----------
    subgraph L4["Layer 4 — Deployment Infrastructure"]
        direction TB
        COMPOSE["docker-compose (6 services, isolated 'daes-net')"]:::svc
        AK["Akash SDL<br/>(GPU-tier filter a10/a100, count≥2 for SPOF-critical)"]:::svc
        PROM["Prometheus + Grafana"]:::svc
        IPFS["IPFS / Filecoin audit sink"]:::ext
        CHAIN["Base (8453) + Optimism (10)<br/>LayerZero V2 OApp"]:::chain
    end
    CB -->|execute| CHAIN
    T5 --> IPFS
    COMPOSE -.hosts.-> L1 & L2 & L3
    COMPOSE -.scheduled on.-> AK
    L1 & L2 & L3 -.metrics.-> PROM
```

## Bridge FSM (state diagram)

```mermaid
%%{init: {'theme':'neutral'}}%%
stateDiagram-v2
    [*] --> SWARM_SIGNAL_RECEIVED

    SWARM_SIGNAL_RECEIVED --> SIGNAL_VALIDATED: schema_ok && signature_valid
    SWARM_SIGNAL_RECEIVED --> REJECTED: schema_or_signature_bad

    SIGNAL_VALIDATED --> THRESHOLD_CHECK: always

    THRESHOLD_CHECK --> MULTI_SIG_STAGED: quorum ≥ 67% && within ±1.5σ
    THRESHOLD_CHECK --> REJECTED: quorum_insufficient

    MULTI_SIG_STAGED --> EXECUTED: 3-of-5 signatures collected<br/>(and 86400s timelock satisfied)
    MULTI_SIG_STAGED --> GUARDIAN_TIMEOUT: elapsed > 3600s

    GUARDIAN_TIMEOUT --> MULTI_SIG_STAGED: guardian override valid
    GUARDIAN_TIMEOUT --> REJECTED: no override

    EXECUTED --> [*]
    REJECTED --> [*]

    note right of MULTI_SIG_STAGED
      Signers (3-of-5):
      • AgentClassA (contract)
      • AgentClassB (contract)
      • HumanGuardian (EOA)
      • TimeLock86400 (contract)
      • DAOSnapshot (strategy)
    end note

    note left of THRESHOLD_CHECK
      CircuitBreaker arms here:
      > 2 failures in 600s ⇒ auto-pause
      resume only via Guardian or DAO vote
    end note
```

## Reading guide

- **Solid arrows** = synchronous data/control flow on the critical path.
- **Dashed arrows** = infrastructure/observability relationships (not on the transaction critical path).
- Every service in the flowchart corresponds 1:1 to a block in [`../deploy/docker-compose.yaml`](../deploy/docker-compose.yaml) and [`../deploy/akash/deploy.yaml`](../deploy/akash/deploy.yaml).
- Every threshold/timeout is sourced from [`../spec/components.yaml`](../spec/components.yaml) — no magic numbers inline.
