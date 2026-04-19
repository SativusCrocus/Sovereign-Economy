// frontend/components/SignalTicker.tsx
// Streaming feed of recent swarm signals. Subscribes to /api/signals/stream
// (SSE) and keeps a rolling window of the most recent entries.
// Renders two views: a horizontal marquee strip and a recent-10 list.
"use client";

import { useEffect, useMemo, useRef, useState } from "react";

interface Signal {
  id: string;
  archetype: "Speculator" | "Arbitrageur" | "Sovereign" | "MarketMaker" | "BlackSwan";
  kind: "BUY" | "SELL" | "HOLD" | "ESCALATE_TO_GUARDIAN";
  pair: string;
  quorumBps: number;
  sigmaE6: number;
  confidence: number;
  ts: number;
  demo?: boolean;
}

const ARCH_COLOR: Record<Signal["archetype"], string> = {
  Speculator:  "#f43f5e",
  Arbitrageur: "#14b8a6",
  Sovereign:   "#8b5cf6",
  MarketMaker: "#f97316",
  BlackSwan:   "#475569",
};

function KindChip({ kind }: { kind: Signal["kind"] }) {
  const cls =
    kind === "BUY"  ? "chip-ok" :
    kind === "SELL" ? "chip-b"  :
    kind === "HOLD" ? "chip"    :
                      "chip-w";
  const short = kind === "ESCALATE_TO_GUARDIAN" ? "ESCALATE" : kind;
  return <span className={cls}>{short}</span>;
}

function fmtTime(ts: number) {
  const d = new Date(ts);
  return d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit" });
}

export function SignalTicker() {
  const [signals, setSignals] = useState<Signal[]>([]);
  const [demo, setDemo] = useState<boolean | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [paused, setPaused] = useState(false);
  const pausedRef = useRef(false);
  useEffect(() => { pausedRef.current = paused; }, [paused]);

  useEffect(() => {
    let es: EventSource | null = null;
    let cancelled = false;
    try {
      es = new EventSource("/api/signals/stream");
    } catch (e) {
      setErr((e as Error).message);
      return;
    }
    es.addEventListener("hello", (ev) => {
      try {
        const data = JSON.parse((ev as MessageEvent).data) as { demo?: boolean };
        if (!cancelled && typeof data.demo === "boolean") setDemo(data.demo);
      } catch {}
    });
    es.addEventListener("mode", (ev) => {
      try {
        const data = JSON.parse((ev as MessageEvent).data) as { demo?: boolean };
        if (!cancelled && typeof data.demo === "boolean") setDemo(data.demo);
      } catch {}
    });
    es.addEventListener("signal", (ev) => {
      if (pausedRef.current || cancelled) return;
      try {
        const sig = JSON.parse((ev as MessageEvent).data) as Signal;
        setSignals(prev => {
          if (prev.some(p => p.id === sig.id)) return prev;
          return [sig, ...prev].slice(0, 24);
        });
      } catch {}
    });
    es.onerror = () => {
      if (!cancelled) setErr("stream interrupted · reconnecting");
    };
    return () => {
      cancelled = true;
      es?.close();
    };
  }, []);

  // Marquee duplicates the list so the CSS animation loops seamlessly.
  const marquee = useMemo(() => {
    const head = signals.slice(0, 12);
    return [...head, ...head];
  }, [signals]);

  return (
    <section className="panel relative overflow-hidden">
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <h2 className="label">Swarm signal ticker</h2>
          <span className={demo === false ? "chip-n pulse-dot text-good" : "chip-w"}>
            {demo === false ? "live" : demo === true ? "preview" : "connecting"}
          </span>
          {err && <span className="chip-b">{err}</span>}
        </div>
        <div className="flex items-center gap-2 text-[11px] text-muted">
          <span>last {signals.length} · {signals.length > 0 ? fmtTime(signals[0].ts) : "—"}</span>
          <button
            type="button"
            className="btn !py-1 !px-2 !text-[11px]"
            onClick={() => setPaused(p => !p)}
            aria-pressed={paused}
          >
            {paused ? "▶ resume" : "⏸ pause"}
          </button>
        </div>
      </div>

      {/* Marquee */}
      <div
        className="relative overflow-hidden rounded-lg border border-border bg-white/70"
        aria-hidden={signals.length === 0}
      >
        <div
          className="pointer-events-none absolute inset-y-0 left-0 w-16 bg-gradient-to-r from-white to-transparent z-10"
        />
        <div
          className="pointer-events-none absolute inset-y-0 right-0 w-16 bg-gradient-to-l from-white to-transparent z-10"
        />
        <div
          className={`flex gap-3 whitespace-nowrap px-4 py-2.5 ${paused ? "" : "animate-marquee"}`}
          style={{ animationPlayState: paused ? "paused" : "running" }}
        >
          {marquee.length === 0 ? (
            <div className="flex w-full items-center gap-2 py-1 text-[11px] text-muted">
              <span className="inline-block h-2 w-2 animate-pulse rounded-full bg-accent" />
              awaiting first signal…
            </div>
          ) : marquee.map((s, i) => (
            <div
              key={`${s.id}-${i}`}
              className="inline-flex shrink-0 items-center gap-2 rounded-md border border-border bg-white/80 px-2.5 py-1 text-[11px] font-mono"
            >
              <span
                className="inline-block h-2 w-2 rounded-full"
                style={{ background: ARCH_COLOR[s.archetype] }}
                aria-hidden
              />
              <span className="text-text">{s.archetype}</span>
              <KindChip kind={s.kind} />
              <span className="text-accent">{s.pair}</span>
              <span className="text-muted">q={(s.quorumBps / 100).toFixed(0)}%</span>
              <span className="text-muted">c={s.confidence.toFixed(2)}</span>
            </div>
          ))}
        </div>
      </div>

      {/* Recent list */}
      <ul className="mt-3 grid gap-1.5 md:grid-cols-2">
        {signals.slice(0, 10).map(s => (
          <li key={s.id} className="kv text-[11px]">
            <span className="flex min-w-0 items-center gap-2">
              <span className="inline-block h-2 w-2 shrink-0 rounded-full" style={{ background: ARCH_COLOR[s.archetype] }} aria-hidden />
              <span className="truncate text-text">{s.archetype}</span>
              <KindChip kind={s.kind} />
              <span className="truncate text-accent">{s.pair}</span>
            </span>
            <span className="flex items-center gap-2 text-muted">
              <span>q · {(s.quorumBps / 100).toFixed(1)}%</span>
              <span>σ · {(s.sigmaE6 / 1_000_000).toFixed(2)}</span>
              <span>{fmtTime(s.ts)}</span>
            </span>
          </li>
        ))}
      </ul>

      {demo === true && (
        <p className="mt-3 text-[11px] leading-relaxed text-muted">
          Preview stream — the DAES backend isn't reachable, so this feed is deterministic. Run{" "}
          <code className="text-accent">docker compose up</code> locally to see real signals off the agent-swarm runtime.
        </p>
      )}
    </section>
  );
}
