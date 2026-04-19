// frontend/lib/demo/cross.ts
// Shared demo generators for the Tier-2 visibility panels:
//   - LayerZero cross-chain packets (Base ⇄ Optimism)
//   - 24h determinism probe samples (state_hash + parity)
//   - DAO governance proposals + timelock ETAs
//   - IPFS audit-log entries (the index the /audit page reads)
// Each generator is deterministic for a given (tick, seed) so previews look
// stable across refreshes without ever pretending to be live.

import { hashSeed, rng, ARCHETYPES } from "./signals";

/* ─── LayerZero cross-chain packets ──────────────────────────────────── */

export type ChainId = 8453 | 10;
export const LZ_EID = { 8453: 30184, 10: 30111 } as const satisfies Record<ChainId, number>;
export const CHAIN_LABEL: Record<ChainId, string> = { 8453: "Base", 10: "Optimism" };

export interface LzPacket {
  guid: string;
  nonce: number;
  srcEid: number;
  dstEid: number;
  srcChainId: ChainId;
  dstChainId: ChainId;
  sender: string;        // 20-byte hex addr
  receiver: string;      // 32-byte hex packed addr
  archetype: (typeof ARCHETYPES)[number];
  /** phase in [0..1] — 0 = just left src, 1 = delivered at dst */
  phase: number;
  sentAt: number;
  kind: "MESSAGE" | "COMPOSE" | "ORDERED";
  size: number;
  txHashSrc: string;
  txHashDst: string | null;
}

function fakeAddr(seed: number) {
  const r = rng(seed);
  let s = "0x";
  for (let i = 0; i < 40; i++) s += "0123456789abcdef"[(r() * 16) | 0];
  return s;
}
function fakeBytes32(seed: number) {
  const r = rng(seed);
  let s = "0x";
  for (let i = 0; i < 64; i++) s += "0123456789abcdef"[(r() * 16) | 0];
  return s;
}

/** Rolling window of in-flight + recently-delivered LZ packets. */
export function lzPackets(now: number = Date.now(), n: number = 18): LzPacket[] {
  const out: LzPacket[] = [];
  // one new packet every ~6s, life ~36s
  const lifeMs = 36_000;
  const intervalMs = 6_000;
  const bucket = Math.floor(now / intervalMs);
  for (let i = 0; i < n; i++) {
    const b = bucket - i;
    const r = rng(hashSeed(`lz:${b}`));
    const srcIsBase = r() < 0.58;
    const srcChainId = (srcIsBase ? 8453 : 10) as ChainId;
    const dstChainId = (srcIsBase ? 10 : 8453) as ChainId;
    const sentAt = b * intervalMs + ((r() * intervalMs) | 0);
    const age = now - sentAt;
    const phase = Math.max(0, Math.min(1, age / lifeMs));
    const nonce = 10_000 + b;
    out.push({
      guid: fakeBytes32(hashSeed(`lz-guid:${b}`)),
      nonce,
      srcEid: LZ_EID[srcChainId],
      dstEid: LZ_EID[dstChainId],
      srcChainId,
      dstChainId,
      sender: fakeAddr(hashSeed(`lz-sender:${b}`)),
      receiver: fakeBytes32(hashSeed(`lz-receiver:${b}`)),
      archetype: ARCHETYPES[(r() * ARCHETYPES.length) | 0],
      phase,
      sentAt,
      kind: r() < 0.7 ? "MESSAGE" : r() < 0.9 ? "COMPOSE" : "ORDERED",
      size: 192 + ((r() * 2400) | 0),
      txHashSrc: fakeBytes32(hashSeed(`lz-src:${b}`)),
      txHashDst: phase >= 1 ? fakeBytes32(hashSeed(`lz-dst:${b}`)) : null,
    });
  }
  return out;
}

/* ─── Determinism probes ─────────────────────────────────────────────── */

export interface ProbeSample {
  ts: number;
  state_hash: string; // "0x…" 32-byte hash
  match: boolean;
  replica: string;    // which replica produced this sample, for display
}

/** 288 samples over the last 24h (one every 5 minutes), newest last. */
export function determinismSamples(now: number = Date.now(), n: number = 288): ProbeSample[] {
  const stepMs = 5 * 60 * 1000;
  const start = Math.floor(now / stepMs) * stepMs - (n - 1) * stepMs;
  const out: ProbeSample[] = [];
  for (let i = 0; i < n; i++) {
    const ts = start + i * stepMs;
    const r = rng(hashSeed(`probe:${ts}`));
    const replica = ["replica-a", "replica-b", "replica-c"][i % 3];
    // 99.3% match; rare mismatch clusters last 2-3 samples
    let match = r() > 0.007;
    // force a tiny cluster of mismatches roughly 14h back for visual flavour
    const hoursBack = Math.floor((now - ts) / 3_600_000);
    if (hoursBack === 14 && r() < 0.35) match = false;
    out.push({
      ts,
      state_hash: fakeBytes32(hashSeed(`probe-hash:${ts}-${match ? 1 : 2}`)),
      match,
      replica,
    });
  }
  return out;
}

export function determinismSummary(samples: ProbeSample[]) {
  const total = samples.length;
  const mismatches = samples.filter(s => !s.match).length;
  const lastMismatch = [...samples].reverse().find(s => !s.match)?.ts ?? null;
  return {
    total,
    mismatches,
    matchPct: total > 0 ? ((total - mismatches) / total) * 100 : 100,
    lastMismatch,
  };
}

/* ─── DAO governance ─────────────────────────────────────────────────── */

export type ProposalState =
  | "Pending" | "Active" | "Succeeded" | "Queued" | "Executed" | "Defeated" | "Canceled";

export interface Proposal {
  id: number;
  title: string;
  proposer: string;
  state: ProposalState;
  forVotes: number;
  againstVotes: number;
  abstainVotes: number;
  quorum: number;
  createdAt: number;
  voteEndsAt: number;
  timelockEta: number | null; // epoch ms — null if not queued
  actions: { target: string; calldata: string; desc: string }[];
  summary: string;
}

const PROPOSAL_CATALOG: { title: string; summary: string; state: ProposalState; actions: { target: string; calldata: string; desc: string }[] }[] = [
  {
    title: "Raise consensus quorum to 72%",
    summary: "Tighten the swarm quorum gate from 67% → 72% to reduce the false-signal rate observed over the last month.",
    state: "Active",
    actions: [{ target: "0xG0v3rn0r01", calldata: "setQuorumBps(7200)", desc: "Governor.setQuorumBps(7200)" }],
  },
  {
    title: "Queue BridgeExecutor upgrade v1.1",
    summary: "Adds ordered-delivery support on LayerZero path. Audit by Zellic complete.",
    state: "Queued",
    actions: [{ target: "0xT1m3l0ck", calldata: "schedule(upgrade, 86400)", desc: "Timelock.schedule(upgrade=0x…, delay=86400s)" }],
  },
  {
    title: "Add Sovereign→BlackSwan cross-archetype hedge",
    summary: "Treasury funds rotate 5% into a BlackSwan hedging bucket during σ-alerts.",
    state: "Succeeded",
    actions: [{ target: "0xTr3asury", calldata: "setHedgePct(500)", desc: "Treasury.setHedgePct(500)" }],
  },
  {
    title: "Rotate mTLS certs on mcp-gateway",
    summary: "Biannual cert rotation. Ops-gated.",
    state: "Executed",
    actions: [{ target: "0xMcpGw", calldata: "rotateCerts(0x…)", desc: "McpGateway.rotateCerts(0x…)" }],
  },
  {
    title: "Introduce MarketMaker slippage-cap oracle",
    summary: "Constrains MarketMaker archetype spread widening beyond 35 bps.",
    state: "Active",
    actions: [{ target: "0xMm0rcl", calldata: "setSlippageBps(35)", desc: "MMOracle.setSlippageBps(35)" }],
  },
  {
    title: "Defeat: lower Guardian timeout to 900s",
    summary: "Rejected — consensus view was that 3600s remains the right safety budget.",
    state: "Defeated",
    actions: [{ target: "0xG0v3rn0r01", calldata: "setGuardianTimeout(900)", desc: "Governor.setGuardianTimeout(900)" }],
  },
];

export function proposals(now: number = Date.now()): Proposal[] {
  const dayBucket = Math.floor(now / 86_400_000);
  return PROPOSAL_CATALOG.map((p, i) => {
    const r = rng(hashSeed(`prop:${dayBucket}:${i}`));
    const forV = 1_200_000 + Math.round(r() * 2_800_000);
    const againstV = Math.round(forV * (0.12 + r() * 0.55));
    const abstainV = Math.round(forV * (0.02 + r() * 0.10));
    const quorum = 2_500_000;
    const createdAt = now - (i + 1) * 6 * 60 * 60 * 1000 - (r() * 1800_000);
    const voteEndsAt = createdAt + 3 * 86_400_000; // 3d voting period
    const timelockEta =
      p.state === "Queued" ? now + 86_400_000 + ((r() * 3600_000) | 0) :
      p.state === "Succeeded" ? now + 2 * 86_400_000 :
      null;
    return {
      id: 1000 + i,
      title: p.title,
      summary: p.summary,
      proposer: fakeAddr(hashSeed(`proposer:${i}`)),
      state: p.state,
      forVotes: forV,
      againstVotes: againstV,
      abstainVotes: abstainV,
      quorum,
      createdAt,
      voteEndsAt,
      timelockEta,
      actions: p.actions,
    };
  });
}

/* ─── IPFS audit-log index ───────────────────────────────────────────── */

export interface AuditEntry {
  cid: string;               // deterministic CID-looking string
  ts: number;
  subject: string;
  event_type: string;
  size: number;
  pinners: string[];         // pinning providers that have it
  sizeClass: "small" | "medium" | "large";
  sampler: string;           // agent / operator who wrote it
}

const SUBJECTS = [
  "bridge", "agent-swarm", "governance", "treasury", "oracle", "breaker",
  "guardian", "audit", "oapp",
];
const EVENT_TYPES = [
  "signal-validated", "signal-rejected", "multisig-staged", "multisig-executed",
  "guardian-timeout", "quorum-below-threshold", "proposal-created",
  "proposal-queued", "proposal-executed", "circuit-tripped", "circuit-reset",
  "state-hash-sample", "bridge-packet-sent", "bridge-packet-delivered",
];

function fakeCid(seed: number) {
  const r = rng(seed);
  let s = "bafybei";
  const chars = "abcdefghijklmnopqrstuvwxyz234567";
  for (let i = 0; i < 52; i++) s += chars[(r() * chars.length) | 0];
  return s;
}

export function auditIndex(now: number = Date.now(), n: number = 60): AuditEntry[] {
  const out: AuditEntry[] = [];
  const minuteBucket = Math.floor(now / 60_000);
  for (let i = 0; i < n; i++) {
    const b = minuteBucket - i * 7;
    const r = rng(hashSeed(`audit:${b}`));
    const subject = SUBJECTS[(r() * SUBJECTS.length) | 0];
    const event_type = EVENT_TYPES[(r() * EVENT_TYPES.length) | 0];
    const size = 256 + ((r() * 22_000) | 0);
    const pinners = ["web3.storage", "pinata", "filebase"].filter(() => r() < 0.72);
    if (pinners.length === 0) pinners.push("web3.storage");
    const sizeClass = size < 1024 ? "small" : size < 8_192 ? "medium" : "large";
    out.push({
      cid: fakeCid(hashSeed(`cid:${b}`)),
      ts: now - i * 7 * 60_000 - ((r() * 60_000) | 0),
      subject,
      event_type,
      size,
      pinners,
      sizeClass,
      sampler:
        subject === "governance" ? "operator-ops" :
        subject === "bridge" ? "bridge-agent" :
        subject === "agent-swarm" ? `agent-${ARCHETYPES[(r() * 5) | 0]}-${String((r() * 480) | 0).padStart(4, "0")}` :
        "services",
    });
  }
  return out;
}

export function auditPreview(entry: AuditEntry): object {
  const r = rng(hashSeed(`preview:${entry.cid}`));
  const base = {
    version: 1,
    schema: "daes.audit/v1",
    ts: entry.ts,
    subject: entry.subject,
    event_type: entry.event_type,
    sampler: entry.sampler,
  };
  if (entry.event_type.startsWith("signal-")) {
    return {
      ...base,
      signal: {
        id: fakeBytes32(hashSeed(`sig:${entry.cid}`)),
        kind: ["BUY", "SELL", "HOLD", "ESCALATE_TO_GUARDIAN"][(r() * 4) | 0],
        pair: "ETH/USD",
        quorumBps: 6700 + Math.round(r() * 2800),
        sigmaE6: Math.round((r() * 2 - 1) * 1_200_000),
      },
    };
  }
  if (entry.event_type === "state-hash-sample") {
    return {
      ...base,
      state_hash: fakeBytes32(hashSeed(`probe:${entry.cid}`)),
      match: r() > 0.01,
      replicas: ["a", "b", "c"],
    };
  }
  if (entry.event_type.startsWith("proposal-")) {
    return {
      ...base,
      proposal_id: 1000 + ((r() * 6) | 0),
      actor: fakeAddr(hashSeed(`pa:${entry.cid}`)),
    };
  }
  return { ...base, details: { ref: entry.cid, note: "deterministic preview payload" } };
}
