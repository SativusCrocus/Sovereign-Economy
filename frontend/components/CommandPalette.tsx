// frontend/components/CommandPalette.tsx
// ⌘K / Ctrl+K command palette. Fuzzy-searches pages, agents, archetypes,
// recent signals, tx hashes, CIDs, and imperative actions. Keyboard-
// driven: arrow keys move, Enter runs, Esc closes.
"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { fuzzyMatch, highlight, type FuzzyMatch } from "@/lib/search";
import { ARCHETYPES, type Archetype } from "@/lib/demo/signals";

/* ─── Item catalog ───────────────────────────────────────────────────── */

type Kind = "page" | "archetype" | "agent" | "signal" | "cid" | "tx" | "action" | "doc" | "shortcut";

interface Item {
  id: string;
  kind: Kind;
  title: string;
  subtitle?: string;
  href?: string;
  action?: () => void;
  keywords?: string;
  badge?: string;
}

const PAGE_ITEMS: Item[] = [
  { id: "p-dashboard",  kind: "page", title: "Dashboard",           href: "/",             badge: "g d", keywords: "home overview" },
  { id: "p-bridge",     kind: "page", title: "Bridge",              href: "/bridge",       badge: "g b", keywords: "fsm multisig execute" },
  { id: "p-bridge-sim", kind: "page", title: "FSM simulator",       href: "/bridge/sim",   badge: "g s", keywords: "simulate quorum sigma threshold" },
  { id: "p-archetypes", kind: "page", title: "Archetypes",          href: "/archetypes",   badge: "g r", keywords: "swarm speculator arbitrageur sovereign marketmaker blackswan" },
  { id: "p-accounts",   kind: "page", title: "Agent accounts",      href: "/accounts",     badge: "g a", keywords: "erc-4337 userop pimlico" },
  { id: "p-audit",      kind: "page", title: "Audit log",           href: "/audit",        badge: "g u", keywords: "ipfs pin cid" },
  { id: "p-risk",       kind: "page", title: "Risk simulator",      href: "/risk",         badge: "g k", keywords: "safety stops survivorship" },
  { id: "p-docs",       kind: "page", title: "Docs",                href: "/docs",         badge: "g o", keywords: "architecture markdown mermaid reference" },
  { id: "p-design",     kind: "page", title: "Design tokens",       href: "/design",       badge: "g t", keywords: "palette components storybook showcase" },
];

const DOC_ITEMS: Item[] = [
  { id: "d-architecture", kind: "doc", title: "Architecture overview",  href: "https://github.com/SativusCrocus/Sovereign-Economy#readme", keywords: "readme layers" },
  { id: "d-fsm",          kind: "doc", title: "Bridge FSM state machine", href: "/bridge", keywords: "states signal" },
  { id: "d-mcp-tools",    kind: "doc", title: "MCP tool catalogue",      href: "/accounts", keywords: "wallet_sign supply_chain contract_sim bridge_init audit_log" },
];

type RecentFeed = {
  signals: { id: string; archetype: string; kind: string; pair: string; ts: number }[];
  packets: { guid: string; archetype: string; srcChainId: number; dstChainId: number }[];
  audit: { cid: string; subject: string; event_type: string; ts: number }[];
  executions: { signalId: string; archetype?: string; finalState: string; txHash: string; chainId: number }[];
};

/* ─── Component ──────────────────────────────────────────────────────── */

interface CommandPaletteProps {
  open: boolean;
  onClose: () => void;
}

export function CommandPalette({ open, onClose }: CommandPaletteProps) {
  const router = useRouter();
  const [query, setQuery] = useState("");
  const [active, setActive] = useState(0);
  const [feed, setFeed] = useState<RecentFeed>({ signals: [], packets: [], audit: [], executions: [] });
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLUListElement>(null);

  // Fetch a tiny slice of recent data when the palette opens. Cheap — all
  // endpoints are cached at the edge / served from deterministic demo.
  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    (async () => {
      try {
        const [lz, audit, bridge] = await Promise.all([
          fetch("/api/lz/packets", { cache: "no-store" }).then(r => r.ok ? r.json() : { packets: [] }),
          fetch("/api/audit/log",  { cache: "no-store" }).then(r => r.ok ? r.json() : { entries: [] }),
          fetch("/api/bridge/events", { cache: "no-store" }).then(r => r.ok ? r.json() : { executions: [] }),
        ]);
        if (cancelled) return;
        setFeed({
          signals: [], // signals come in via SSE elsewhere — skip for the palette
          packets: (lz.packets ?? []).slice(0, 8),
          audit: (audit.entries ?? []).slice(0, 10),
          executions: (bridge.executions ?? []).slice(0, 8),
        });
      } catch {}
    })();
    return () => { cancelled = true; };
  }, [open]);

  // Focus the input every time we open.
  useEffect(() => {
    if (!open) return;
    const id = requestAnimationFrame(() => inputRef.current?.focus());
    return () => cancelAnimationFrame(id);
  }, [open]);

  // Reset on close.
  useEffect(() => {
    if (!open) { setQuery(""); setActive(0); }
  }, [open]);

  const items: Item[] = useMemo(() => {
    const agentSuggestions: Item[] = [];
    const q = query.trim();
    // Detect explicit agent-id query (e.g., "Speculator 42" or "agent-blackswan-0003")
    const explicitAgent = /^agent-([a-zA-Z]+)-(\d{1,5})$/.exec(q);
    const shortAgent = /^(speculator|arbitrageur|sovereign|marketmaker|blackswan)\s+(\d{1,5})$/i.exec(q);
    if (explicitAgent || shortAgent) {
      const archRaw = (explicitAgent?.[1] ?? shortAgent?.[1] ?? "").toLowerCase();
      const idx = Number(explicitAgent?.[2] ?? shortAgent?.[2]);
      const arch = (ARCHETYPES as readonly string[]).find(a => a.toLowerCase() === archRaw) as Archetype | undefined;
      if (arch && Number.isFinite(idx)) {
        const id = `agent-${arch}-${idx.toString().padStart(4, "0")}`;
        agentSuggestions.push({
          id: `ag-${id}`,
          kind: "agent",
          title: id,
          subtitle: `open ${arch} agent`,
          href: `/swarm/${id}`,
        });
      }
    }

    const archetypeItems: Item[] = ARCHETYPES.map(a => ({
      id: `arch-${a}`,
      kind: "archetype",
      title: a,
      subtitle: "archetype deep-dive",
      href: `/archetypes/${a.toLowerCase()}`,
    }));

    const signalItems: Item[] = feed.signals.map(s => ({
      id: `sig-${s.id}`,
      kind: "signal",
      title: `${s.archetype} · ${s.kind} · ${s.pair}`,
      subtitle: s.id,
      href: `/archetypes/${s.archetype.toLowerCase()}`,
    }));
    const packetItems: Item[] = feed.packets.map(p => ({
      id: `pkt-${p.guid}`,
      kind: "tx",
      title: `LayerZero · ${p.archetype}`,
      subtitle: `${p.guid.slice(0, 18)}…  · ${p.srcChainId} → ${p.dstChainId}`,
      href: "/#cross-chain-flow",
    }));
    const auditItems: Item[] = feed.audit.map(a => ({
      id: `cid-${a.cid}`,
      kind: "cid",
      title: `${a.subject} · ${a.event_type}`,
      subtitle: a.cid,
      href: `/audit?cid=${a.cid}`,
    }));
    const execItems: Item[] = feed.executions.map(e => ({
      id: `tx-${e.signalId}`,
      kind: "tx",
      title: `${e.finalState} · ${e.archetype ?? "—"}`,
      subtitle: `${e.txHash.slice(0, 18)}… · chain ${e.chainId}`,
      href: "/bridge",
    }));

    const actions: Item[] = [
      {
        id: "act-theme",
        kind: "action",
        title: "Toggle theme · light ⇄ dark",
        subtitle: "persists to localStorage",
        action: () => {
          const html = document.documentElement;
          const next = html.classList.contains("dark") ? "light" : "dark";
          if (next === "dark") html.classList.add("dark"); else html.classList.remove("dark");
          try { window.localStorage.setItem("daes.theme", next); } catch {}
        },
        keywords: "dark light theme",
      },
      {
        id: "act-docs",
        kind: "action",
        title: "Open docs · GitHub",
        subtitle: "SativusCrocus/Sovereign-Economy",
        href: "https://github.com/SativusCrocus/Sovereign-Economy",
        keywords: "docs readme architecture",
      },
    ];

    const shortcuts: Item[] = [
      { id: "sc-help",    kind: "shortcut", title: "Show keyboard shortcuts",  badge: "?",   action: () => window.dispatchEvent(new CustomEvent("daes:help")), keywords: "help keys cheat" },
      { id: "sc-search",  kind: "shortcut", title: "Open command palette",     badge: "⌘K",  action: () => {}, keywords: "search palette" },
    ];

    return [
      ...agentSuggestions,
      ...PAGE_ITEMS,
      ...archetypeItems,
      ...execItems,
      ...packetItems,
      ...auditItems,
      ...signalItems,
      ...actions,
      ...DOC_ITEMS,
      ...shortcuts,
    ];
  }, [feed, query]);

  const filtered = useMemo(() => {
    const q = query.trim();
    if (!q) {
      // Default ordering: pages first, then useful actions, then the rest.
      return items.slice(0, 24).map((item, i) => ({ item, score: 1000 - i, positions: [] as number[] }));
    }
    const scored: { item: Item; score: number; positions: number[] }[] = [];
    for (const item of items) {
      const haystack = `${item.title}  ${item.subtitle ?? ""}  ${item.keywords ?? ""}  ${item.kind}  ${item.badge ?? ""}`;
      const m: FuzzyMatch | null = fuzzyMatch(q, haystack);
      if (!m) continue;
      // Small boost when the match starts in the primary title
      const tm = fuzzyMatch(q, item.title);
      const score = m.score + (tm ? tm.score * 0.8 : 0);
      const positions = (tm?.positions ?? []).slice();
      scored.push({ item, score, positions });
    }
    scored.sort((a, b) => b.score - a.score);
    return scored.slice(0, 40);
  }, [items, query]);

  useEffect(() => { setActive(0); }, [query]);
  useEffect(() => {
    const el = listRef.current;
    if (!el) return;
    const child = el.querySelector<HTMLElement>(`[data-idx="${active}"]`);
    child?.scrollIntoView({ block: "nearest" });
  }, [active]);

  const runItem = useCallback((item: Item) => {
    if (item.action) item.action();
    if (item.href) {
      if (item.href.startsWith("http")) window.open(item.href, "_blank", "noreferrer");
      else router.push(item.href);
    }
    onClose();
  }, [onClose, router]);

  const onKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "ArrowDown") { e.preventDefault(); setActive(a => Math.min(filtered.length - 1, a + 1)); }
    else if (e.key === "ArrowUp") { e.preventDefault(); setActive(a => Math.max(0, a - 1)); }
    else if (e.key === "Enter") { e.preventDefault(); const pick = filtered[active]?.item; if (pick) runItem(pick); }
    else if (e.key === "Escape") { e.preventDefault(); onClose(); }
  };

  if (!open) return null;

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Command palette"
      className="fixed inset-0 z-50 flex items-start justify-center px-3 pt-[10vh]"
    >
      <div
        className="absolute inset-0 bg-bg/60 backdrop-blur-sm"
        onClick={onClose}
        aria-hidden
      />
      <div className="relative w-full max-w-xl overflow-hidden rounded-2xl border border-border bg-white/95 shadow-card-lg">
        <div className="flex items-center gap-3 border-b border-border px-4 py-3">
          <svg viewBox="0 0 24 24" className="h-4 w-4 text-muted" fill="none" stroke="currentColor" strokeWidth="1.75" aria-hidden>
            <circle cx="11" cy="11" r="7" />
            <path d="m20 20-3.5-3.5" strokeLinecap="round" />
          </svg>
          <input
            ref={inputRef}
            type="text"
            value={query}
            onChange={e => setQuery(e.target.value)}
            onKeyDown={onKeyDown}
            placeholder="Search pages, agents, tx hashes, CIDs…"
            className="flex-1 bg-transparent text-sm outline-none placeholder:text-subtle"
          />
          <span className="shrink-0 rounded border border-border px-1.5 py-0.5 text-[10px] font-mono text-muted">esc</span>
        </div>

        <ul ref={listRef} className="max-h-[60vh] overflow-y-auto p-1">
          {filtered.length === 0 && (
            <li className="px-4 py-6 text-center text-xs text-muted">
              no matches — try an archetype name, a page, or a tx prefix
            </li>
          )}
          {filtered.map(({ item, positions }, i) => {
            const selected = i === active;
            const parts = highlight(item.title, positions);
            return (
              <li
                key={item.id}
                data-idx={i}
                className={
                  "group flex cursor-pointer items-center gap-3 rounded-lg px-3 py-2 text-sm transition-colors " +
                  (selected ? "bg-accent/10 text-text" : "hover:bg-accent/5 text-text")
                }
                onMouseEnter={() => setActive(i)}
                onClick={() => runItem(item)}
              >
                <KindIcon kind={item.kind} />
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <span className="truncate font-medium">
                      {parts.map((p, j) => (
                        <span key={j} className={p.hit ? "text-accent" : ""}>{p.text}</span>
                      ))}
                    </span>
                    {item.badge && <span className="chip font-mono text-[10px] !px-1.5">{item.badge}</span>}
                  </div>
                  {item.subtitle && (
                    <p className="truncate text-[11px] text-muted">{item.subtitle}</p>
                  )}
                </div>
                <span className="shrink-0 rounded border border-border px-1.5 py-0.5 text-[10px] font-mono text-muted">
                  {kindLabel(item.kind)}
                </span>
              </li>
            );
          })}
        </ul>

        <div className="flex items-center justify-between border-t border-border bg-white/60 px-3 py-2 text-[11px] text-muted">
          <span>{filtered.length} results</span>
          <span className="flex items-center gap-2">
            <kbd className="rounded border border-border px-1 font-mono">↑↓</kbd>
            <span>navigate</span>
            <kbd className="rounded border border-border px-1 font-mono">↵</kbd>
            <span>open</span>
            <kbd className="rounded border border-border px-1 font-mono">esc</kbd>
            <span>close</span>
          </span>
        </div>
      </div>
    </div>
  );
}

function kindLabel(kind: Kind) {
  switch (kind) {
    case "page":      return "page";
    case "archetype": return "archetype";
    case "agent":     return "agent";
    case "signal":    return "signal";
    case "cid":       return "cid";
    case "tx":        return "tx";
    case "action":    return "action";
    case "doc":       return "doc";
    case "shortcut":  return "keys";
  }
}

function KindIcon({ kind }: { kind: Kind }) {
  const cls = "h-4 w-4 shrink-0";
  const color =
    kind === "archetype" || kind === "agent" ? "text-iris" :
    kind === "tx" || kind === "cid"           ? "text-magenta" :
    kind === "action" || kind === "shortcut"  ? "text-accent" :
    kind === "doc"                            ? "text-muted" :
                                                "text-accent";
  return (
    <svg viewBox="0 0 24 24" className={`${cls} ${color}`} fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      {kind === "page"      && <path d="M4 4h11l5 5v11H4Z M15 4v5h5" />}
      {kind === "archetype" && <path d="M12 4l8 4v8l-8 4-8-4V8z" />}
      {kind === "agent"     && <path d="M12 12a4 4 0 1 0 0-8 4 4 0 0 0 0 8ZM4 20a8 8 0 0 1 16 0" />}
      {kind === "signal"    && <path d="M4 12h3l2-6 4 12 2-6h5" />}
      {kind === "cid"       && <path d="M4 7v10l8 4 8-4V7l-8-4Zm0 0 8 4 8-4M12 11v10" />}
      {kind === "tx"        && <path d="M4 12h14m-5-5 5 5-5 5" />}
      {kind === "action"    && <path d="M5 12l4 4 10-10" />}
      {kind === "doc"       && <path d="M6 3h9l4 4v14H6Z M13 3v5h5" />}
      {kind === "shortcut"  && <path d="M4 7h16v10H4z M8 11h.01M12 11h.01M16 11h.01M7 15h10" />}
    </svg>
  );
}

/* ─── Small trigger button for the nav ───────────────────────────────── */

export function CommandPaletteTrigger() {
  return (
    <button
      type="button"
      onClick={() => window.dispatchEvent(new CustomEvent("daes:palette"))}
      aria-label="Open command palette"
      title="Search · ⌘K"
      className="hidden h-9 items-center gap-2 rounded-xl border border-border bg-white/80 px-2.5 text-[11px] text-muted transition-all duration-300 hover:border-accent/40 hover:text-accent hover:shadow-glow sm:inline-flex"
    >
      <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="1.75" aria-hidden>
        <circle cx="11" cy="11" r="7" />
        <path d="m20 20-3.5-3.5" strokeLinecap="round" />
      </svg>
      <span className="hidden md:inline">search</span>
      <kbd className="ml-1 rounded border border-border px-1 font-mono">⌘K</kbd>
    </button>
  );
}

/* ─── Host wraps both palette + help overlay with keyboard wiring ────── */

interface HostProps {
  children?: React.ReactNode;
}

export function CommandPaletteHost({ children }: HostProps) {
  const [open, setOpen] = useState(false);
  const [helpOpen, setHelpOpen] = useState(false);
  const pendingG = useRef<number | null>(null);
  const router = useRouter();

  useEffect(() => {
    const onPalette = () => setOpen(true);
    const onHelp    = () => setHelpOpen(true);
    window.addEventListener("daes:palette", onPalette);
    window.addEventListener("daes:help", onHelp);
    return () => {
      window.removeEventListener("daes:palette", onPalette);
      window.removeEventListener("daes:help", onHelp);
    };
  }, []);

  useEffect(() => {
    const isEditable = (el: EventTarget | null) => {
      if (!(el instanceof HTMLElement)) return false;
      const tag = el.tagName;
      return tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT" || el.isContentEditable;
    };
    const onKey = (e: KeyboardEvent) => {
      // ⌘K / Ctrl+K opens the palette from anywhere (even in inputs)
      if ((e.metaKey || e.ctrlKey) && (e.key === "k" || e.key === "K")) {
        e.preventDefault();
        setOpen(o => !o);
        setHelpOpen(false);
        return;
      }
      if (isEditable(e.target)) return;
      if (e.key === "?") {
        e.preventDefault();
        setHelpOpen(true);
        return;
      }
      if (e.key === "/") {
        e.preventDefault();
        setOpen(true);
        return;
      }
      if (e.key === "Escape") {
        setOpen(false);
        setHelpOpen(false);
        return;
      }
      // Chord consumption must win over standalone `t` so `g t` navigates.
      if (pendingG.current !== null) {
        let dest: string | null = null;
        switch (e.key) {
          case "d": dest = "/"; break;
          case "b": dest = "/bridge"; break;
          case "s": dest = "/bridge/sim"; break;
          case "a": dest = "/accounts"; break;
          case "r": dest = "/archetypes"; break;
          case "u": dest = "/audit"; break;
          case "k": dest = "/risk"; break;
          case "o": dest = "/docs"; break;
          case "t": dest = "/design"; break;
        }
        window.clearTimeout(pendingG.current);
        pendingG.current = null;
        if (dest) {
          e.preventDefault();
          router.push(dest);
          return;
        }
      }
      if (e.key === "t") {
        // toggle theme
        const html = document.documentElement;
        const next = html.classList.contains("dark") ? "light" : "dark";
        if (next === "dark") html.classList.add("dark"); else html.classList.remove("dark");
        try { window.localStorage.setItem("daes.theme", next); } catch {}
        return;
      }
      if (e.key === "g") {
        if (pendingG.current) window.clearTimeout(pendingG.current);
        pendingG.current = window.setTimeout(() => { pendingG.current = null; }, 1000);
        return;
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [router]);

  return (
    <>
      {children}
      <CommandPalette open={open} onClose={() => setOpen(false)} />
      <ShortcutsHelp open={helpOpen} onClose={() => setHelpOpen(false)} />
    </>
  );
}

/* ─── Help overlay ───────────────────────────────────────────────────── */

const SHORTCUTS: { keys: string; desc: string; group: string }[] = [
  { group: "Palette",     keys: "⌘ K",  desc: "Open command palette" },
  { group: "Palette",     keys: "/",    desc: "Open command palette" },
  { group: "Palette",     keys: "↑ ↓",  desc: "Move between results" },
  { group: "Palette",     keys: "↵",    desc: "Open the highlighted result" },
  { group: "Palette",     keys: "esc",  desc: "Close" },
  { group: "Navigation",  keys: "g d",  desc: "Go to Dashboard" },
  { group: "Navigation",  keys: "g b",  desc: "Go to Bridge" },
  { group: "Navigation",  keys: "g s",  desc: "Go to FSM simulator" },
  { group: "Navigation",  keys: "g r",  desc: "Go to Archetypes" },
  { group: "Navigation",  keys: "g a",  desc: "Go to Agent accounts" },
  { group: "Navigation",  keys: "g u",  desc: "Go to Audit log" },
  { group: "Navigation",  keys: "g k",  desc: "Go to Risk simulator" },
  { group: "Navigation",  keys: "g o",  desc: "Go to Docs" },
  { group: "Navigation",  keys: "g t",  desc: "Go to Design tokens" },
  { group: "General",     keys: "?",    desc: "Show this help" },
  { group: "General",     keys: "t",    desc: "Toggle theme" },
  { group: "General",     keys: "esc",  desc: "Dismiss overlay" },
];

export function ShortcutsHelp({ open, onClose }: { open: boolean; onClose: () => void }) {
  if (!open) return null;
  const groups = Array.from(new Set(SHORTCUTS.map(s => s.group)));
  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Keyboard shortcuts"
      className="fixed inset-0 z-50 flex items-center justify-center px-3"
    >
      <div className="absolute inset-0 bg-bg/60 backdrop-blur-sm" onClick={onClose} aria-hidden />
      <div className="relative w-full max-w-lg rounded-2xl border border-border bg-white/95 p-5 shadow-card-lg">
        <div className="mb-3 flex items-center justify-between">
          <h2 className="label">Keyboard shortcuts</h2>
          <button className="btn !py-1 !px-2 !text-[11px]" onClick={onClose}>close · esc</button>
        </div>
        <div className="grid gap-4 md:grid-cols-2">
          {groups.map(group => (
            <section key={group}>
              <div className="mb-2 label">{group}</div>
              <ul className="space-y-1.5 text-[12px]">
                {SHORTCUTS.filter(s => s.group === group).map((s, i) => (
                  <li key={i} className="flex items-center justify-between gap-3">
                    <span className="text-text">{s.desc}</span>
                    <KeyBadge keys={s.keys} />
                  </li>
                ))}
              </ul>
            </section>
          ))}
        </div>
        <p className="mt-4 text-[11px] leading-relaxed text-muted">
          Shortcuts are ignored while typing in an input. Chord keys (like <KeyBadge keys="g b" />) expire after one second.
        </p>
      </div>
    </div>
  );
}

function KeyBadge({ keys }: { keys: string }) {
  return (
    <span className="flex items-center gap-1">
      {keys.split(" ").map((k, i) => (
        <kbd key={i} className="rounded border border-border bg-white/80 px-1.5 py-0.5 font-mono text-[10px] text-text">
          {k}
        </kbd>
      ))}
    </span>
  );
}

/** Floating pill that shows "?" hint. Lives in the footer. */
export function HelpHint() {
  return (
    <button
      type="button"
      onClick={() => window.dispatchEvent(new CustomEvent("daes:help"))}
      className="inline-flex items-center gap-1.5 rounded-full border border-border bg-white/80 px-2.5 py-0.5 text-[11px] text-muted transition-colors hover:text-accent"
      title="Keyboard shortcuts · ?"
    >
      <kbd className="rounded border border-border px-1 font-mono text-[10px]">?</kbd>
      <span>shortcuts</span>
    </button>
  );
}

// Named re-export so existing imports work from components/CommandPalette
export { Link };
