// frontend/components/Nav.tsx
"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { WalletConnect } from "./WalletConnect";
import { Logo } from "./Logo";

const LINKS = [
  { href: "/",         label: "Dashboard" },
  { href: "/bridge",   label: "Bridge" },
  { href: "/accounts", label: "Accounts" },
  { href: "/audit",    label: "Audit" },
] as const;

export function Nav() {
  const pathname = usePathname();
  const isActive = (href: string) =>
    href === "/" ? pathname === "/" : pathname.startsWith(href);

  return (
    <header className="sticky top-0 z-20 border-b border-border bg-bg/80 backdrop-blur supports-[backdrop-filter]:bg-bg/60">
      <div className="mx-auto flex max-w-6xl items-center justify-between gap-4 px-4 py-3">
        <Link href="/" className="flex items-center gap-2.5 group" aria-label="DAES home">
          <Logo className="h-7 w-7 transition group-hover:drop-shadow-[0_0_8px_rgba(56,189,248,0.5)]" />
          <div className="leading-none">
            <div className="text-sm font-bold tracking-widest text-text">DAES</div>
            <div className="mt-0.5 hidden text-[10px] uppercase tracking-[0.18em] text-muted sm:block">Sovereign Economy</div>
          </div>
        </Link>

        <nav className="hidden items-center gap-1 md:flex">
          {LINKS.map(l => (
            <Link
              key={l.href}
              href={l.href}
              className={
                "rounded-md px-3 py-1.5 text-sm transition " +
                (isActive(l.href)
                  ? "bg-accent/10 text-accent ring-1 ring-accent/30"
                  : "text-muted hover:text-text hover:bg-border/40")
              }
            >
              {l.label}
            </Link>
          ))}
        </nav>

        <div className="flex items-center gap-2">
          <WalletConnect />
        </div>
      </div>

      <nav className="mx-auto flex max-w-6xl gap-1 px-4 pb-2 md:hidden">
        {LINKS.map(l => (
          <Link
            key={l.href}
            href={l.href}
            className={
              "rounded-md px-2.5 py-1 text-xs transition " +
              (isActive(l.href)
                ? "bg-accent/10 text-accent ring-1 ring-accent/30"
                : "text-muted hover:text-text hover:bg-border/40")
            }
          >
            {l.label}
          </Link>
        ))}
      </nav>
    </header>
  );
}
