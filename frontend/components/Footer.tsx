// frontend/components/Footer.tsx
import { Logo } from "./Logo";

const LINKS = [
  { href: "https://github.com/SativusCrocus/Sovereign-Economy",        label: "GitHub" },
  { href: "https://github.com/SativusCrocus/Sovereign-Economy/blob/main/docs/architecture.md", label: "Architecture" },
  { href: "https://github.com/SativusCrocus/Sovereign-Economy/blob/main/docs/audit-notes.md",  label: "Audit notes" },
  { href: "https://github.com/SativusCrocus/Sovereign-Economy/blob/main/README.md",            label: "Deploy guide" },
];

export function Footer() {
  return (
    <footer className="mx-auto mt-24 w-full max-w-6xl px-4 pb-12">
      <div className="relative overflow-hidden rounded-2xl border border-border/70 bg-panel/40 p-6 md:p-8 backdrop-blur-xl">
        <div className="pointer-events-none absolute -left-20 -top-20 h-48 w-48 rounded-full bg-accent/10 blur-3xl" aria-hidden />
        <div className="pointer-events-none absolute -right-20 -bottom-20 h-48 w-48 rounded-full bg-iris/10 blur-3xl" aria-hidden />

        <div className="relative flex flex-col gap-6 md:flex-row md:items-center md:justify-between">
          <div className="flex items-center gap-3">
            <span className="grid h-10 w-10 place-items-center rounded-xl bg-panel/80 ring-1 ring-border">
              <Logo className="h-6 w-6" />
            </span>
            <div className="text-xs">
              <div className="text-sm font-semibold tracking-[0.22em] text-text">DAES</div>
              <div className="text-muted mt-1">Decentralized Autonomous Economic System</div>
            </div>
          </div>
          <nav className="flex flex-wrap items-center gap-x-5 gap-y-2 text-xs text-muted">
            {LINKS.map(l => (
              <a
                key={l.href}
                className="transition-colors duration-300 hover:text-accent"
                href={l.href}
                target="_blank"
                rel="noreferrer"
              >
                {l.label}
              </a>
            ))}
          </nav>
        </div>

        <div className="relative mt-6 hair pt-6">
          <p className="text-[11px] leading-relaxed text-muted">
            Built with Next.js 15 · wagmi v2 · viem · Tailwind CSS ·{" "}
            deterministic by construction — <code className="text-accent">numpy.SeedSequence</code> + Chainlink VRF.
            Four-stop safety: quorum gate · FSM · 3-of-5 multi-sig · 86 400 s timelock · circuit breaker.
          </p>
        </div>
      </div>
    </footer>
  );
}
