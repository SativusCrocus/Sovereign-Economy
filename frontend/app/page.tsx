// frontend/app/page.tsx — dashboard
import Link from "next/link";
import { HealthCard } from "@/components/HealthCard";
import { GrafanaEmbed } from "@/components/GrafanaEmbed";
import { HeroLogo } from "@/components/HeroLogo";
import { AgentGraph } from "@/components/AgentGraph";

const STATS = [
  { label: "Layers",     value: "4",     tint: "from-accent to-accent2",  trail: "cognition · action · settlement · ops" },
  { label: "Agents",     value: "2 000", tint: "from-iris to-magenta",    trail: "deterministic swarm · 5 archetypes" },
  { label: "Signatures", value: "3 / 5", tint: "from-good to-accent",     trail: "agent · human · timelock · DAO" },
  { label: "Timelock",   value: "24 h",  tint: "from-warn to-magenta",    trail: "86 400 s · nothing ships sooner" },
] as const;

type Tile = {
  href: string;
  title: string;
  desc: string;
  tag: string;
  color: "accent" | "iris" | "magenta";
  span?: string;
};
const TILES: readonly Tile[] = [
  {
    href: "/bridge",
    title: "Bridge FSM",
    desc: "8-state finite machine. Stage signals for 3-of-5 multi-sig — guarded by 4 independent safety stops.",
    tag: "core",
    color: "accent",
    span: "md:col-span-2",
  },
  {
    href: "/accounts",
    title: "Agent accounts",
    desc: "ERC-4337 v0.7 UserOps. Per-archetype HSM keys. Submit via Pimlico bundler.",
    tag: "aa",
    color: "iris",
  },
  {
    href: "/audit",
    title: "Audit log",
    desc: "Immutable entries pinned across IPFS providers. Fetch any entry by CID.",
    tag: "ipfs",
    color: "magenta",
  },
];

export default function Page() {
  return (
    <div className="space-y-12">
      {/* ─── Hero ─── */}
      <section className="panel-hero relative overflow-hidden">
        <div className="pointer-events-none absolute -right-40 -top-32 h-96 w-96 rounded-full bg-iris/10 blur-3xl" aria-hidden />
        <div className="pointer-events-none absolute -left-20 -bottom-32 h-72 w-72 rounded-full bg-accent/10 blur-3xl" aria-hidden />

        <div className="relative grid items-center gap-10 md:grid-cols-[1fr_auto]">
          <div className="space-y-6">
            <div className="flex flex-wrap items-center gap-2">
              <span className="chip-n pulse-dot text-good">Operator console · live</span>
              <span className="chip-i">v1.0.0</span>
              <span className="chip">Base · Optimism</span>
            </div>
            <h1 className="display">
              The <span className="text-gradient">Sovereign</span><br />
              Economy, gated.
            </h1>
            <p className="subheading">
              A two-thousand-agent GraphRAG swarm reasons, proposes, and executes through an MCP tool-execution
              plane — every action cleared by a 3-of-5 multi-sig bridge and a 24-hour timelock. Monitored here in
              real time.
            </p>
            <div className="flex flex-wrap gap-3 pt-1">
              <Link className="btn-p sheen" href="/bridge">Open the bridge →</Link>
              <Link className="btn" href="/accounts">Agent accounts</Link>
              <Link className="btn" href="/audit">Audit log</Link>
            </div>
          </div>

          <div className="relative mx-auto hidden md:block">
            <HeroLogo />
          </div>
        </div>
      </section>

      {/* ─── Stats ─── */}
      <section className="grid grid-cols-2 gap-3 md:grid-cols-4">
        {STATS.map(s => (
          <div key={s.label} className="panel tile-hover relative overflow-hidden">
            <div className="label">{s.label}</div>
            <div className={`mt-1 bg-gradient-to-br bg-clip-text text-3xl font-bold tracking-tight text-transparent ${s.tint}`}>
              {s.value}
            </div>
            <p className="mt-1 text-[11px] leading-relaxed text-muted">{s.trail}</p>
            <div className="pointer-events-none absolute inset-x-0 -top-px h-px bg-gradient-to-r from-transparent via-border2 to-transparent" aria-hidden />
          </div>
        ))}
      </section>

      {/* ─── Agent relationship graph ─── */}
      <AgentGraph />

      {/* ─── Live health ─── */}
      <HealthCard />

      {/* ─── Grafana (or deterministic preview) ─── */}
      <GrafanaEmbed />

      {/* ─── Bento quick-links ─── */}
      <section className="space-y-4">
        <div className="flex items-center justify-between">
          <h2 className="label">Explore</h2>
          <span className="text-[11px] text-muted">3 subsystems</span>
        </div>
        <div className="grid gap-4 md:grid-cols-3">
          {TILES.map(t => (
            <Link
              key={t.href}
              href={t.href}
              className={`panel tile-hover group relative flex flex-col justify-between gap-6 overflow-hidden ${t.span ?? ""}`}
              style={{ minHeight: 180 }}
            >
              <div
                className="pointer-events-none absolute -right-16 -top-16 h-48 w-48 rounded-full opacity-50 blur-3xl transition-all duration-500 ease-silk group-hover:opacity-80 group-hover:scale-110"
                style={{
                  background:
                    t.color === "accent"  ? "radial-gradient(circle, rgba(14,165,233,0.35), transparent 70%)" :
                    t.color === "iris"    ? "radial-gradient(circle, rgba(124,58,237,0.30), transparent 70%)" :
                                            "radial-gradient(circle, rgba(219,39,119,0.30), transparent 70%)",
                }}
                aria-hidden
              />
              <div className="relative space-y-3">
                <div className="flex items-center justify-between">
                  <span className={
                    t.color === "accent"  ? "chip-n" :
                    t.color === "iris"    ? "chip-i" :
                                            "chip border-magenta/30 text-magenta bg-magenta/10"
                  }>{t.tag}</span>
                  <span className="text-accent transition-transform duration-300 ease-silk group-hover:translate-x-1">→</span>
                </div>
                <h3 className="text-xl font-semibold tracking-tight text-text">{t.title}</h3>
                <p className="text-sm leading-relaxed text-muted">{t.desc}</p>
              </div>
            </Link>
          ))}
        </div>
      </section>
    </div>
  );
}
