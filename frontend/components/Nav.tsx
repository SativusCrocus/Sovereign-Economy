// frontend/components/Nav.tsx
"use client";
import Link from "next/link";
import { WalletConnect } from "./WalletConnect";

const LINKS = [
  { href: "/",         label: "Dashboard" },
  { href: "/bridge",   label: "Bridge" },
  { href: "/accounts", label: "Accounts" },
  { href: "/audit",    label: "Audit" },
];

export function Nav() {
  return (
    <header className="sticky top-0 z-10 border-b border-border bg-bg/95 backdrop-blur">
      <div className="mx-auto flex max-w-6xl items-center justify-between px-4 py-3">
        <Link href="/" className="text-lg font-bold tracking-tight">DAES <span className="text-muted">console</span></Link>
        <nav className="flex items-center gap-4 text-sm">
          {LINKS.map(l => (
            <Link key={l.href} href={l.href} className="text-muted transition hover:text-text">{l.label}</Link>
          ))}
          <WalletConnect />
        </nav>
      </div>
    </header>
  );
}
