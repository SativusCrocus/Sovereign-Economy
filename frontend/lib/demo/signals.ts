// frontend/lib/demo/signals.ts
// Deterministic demo generators. Used by API routes and UI previews so the
// "no backend reachable" path still feels alive without ever pretending to be
// real — every response should be tagged `demo: true` at the caller.

export const ARCHETYPES = ["Speculator", "Arbitrageur", "Sovereign", "MarketMaker", "BlackSwan"] as const;
export type Archetype = (typeof ARCHETYPES)[number];

export const SIGNAL_KINDS = ["BUY", "SELL", "HOLD", "ESCALATE_TO_GUARDIAN"] as const;
export type SignalKind = (typeof SIGNAL_KINDS)[number];

export const FSM_STATES = [
  "IDLE", "SWARM_SIGNAL_RECEIVED", "SIGNAL_VALIDATED", "THRESHOLD_CHECK",
  "MULTI_SIG_STAGED", "GUARDIAN_TIMEOUT", "EXECUTED", "REJECTED",
] as const;

export const MCP_TOOLS = [
  "wallet_sign_transaction",
  "supply_chain_api_query",
  "contract_call_simulate",
  "cross_chain_bridge_initiate",
  "audit_log_write",
] as const;
export type McpTool = (typeof MCP_TOOLS)[number];

const PAIRS = ["ETH/USD", "BTC/USD", "SOL/USD", "OP/USD", "BASE/USD", "AVAX/USD", "ARB/USD"];

/** Mulberry32 — tiny deterministic PRNG. Same seed ⇒ same stream. */
export function rng(seed: number) {
  let s = seed >>> 0;
  return () => {
    s = (s + 0x6d2b79f5) >>> 0;
    let t = Math.imul(s ^ (s >>> 15), 1 | s);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Hash a string to a uint32 seed — so callers can key on archetype names, etc. */
export function hashSeed(s: string): number {
  let h = 2166136261 >>> 0;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619) >>> 0;
  }
  return h;
}

export interface DemoSignal {
  id: string;
  archetype: Archetype;
  kind: SignalKind;
  pair: string;
  quorumBps: number;
  sigmaE6: number;
  confidence: number;
  ts: number;
}

/** Nth synthetic signal from a fixed stream. `index` goes forward with time. */
export function signalAt(index: number, nowMs: number = Date.now()): DemoSignal {
  const r = rng(hashSeed(`signal:${index}`));
  // BlackSwan is rare; Speculator/MarketMaker most common
  const weights = [0.28, 0.22, 0.16, 0.24, 0.10];
  const x = r();
  let acc = 0;
  let archIdx = 0;
  for (let i = 0; i < weights.length; i++) {
    acc += weights[i];
    if (x <= acc) { archIdx = i; break; }
  }
  const archetype = ARCHETYPES[archIdx];
  // kind mix varies by archetype
  const kindRoll = r();
  let kind: SignalKind;
  if (archetype === "BlackSwan" && kindRoll < 0.35) kind = "ESCALATE_TO_GUARDIAN";
  else if (archetype === "Sovereign" && kindRoll < 0.5) kind = "HOLD";
  else if (kindRoll < 0.52) kind = "BUY";
  else if (kindRoll < 0.82) kind = "SELL";
  else if (kindRoll < 0.95) kind = "HOLD";
  else kind = "ESCALATE_TO_GUARDIAN";

  const pair = PAIRS[(r() * PAIRS.length) | 0];
  const quorumBps = 6700 + Math.floor(r() * 2800); // 67%–95%
  const sigmaE6 = Math.floor((r() * 2 - 1) * 1_200_000); // ±1.2σ × 1e6
  const confidence = 0.62 + r() * 0.35; // 0.62–0.97
  const ts = nowMs - (1_800 - index % 1_800) * 100; // stagger historic samples
  return {
    id: `sig-${index.toString(16).padStart(8, "0")}`,
    archetype,
    kind,
    pair,
    quorumBps,
    sigmaE6,
    confidence,
    ts,
  };
}

/** The most recent N signals, ordered newest-first. `tick` makes this advance. */
export function recentSignals(n: number, tick: number = Math.floor(Date.now() / 1000)): DemoSignal[] {
  const out: DemoSignal[] = [];
  for (let i = 0; i < n; i++) {
    const idx = tick - i;
    out.push(signalAt(idx));
  }
  return out;
}

/** Per-archetype × per-tool call matrix. Stable-ish across minutes; drifts slowly. */
export function toolCallMatrix(tick: number = Math.floor(Date.now() / 60_000)): number[][] {
  const r = rng(hashSeed(`tool-matrix:${tick}`));
  // Base weights (archetype × tool). Shape reflects: arbitrageurs sim a lot,
  // speculators sign a lot, sovereigns audit a lot, market-makers bridge a lot.
  const base = [
    // wallet_sign | supply_chain | contract_sim | bridge_init | audit_log
    [180, 20,  90,  60,  40], // Speculator
    [120, 30, 240, 190,  50], // Arbitrageur
    [ 80, 40,  70,  30, 220], // Sovereign
    [210, 60, 110, 260,  60], // MarketMaker
    [ 40,150,  80,  20, 140], // BlackSwan
  ];
  return base.map(row => row.map(v => Math.max(0, Math.round(v * (0.75 + r() * 0.5)))));
}

/** Per-archetype counters — totals, PnL bps, last-seen signal. */
export function archetypeStats(tick: number = Math.floor(Date.now() / 60_000)) {
  const r = rng(hashSeed(`arch-stats:${tick}`));
  const counts = [480, 420, 360, 420, 320]; // matches AgentGraph.tsx
  return ARCHETYPES.map((name, i) => {
    const signals24h = Math.round(120 + r() * 360);
    const pnlBps = Math.round((r() * 2 - 1) * 320);
    const executedBps = Math.round(4200 + r() * 3800); // % of signals executed
    return {
      archetype: name,
      count: counts[i],
      signals24h,
      pnlBps,
      executedBps,
      mcpCalls24h: Math.round(320 + r() * 1200),
    };
  });
}

/** Representative agents for archetype deep-dives. Deterministic from name. */
export function representativeAgents(archetype: Archetype, n: number = 6) {
  const seed = hashSeed(`agents:${archetype}`);
  const r = rng(seed);
  const activities: Record<Archetype, readonly string[]> = {
    Speculator:  ["proposing BUY ETH/USD", "probing volatility", "signal cascade", "momentum scan", "quorum vote"],
    Arbitrageur: ["cross-DEX spread", "UserOp submit", "gas-optimise", "path-finding", "route simulate"],
    Sovereign:   ["policy review", "treasury rebalance", "stake voting", "risk envelope", "DAO delegate"],
    MarketMaker: ["order-book quote", "liquidity provision", "slippage calc", "inventory skew", "re-peg LP"],
    BlackSwan:   ["tail-risk scan", "escalate guardian", "hedging", "circuit-probe", "σ alert"],
  };
  const acts = activities[archetype];
  const total = { Speculator: 480, Arbitrageur: 420, Sovereign: 360, MarketMaker: 420, BlackSwan: 320 }[archetype];
  const out: { name: string; degree: number; activity: string; pnlBps: number }[] = [];
  for (let i = 0; i < n; i++) {
    const id = (r() * total) | 0;
    out.push({
      name: `agent-${archetype}-${id.toString().padStart(4, "0")}`,
      degree: 4 + ((r() * 10) | 0),
      activity: acts[(r() * acts.length) | 0],
      pnlBps: Math.round((r() * 2 - 1) * 180),
    });
  }
  return out;
}

/** Circuit breaker demo: slow drift + occasional trips to keep the dashboard alive. */
export function circuitState(nowMs: number = Date.now()) {
  const minuteBucket = Math.floor(nowMs / 60_000);
  const r = rng(hashSeed(`cb:${minuteBucket}`));
  const pct = r();
  // 8% trips, 20% warn (1–2 failures), rest 0
  let failures: number;
  let paused: boolean;
  if (pct < 0.08) { failures = 3 + ((r() * 3) | 0); paused = true; }
  else if (pct < 0.28) { failures = 1 + ((r() * 2) | 0); paused = false; }
  else { failures = 0; paused = false; }
  const windowSec = 600;
  const elapsed = Math.floor((nowMs % 60_000) / 1000) % windowSec;
  return {
    failuresInWindow: failures,
    isPaused: paused,
    windowSec,
    elapsedSec: elapsed,
    resetsInSec: Math.max(0, windowSec - elapsed),
    threshold: 2,
  };
}

export const DEMO_SIGNATURE = "deterministic-demo/v1";

/* ─── Per-agent demo (powers /swarm/[id]) ────────────────────────────── */

const AGENT_COUNTS: Record<Archetype, number> = {
  Speculator: 480, Arbitrageur: 420, Sovereign: 360, MarketMaker: 420, BlackSwan: 320,
};

export interface AgentDetail {
  id: string;             // "agent-Speculator-0042"
  archetype: Archetype;
  index: number;
  degree: number;
  isHub: boolean;
  activity: string;
  activities: string[];   // recent activity log
  pnlBps: number;
  signals24h: number;
  mcpCalls24h: number;
  neighbours: string[];   // other agent ids it co-signals with
  recentSignals: DemoSignal[];
  signer: string;         // 20-byte hex
}

const ACTIVITIES: Record<Archetype, readonly string[]> = {
  Speculator:  ["proposing BUY ETH/USD", "probing volatility", "signal cascade", "momentum scan", "quorum vote"],
  Arbitrageur: ["cross-DEX spread", "UserOp submit", "gas-optimise", "path-finding", "route simulate"],
  Sovereign:   ["policy review", "treasury rebalance", "stake voting", "risk envelope", "DAO delegate"],
  MarketMaker: ["order-book quote", "liquidity provision", "slippage calc", "inventory skew", "re-peg LP"],
  BlackSwan:   ["tail-risk scan", "escalate guardian", "hedging", "circuit-probe", "σ alert"],
};

export function parseAgentId(raw: string): { archetype: Archetype; index: number } | null {
  // canonicalise "agent-speculator-0042" → "Speculator", 42
  const m = /^agent-([a-zA-Z]+)-(\d{1,5})$/.exec(raw);
  if (!m) return null;
  const archSlug = m[1].toLowerCase();
  const found = (ARCHETYPES as readonly string[]).find(a => a.toLowerCase() === archSlug) as Archetype | undefined;
  if (!found) return null;
  const idx = Number(m[2]);
  if (!Number.isFinite(idx) || idx < 0 || idx >= AGENT_COUNTS[found]) return null;
  return { archetype: found, index: idx };
}

export function agentDetail(archetype: Archetype, index: number): AgentDetail {
  const id = `agent-${archetype}-${index.toString().padStart(4, "0")}`;
  const r = rng(hashSeed(id));
  const isHub = r() < 0.022;
  const degree = isHub ? 6 + ((r() * 8) | 0) : 2 + ((r() * 4) | 0);
  const pnlBps = Math.round((r() * 2 - 1) * 220);
  const signals24h = Math.round(6 + r() * 36);
  const mcpCalls24h = Math.round(12 + r() * 220);
  const acts = ACTIVITIES[archetype];
  const activity = acts[(r() * acts.length) | 0];
  const activities = Array.from({ length: 5 }, () => acts[(r() * acts.length) | 0]);
  const neighbours: string[] = [];
  for (let i = 0; i < 6; i++) {
    // mix of same-archetype and cross-archetype neighbours
    const cross = r() < 0.25;
    const neighArch = cross
      ? ARCHETYPES[(r() * ARCHETYPES.length) | 0]
      : archetype;
    const neighIdx = (r() * AGENT_COUNTS[neighArch]) | 0;
    if (neighArch === archetype && neighIdx === index) continue;
    neighbours.push(`agent-${neighArch}-${neighIdx.toString().padStart(4, "0")}`);
  }
  // Generate ~8 recent signals skewed to this agent's archetype
  const recent: DemoSignal[] = [];
  for (let i = 0; i < 8; i++) {
    const sig = signalAt(hashSeed(`${id}:sig:${i}`) >>> 12);
    sig.archetype = archetype;
    sig.id = `sig-${id}-${i.toString(16)}`;
    sig.ts = Date.now() - i * 11 * 60_000 - (r() * 60_000 | 0);
    recent.push(sig);
  }
  let signer = "0x";
  for (let i = 0; i < 40; i++) signer += "0123456789abcdef"[(r() * 16) | 0];
  return {
    id,
    archetype,
    index,
    degree,
    isHub,
    activity,
    activities,
    pnlBps,
    signals24h,
    mcpCalls24h,
    neighbours,
    recentSignals: recent,
    signer,
  };
}
