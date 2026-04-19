// frontend/app/page.tsx — dashboard
import Link from "next/link";
import { HealthCard } from "@/components/HealthCard";
import { GrafanaEmbed } from "@/components/GrafanaEmbed";
import { Logo } from "@/components/Logo";

const QUICK_LINKS = [
  {
    href: "/bridge",
    title: "Bridge FSM",
    desc: "Inspect signal state · stage 3-of-5 multi-sig · monitor the 8-state finite machine.",
  },
  {
    href: "/accounts",
    title: "Agent accounts",
    desc: "Sign ERC-4337 v0.7 UserOps · submit via Pimlico bundler · select archetype.",
  },
  {
    href: "/audit",
    title: "Audit log",
    desc: "Write immutable entries to IPFS · fetch by CID · pin through multiple providers.",
  },
];

const STATS = [
  { label: "Layers",     value: "4",      tint: "text-accent" },
  { label: "Agents",     value: "1 000",  tint: "text-accent" },
  { label: "Signatures", value: "3 / 5",  tint: "text-good" },
  { label: "Timelock",   value: "24 h",   tint: "text-warn" },
] as const;

export default function Page() {
  return (
    <div className="space-y-8">
      <section className="panel-lg relative overflow-hidden">
        <div className="pointer-events-none absolute -right-24 -top-24 h-72 w-72 rounded-full bg-accent/10 blur-3xl" aria-hidden />
        <div className="flex flex-col gap-6 md:flex-row md:items-center md:justify-between">
          <div className="max-w-2xl space-y-3">
            <div className="flex items-center gap-2">
              <span className="chip-n pulse-dot text-good">Operator console · live</span>
            </div>
            <h1 className="heading">
              Sovereign <span className="text-accent">Economy</span>
            </h1>
            <p className="subheading">
              A 1000-agent GraphRAG swarm, gated through an MCP tool-execution plane and a 3-of-5 multi-sig bridge —
              monitored here in real time.
            </p>
            <div className="flex flex-wrap gap-2 pt-1">
              <Link className="btn-p" href="/bridge">Open bridge →</Link>
              <Link className="btn" href="/accounts">Agent accounts</Link>
              <Link className="btn" href="/audit">Audit log</Link>
            </div>
          </div>
          <div className="shrink-0">
            <Logo className="h-24 w-24 md:h-32 md:w-32 drop-shadow-[0_0_28px_rgba(56,189,248,0.25)]" />
          </div>
        </div>

        <div className="mt-6 grid grid-cols-2 gap-3 md:grid-cols-4">
          {STATS.map(s => (
            <div key={s.label} className="rounded-lg border border-border bg-bg/40 px-4 py-3">
              <div className="label">{s.label}</div>
              <div className={`mt-1 text-2xl font-bold tracking-tight ${s.tint}`}>{s.value}</div>
            </div>
          ))}
        </div>
      </section>

      <HealthCard />

      <GrafanaEmbed />

      <section className="space-y-3">
        <h2 className="label">Quick links</h2>
        <div className="grid gap-3 md:grid-cols-3">
          {QUICK_LINKS.map(q => (
            <Link
              key={q.href}
              href={q.href}
              className="panel group transition hover:border-accent/50 hover:bg-panel"
            >
              <div className="flex items-center justify-between">
                <span className="text-sm font-semibold text-text">{q.title}</span>
                <span className="text-accent transition group-hover:translate-x-0.5">→</span>
              </div>
              <p className="mt-1.5 text-xs leading-relaxed text-muted">{q.desc}</p>
            </Link>
          ))}
        </div>
      </section>
    </div>
  );
}
