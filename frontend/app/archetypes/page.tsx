// frontend/app/archetypes/page.tsx — index of archetype deep-dives
import Link from "next/link";
import { ARCHETYPES, archetypeStats } from "@/lib/demo/signals";

const COLOR: Record<string, string> = {
  Speculator:  "#f43f5e",
  Arbitrageur: "#14b8a6",
  Sovereign:   "#8b5cf6",
  MarketMaker: "#f97316",
  BlackSwan:   "#475569",
};

export const metadata = { title: "Archetypes" };

export default function ArchetypesIndex() {
  const stats = archetypeStats();
  return (
    <div className="space-y-10">
      <header className="space-y-3">
        <div className="flex items-center gap-2">
          <span className="chip-i">layer 1 · cognition</span>
          <span className="chip">5 archetypes</span>
        </div>
        <h1 className="heading">Archetypes</h1>
        <p className="subheading">
          Each of the 2 000 agents inherits one of five archetypes, which drive how it proposes,
          validates, and executes. Drill into any archetype for live signals, PnL, MCP tool usage,
          and representative agents.
        </p>
      </header>

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        {ARCHETYPES.map((a, i) => {
          const s = stats[i];
          return (
            <Link
              key={a}
              href={`/archetypes/${a.toLowerCase()}`}
              className="panel tile-hover group relative overflow-hidden"
            >
              <div
                className="pointer-events-none absolute -right-10 -top-10 h-32 w-32 rounded-full opacity-50 blur-3xl transition-all duration-500 ease-silk group-hover:opacity-80 group-hover:scale-110"
                style={{ background: `radial-gradient(circle, ${COLOR[a]}66, transparent 70%)` }}
                aria-hidden
              />
              <div className="relative space-y-3">
                <div className="flex items-center justify-between">
                  <span className="inline-flex items-center gap-2">
                    <span className="h-2.5 w-2.5 rounded-full" style={{ background: COLOR[a] }} aria-hidden />
                    <span className="text-sm font-semibold tracking-tight text-text">{a}</span>
                  </span>
                  <span className="text-accent transition-transform duration-300 ease-silk group-hover:translate-x-1">→</span>
                </div>
                <div className="grid grid-cols-2 gap-2 text-[11px] font-mono">
                  <div className="kv"><span className="label">agents</span><span className="text-text">{s.count}</span></div>
                  <div className="kv"><span className="label">signals 24h</span><span className="text-text">{s.signals24h}</span></div>
                  <div className="kv"><span className="label">pnl</span><span className={s.pnlBps >= 0 ? "text-good" : "text-bad"}>{(s.pnlBps / 100).toFixed(2)}%</span></div>
                  <div className="kv"><span className="label">exec rate</span><span className="text-text">{(s.executedBps / 100).toFixed(0)}%</span></div>
                </div>
              </div>
            </Link>
          );
        })}
      </div>
    </div>
  );
}
