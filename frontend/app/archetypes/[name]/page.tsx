// frontend/app/archetypes/[name]/page.tsx — per-archetype deep dive
import Link from "next/link";
import { notFound } from "next/navigation";
import type { Metadata } from "next";
import {
  ARCHETYPES,
  archetypeStats,
  recentSignals,
  representativeAgents,
  toolCallMatrix,
  MCP_TOOLS,
  type Archetype,
} from "@/lib/demo/signals";

const COLOR: Record<Archetype, string> = {
  Speculator:  "#f43f5e",
  Arbitrageur: "#14b8a6",
  Sovereign:   "#8b5cf6",
  MarketMaker: "#f97316",
  BlackSwan:   "#475569",
};

const ROLES: Record<Archetype, { desc: string; strategies: string[]; safety: string }> = {
  Speculator: {
    desc:  "Aggressive short-to-medium horizon traders. Propose BUY/SELL on momentum and cascades. High throughput, low position size per signal.",
    strategies: ["Momentum-breakout", "Liquidity-sweep detection", "Quorum cascade"],
    safety: "Rate-limited to 6 signals/min at the consensus gate. σ-clamped to ±1.5σ of the swarm median.",
  },
  Arbitrageur: {
    desc:  "Cross-DEX and cross-chain price arbitrage. Heavy on contract simulation and bridge initiation.",
    strategies: ["Uniswap v3 ↔ Aerodrome spreads", "Base ⇄ Optimism pair imbalance", "LayerZero packet path-finding"],
    safety: "Simulation required before any cross-chain bridge UserOp. Gas-cap enforced via AgentAccount.",
  },
  Sovereign: {
    desc:  "Long-horizon policy and treasury agents. Lean toward HOLD and governance actions.",
    strategies: ["Risk-envelope rebalancing", "DAO vote delegation", "Treasury T-bill ladder"],
    safety: "All actions subject to 86 400s timelock. DAOSnapshot signature mandatory at layer 3.",
  },
  MarketMaker: {
    desc:  "Liquidity providers. Balanced BUY/SELL on order-book skew with slow inventory drift.",
    strategies: ["Quote two-sided with σ-indexed spread", "Inventory-skew re-pegging", "LP slippage bound"],
    safety: "Circuit breaker pauses MMs first when > 2 failures hit in 600s.",
  },
  BlackSwan: {
    desc:  "Tail-risk and kill-switch agents. Escalate to human guardian on > 3σ dislocations.",
    strategies: ["σ-alert monitoring", "Guardian escalation", "Hedging via short OTM puts"],
    safety: "ESCALATE_TO_GUARDIAN pauses dependent signals until reset by Guardian or DAO vote.",
  },
};

function resolveArchetype(slug: string): Archetype | null {
  const lower = slug.toLowerCase();
  return (ARCHETYPES as readonly string[]).find(a => a.toLowerCase() === lower) as Archetype | undefined ?? null;
}

export function generateStaticParams() {
  return ARCHETYPES.map(a => ({ name: a.toLowerCase() }));
}

export async function generateMetadata({
  params,
}: { params: Promise<{ name: string }> }): Promise<Metadata> {
  const { name } = await params;
  const arch = resolveArchetype(name);
  return { title: arch ?? "Archetype" };
}

export default async function ArchetypePage({
  params,
}: { params: Promise<{ name: string }> }) {
  const { name } = await params;
  const arch = resolveArchetype(name);
  if (!arch) notFound();

  const stats = archetypeStats();
  const idx = ARCHETYPES.indexOf(arch);
  const stat = stats[idx];
  const color = COLOR[arch];
  const role = ROLES[arch];

  const feed = recentSignals(120).filter(s => s.archetype === arch).slice(0, 12);
  const matrix = toolCallMatrix();
  const row = matrix[idx];
  const rowTotal = Math.max(1, row.reduce((a, b) => a + b, 0));
  const agents = representativeAgents(arch, 8);

  return (
    <div className="space-y-10">
      {/* ─── Header ─── */}
      <header className="space-y-4">
        <Link href="/archetypes" className="link text-xs">← all archetypes</Link>
        <div className="flex flex-wrap items-center gap-2">
          <span className="inline-flex items-center gap-2 rounded-full border border-border bg-white/80 px-2.5 py-0.5 text-[11px]">
            <span className="h-2 w-2 rounded-full" style={{ background: color }} aria-hidden />
            <span className="font-mono uppercase tracking-[0.16em]">{arch}</span>
          </span>
          <span className="chip">{stat.count} agents</span>
          <span className="chip-i">layer 1 · cognition</span>
        </div>
        <h1 className="heading">{arch}</h1>
        <p className="subheading">{role.desc}</p>
      </header>

      {/* ─── Stats row ─── */}
      <section className="grid gap-3 md:grid-cols-4">
        <div className="panel">
          <div className="label">Agents</div>
          <div className="mt-1 text-2xl font-bold text-text">{stat.count}</div>
          <p className="mt-1 text-[11px] text-muted">of 2 000 total</p>
        </div>
        <div className="panel">
          <div className="label">Signals · 24h</div>
          <div className="mt-1 text-2xl font-bold text-text">{stat.signals24h}</div>
          <p className="mt-1 text-[11px] text-muted">post-consensus</p>
        </div>
        <div className="panel">
          <div className="label">PnL · 24h</div>
          <div className={"mt-1 text-2xl font-bold " + (stat.pnlBps >= 0 ? "text-good" : "text-bad")}>
            {stat.pnlBps >= 0 ? "+" : ""}{(stat.pnlBps / 100).toFixed(2)}%
          </div>
          <p className="mt-1 text-[11px] text-muted">bps on deployed capital</p>
        </div>
        <div className="panel">
          <div className="label">Exec rate</div>
          <div className="mt-1 text-2xl font-bold text-text">{(stat.executedBps / 100).toFixed(0)}%</div>
          <p className="mt-1 text-[11px] text-muted">cleared through FSM</p>
        </div>
      </section>

      {/* ─── Strategies + safety ─── */}
      <section className="grid gap-4 md:grid-cols-[1.4fr_1fr]">
        <div className="panel-lg">
          <h2 className="label mb-3">Strategies</h2>
          <ul className="space-y-2 text-sm">
            {role.strategies.map(s => (
              <li key={s} className="flex items-start gap-2">
                <span className="mt-1 inline-block h-1.5 w-1.5 shrink-0 rounded-full" style={{ background: color }} aria-hidden />
                <span className="text-text">{s}</span>
              </li>
            ))}
          </ul>
        </div>
        <div className="panel-lg">
          <h2 className="label mb-3">Safety rails</h2>
          <p className="text-sm leading-relaxed text-text">{role.safety}</p>
        </div>
      </section>

      {/* ─── Recent signals ─── */}
      <section className="panel-lg">
        <h2 className="label mb-3">Recent signals · preview</h2>
        {feed.length === 0 ? (
          <p className="py-6 text-center text-xs text-muted">No recent signals from this archetype.</p>
        ) : (
          <ul className="grid gap-2 md:grid-cols-2">
            {feed.map(s => (
              <li key={s.id} className="kv text-[11px]">
                <span className="flex min-w-0 items-center gap-2">
                  <span className={
                    s.kind === "BUY"  ? "chip-ok" :
                    s.kind === "SELL" ? "chip-b"  :
                    s.kind === "HOLD" ? "chip"    : "chip-w"
                  }>
                    {s.kind === "ESCALATE_TO_GUARDIAN" ? "ESCALATE" : s.kind}
                  </span>
                  <span className="text-accent">{s.pair}</span>
                </span>
                <span className="flex items-center gap-3 text-muted">
                  <span>q · {(s.quorumBps / 100).toFixed(0)}%</span>
                  <span>σ · {(s.sigmaE6 / 1_000_000).toFixed(2)}</span>
                  <span>c · {s.confidence.toFixed(2)}</span>
                </span>
              </li>
            ))}
          </ul>
        )}
      </section>

      {/* ─── MCP tool bar chart ─── */}
      <section className="panel-lg">
        <h2 className="label mb-3">MCP tool usage · last hour</h2>
        <ul className="space-y-2.5">
          {MCP_TOOLS.map((t, c) => {
            const v = row[c];
            const pct = (v / rowTotal) * 100;
            return (
              <li key={t} className="grid grid-cols-[170px_1fr_72px] items-center gap-3">
                <span className="truncate text-[12px] font-mono text-text" title={t}>{t}</span>
                <div className="h-2 overflow-hidden rounded-full bg-border/60">
                  <div
                    className="h-full rounded-full transition-all duration-500 ease-silk"
                    style={{ width: `${pct}%`, background: color }}
                  />
                </div>
                <span className="text-right text-[11px] font-mono text-muted">
                  {v.toLocaleString()} · {pct.toFixed(1)}%
                </span>
              </li>
            );
          })}
        </ul>
      </section>

      {/* ─── Representative agents ─── */}
      <section className="panel-lg">
        <div className="mb-3 flex items-center justify-between">
          <h2 className="label">Representative agents</h2>
          <span className="text-[11px] text-muted">preview sample</span>
        </div>
        <ul className="grid gap-2 md:grid-cols-2">
          {agents.map(a => (
            <li key={a.name} className="kv text-[11px]">
              <span className="flex min-w-0 items-center gap-2">
                <span className="h-2 w-2 shrink-0 rounded-full" style={{ background: color }} aria-hidden />
                <span className="truncate font-mono text-text">{a.name}</span>
              </span>
              <span className="flex items-center gap-3 text-muted">
                <span>deg · {a.degree}</span>
                <span className={a.pnlBps >= 0 ? "text-good" : "text-bad"}>
                  {a.pnlBps >= 0 ? "+" : ""}{(a.pnlBps / 100).toFixed(2)}%
                </span>
                <span className="truncate text-accent">{a.activity}</span>
              </span>
            </li>
          ))}
        </ul>
      </section>

      <p className="text-[11px] text-muted">
        Figures above are deterministic previews when no DAES backend is reachable. Wire{" "}
        <code className="text-accent">NEXT_PUBLIC_AGENT_SWARM_URL</code> and seed the MCP stats endpoint to replace them with live reads.
      </p>
    </div>
  );
}
