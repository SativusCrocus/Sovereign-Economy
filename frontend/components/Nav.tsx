// frontend/components/Nav.tsx
"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useLayoutEffect, useRef, useState } from "react";
import { WalletConnect } from "./WalletConnect";
import { Logo } from "./Logo";

const LINKS = [
  { href: "/",         label: "Dashboard" },
  { href: "/bridge",   label: "Bridge"    },
  { href: "/accounts", label: "Accounts"  },
  { href: "/audit",    label: "Audit"     },
] as const;

interface IndicatorStyle { left: number; width: number; opacity: number }

export function Nav() {
  const pathname = usePathname();
  const navRef = useRef<HTMLDivElement>(null);
  const itemRefs = useRef<Array<HTMLAnchorElement | null>>([]);
  const [ind, setInd] = useState<IndicatorStyle>({ left: 0, width: 0, opacity: 0 });

  const isActive = (href: string) =>
    href === "/" ? pathname === "/" : pathname.startsWith(href);

  useLayoutEffect(() => {
    const idx = LINKS.findIndex(l => isActive(l.href));
    const el = idx >= 0 ? itemRefs.current[idx] : null;
    const nav = navRef.current;
    if (!el || !nav) { setInd(s => ({ ...s, opacity: 0 })); return; }
    const r  = el.getBoundingClientRect();
    const nr = nav.getBoundingClientRect();
    setInd({ left: r.left - nr.left, width: r.width, opacity: 1 });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pathname]);

  return (
    <header className="sticky top-3 z-20 px-3 md:top-4 md:px-4">
      <div className="mx-auto flex max-w-6xl items-center justify-between gap-3 rounded-2xl border border-border bg-white/75 px-3 py-2 backdrop-blur-xl shadow-card md:px-4">
        <Link href="/" className="group flex items-center gap-2.5" aria-label="DAES home">
          <span className="relative grid h-9 w-9 place-items-center rounded-xl bg-white ring-1 ring-border transition-all duration-300 ease-silk group-hover:ring-accent/40 group-hover:shadow-glow">
            <Logo className="h-6 w-6 transition-transform duration-500 ease-silk group-hover:rotate-[9deg]" />
          </span>
          <div className="leading-none">
            <div className="text-sm font-semibold tracking-[0.22em] text-text">DAES</div>
            <div className="mt-1 hidden text-[9px] uppercase tracking-[0.28em] text-muted sm:block">Sovereign Economy</div>
          </div>
        </Link>

        <nav
          ref={navRef}
          className="relative hidden items-center gap-0.5 rounded-xl border border-border bg-bg2/60 p-1 md:flex"
        >
          <div
            className="pointer-events-none absolute inset-y-1 rounded-lg bg-accent/10 ring-1 ring-accent/30 transition-all duration-500 ease-silk"
            style={{ left: ind.left, width: ind.width, opacity: ind.opacity }}
            aria-hidden
          />
          {LINKS.map((l, i) => (
            <Link
              key={l.href}
              ref={el => { itemRefs.current[i] = el; }}
              href={l.href}
              className={
                "relative z-10 rounded-lg px-3.5 py-1.5 text-sm transition-colors duration-300 " +
                (isActive(l.href) ? "text-accent font-medium" : "text-muted hover:text-text")
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

      <nav className="mx-auto mt-2 flex max-w-6xl gap-1 overflow-x-auto rounded-xl border border-border bg-white/75 p-1 backdrop-blur-xl md:hidden">
        {LINKS.map(l => (
          <Link
            key={l.href}
            href={l.href}
            className={
              "whitespace-nowrap rounded-lg px-3 py-1.5 text-xs transition " +
              (isActive(l.href)
                ? "bg-accent/10 text-accent ring-1 ring-accent/30"
                : "text-muted hover:text-text hover:bg-bg2")
            }
          >
            {l.label}
          </Link>
        ))}
      </nav>
    </header>
  );
}
