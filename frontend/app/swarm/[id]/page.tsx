// frontend/app/swarm/[id]/page.tsx
// Per-agent drill-down. Linked from the AgentGraph canvas (click a dot),
// the command palette, and the archetype pages.
import Link from "next/link";
import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { agentDetail, parseAgentId } from "@/lib/demo/signals";

const COLOR = {
  Speculator:  "#f43f5e",
  Arbitrageur: "#14b8a6",
  Sovereign:   "#8b5cf6",
  MarketMaker: "#f97316",
  BlackSwan:   "#475569",
} as const;

export async function generateMetadata({
  params,
}: { params: Promise<{ id: string }> }): Promise<Metadata> {
  const { id } = await params;
  return { title: decodeURIComponent(id) };
}

function short(s: string, n = 6) {
  if (s.length <= 2 * n + 3) return s;
  return `${s.slice(0, n + 2)}…${s.slice(-n)}`;
}

export default async function SwarmAgentPage({
  params,
}: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const parsed = parseAgentId(decodeURIComponent(id));
  if (!parsed) notFound();
  const a = agentDetail(parsed.archetype, parsed.index);
  const color = COLOR[parsed.archetype];

  return (
    <div className="space-y-10">
      <header className="space-y-3">
        <div className="flex flex-wrap items-center gap-2">
          <Link className="link text-xs" href={`/archetypes/${a.archetype.toLowerCase()}`}>← {a.archetype}</Link>
          <span className="chip">/ swarm</span>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <span className="inline-flex items-center gap-2 rounded-full border border-border bg-white/80 px-2.5 py-0.5 text-[11px]">
            <span className="h-2 w-2 rounded-full" style={{ background: color }} aria-hidden />
            <span className="font-mono uppercase tracking-[0.16em]">{a.archetype}</span>
          </span>
          {a.isHub ? <span className="chip-n pulse-dot text-good">hub</span> : <span className="chip">follower</span>}
          <span className="chip">degree {a.degree}</span>
          <span className="chip">#{a.index}</span>
        </div>
        <h1 className="heading font-mono">{a.id}</h1>
        <p className="subheading">{a.activity}</p>
      </header>

      {/* Stats */}
      <section className="grid gap-3 md:grid-cols-4">
        <div className="panel"><div className="label">Signals · 24h</div><div className="mt-1 text-2xl font-bold text-text">{a.signals24h}</div></div>
        <div className="panel"><div className="label">MCP calls · 24h</div><div className="mt-1 text-2xl font-bold text-text">{a.mcpCalls24h}</div></div>
        <div className="panel"><div className="label">PnL · 24h</div><div className={"mt-1 text-2xl font-bold " + (a.pnlBps >= 0 ? "text-good" : "text-bad")}>{a.pnlBps >= 0 ? "+" : ""}{(a.pnlBps / 100).toFixed(2)}%</div></div>
        <div className="panel"><div className="label">Degree</div><div className="mt-1 text-2xl font-bold text-text">{a.degree}</div></div>
      </section>

      {/* Signer */}
      <section className="panel-lg space-y-2">
        <h2 className="label">Signer address</h2>
        <code className="block break-all text-[12px] text-accent">{a.signer}</code>
        <p className="text-[11px] text-muted">
          Deterministic preview signer. In production the archetype-specific HSM derives one key per agent index.
        </p>
      </section>

      {/* Recent signals */}
      <section className="panel-lg">
        <h2 className="label mb-3">Recent signals</h2>
        <ul className="grid gap-2 md:grid-cols-2">
          {a.recentSignals.map(s => (
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
                <span>{new Date(s.ts).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}</span>
              </span>
            </li>
          ))}
        </ul>
      </section>

      {/* Activity log */}
      <section className="panel-lg">
        <h2 className="label mb-3">Activity log</h2>
        <ol className="space-y-1.5 text-[12px] font-mono">
          {a.activities.map((act, i) => (
            <li key={i} className="kv">
              <span className="text-muted">t-{i}</span>
              <span className="ml-2 text-accent">{act}</span>
            </li>
          ))}
        </ol>
      </section>

      {/* Neighbours */}
      <section className="panel-lg">
        <h2 className="label mb-3">Neighbours · shared-signal cohort</h2>
        <ul className="grid gap-2 md:grid-cols-2">
          {a.neighbours.map(n => (
            <li key={n} className="kv text-[11px]">
              <Link href={`/swarm/${n}`} className="link font-mono truncate">{n}</Link>
              <span className="ml-2 text-muted">{short(n, 4)}</span>
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}
