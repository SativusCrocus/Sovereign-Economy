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
    <footer className="mx-auto mt-16 w-full max-w-6xl px-4 pb-10">
      <div className="hair pt-6">
        <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
          <div className="flex items-center gap-2.5">
            <Logo className="h-6 w-6" />
            <div className="text-xs">
              <div className="font-semibold text-text tracking-widest">DAES</div>
              <div className="text-muted">Decentralized Autonomous Economic System</div>
            </div>
          </div>
          <nav className="flex flex-wrap items-center gap-x-4 gap-y-2 text-xs text-muted">
            {LINKS.map(l => (
              <a key={l.href} className="hover:text-accent transition" href={l.href} target="_blank" rel="noreferrer">
                {l.label}
              </a>
            ))}
          </nav>
        </div>
        <p className="mt-6 text-[11px] leading-relaxed text-muted">
          Operator console · built with Next.js 15 · wagmi v2 · viem · Tailwind CSS.
          Deterministic by construction — <code className="text-accent">numpy.SeedSequence</code> + Chainlink VRF.
          Four-stop safety: quorum gate · FSM · 3-of-5 multi-sig · 86 400 s timelock · circuit breaker.
        </p>
      </div>
    </footer>
  );
}
