// frontend/components/CircuitBreakerWidget.tsx
// Live circuit-breaker dashboard tile.
//   - Prefers on-chain reads when ADDRESSES[chainId].circuitBreaker is set.
//   - Falls back to /api/circuit (deterministic demo when no backend).
// Pulses red when failures > 0. Shows a countdown to the auto-reset of the
// 600s rolling window (threshold: 2 failures).
"use client";

import { useEffect, useMemo, useState } from "react";
import { useChainId, usePublicClient } from "wagmi";
import type { Abi, Address } from "viem";
import { ABIS } from "@/lib/contracts";
import { ADDRESSES } from "@/lib/config";

interface State {
  failuresInWindow: number;
  isPaused: boolean;
  windowSec: number;
  elapsedSec: number;
  resetsInSec: number;
  threshold: number;
  demo: boolean;
}

function fmt(sec: number) {
  const m = Math.floor(sec / 60);
  const s = Math.max(0, Math.floor(sec % 60));
  return `${m}m ${s.toString().padStart(2, "0")}s`;
}

export function CircuitBreakerWidget() {
  const chainId = useChainId();
  const addrs = ADDRESSES[chainId] ?? {};
  const breaker = addrs.circuitBreaker as Address | undefined;
  const pc = usePublicClient({ chainId });

  const [state, setState] = useState<State | null>(null);
  const [err, setErr] = useState<string | null>(null);

  // Poll /api/circuit every 5s when no on-chain address is available.
  useEffect(() => {
    if (breaker && pc) return;
    let cancelled = false;
    const tick = async () => {
      try {
        const r = await fetch("/api/circuit", { cache: "no-store" });
        if (!r.ok) throw new Error(`status ${r.status}`);
        const body = await r.json() as State;
        if (!cancelled) { setState(body); setErr(null); }
      } catch (e) { if (!cancelled) setErr((e as Error).message); }
    };
    tick();
    const id = setInterval(tick, 5_000);
    return () => { cancelled = true; clearInterval(id); };
  }, [breaker, pc]);

  // On-chain read when available.
  useEffect(() => {
    if (!breaker || !pc) return;
    let cancelled = false;
    const tick = async () => {
      try {
        const [failures, paused] = await Promise.all([
          pc.readContract({
            address: breaker,
            abi: ABIS.breaker as Abi,
            functionName: "failuresInWindow",
          }) as Promise<number>,
          pc.readContract({
            address: breaker,
            abi: ABIS.breaker as Abi,
            functionName: "isPaused",
          }) as Promise<boolean>,
        ]);
        if (cancelled) return;
        const windowSec = 600;
        const elapsed = Math.floor((Date.now() % 60_000) / 1000) % windowSec;
        setState({
          failuresInWindow: Number(failures),
          isPaused: Boolean(paused),
          windowSec,
          elapsedSec: elapsed,
          resetsInSec: Math.max(0, windowSec - elapsed),
          threshold: 2,
          demo: false,
        });
        setErr(null);
      } catch (e) { if (!cancelled) setErr((e as Error).message); }
    };
    tick();
    const id = setInterval(tick, 8_000);
    return () => { cancelled = true; clearInterval(id); };
  }, [breaker, pc]);

  // Local tick so the countdown ticks every second without refetching.
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 1_000);
    return () => clearInterval(id);
  }, []);

  const view = useMemo(() => {
    if (!state) return null;
    const drift = Math.floor((now - Math.floor(now / 1_000) * 1_000) / 1_000);
    // slide the countdown; if it's already 0, stay at 0
    const adj = Math.max(0, state.resetsInSec - drift);
    return { ...state, resetsInSec: adj };
  }, [state, now]);

  const severity =
    !view ? "idle" :
    view.isPaused ? "critical" :
    view.failuresInWindow >= view.threshold ? "critical" :
    view.failuresInWindow > 0 ? "warn" : "ok";

  const progress = view ? Math.min(100, (view.elapsedSec / view.windowSec) * 100) : 0;
  const failPct = view ? Math.min(100, (view.failuresInWindow / Math.max(1, view.threshold)) * 100) : 0;

  return (
    <section className={"panel relative overflow-hidden " + (severity === "critical" ? "ring-1 ring-bad/30" : "")}>
      <div className="mb-3 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <h2 className="label">Circuit breaker</h2>
          {view?.demo && <span className="chip-w">preview</span>}
          <span className={
            severity === "critical" ? "chip-b pulse-dot text-bad" :
            severity === "warn"     ? "chip-w pulse-dot text-warn" :
            severity === "ok"       ? "chip-ok pulse-dot text-good" :
                                      "chip"
          }>
            {severity === "critical" ? (view?.isPaused ? "tripped · paused" : "at threshold") :
             severity === "warn"     ? "failures detected" :
             severity === "ok"       ? "healthy" :
                                       "probing"}
          </span>
        </div>
        <span className="text-[11px] text-muted">10-min rolling window</span>
      </div>

      {err && <p className="mb-2 text-[11px] text-bad">{err}</p>}

      {/* Failure counter */}
      <div className="relative grid grid-cols-[auto_1fr] items-center gap-4">
        <div
          className={
            "grid h-20 w-20 place-items-center rounded-2xl border text-3xl font-bold " +
            (severity === "critical" ? "border-bad/40 bg-bad/10 text-bad animate-pulse2" :
             severity === "warn"     ? "border-warn/40 bg-warn/10 text-warn" :
             severity === "ok"       ? "border-good/30 bg-good/10 text-good" :
                                       "border-border bg-white/70 text-muted")
          }
        >
          {view ? view.failuresInWindow : "—"}
        </div>
        <div className="min-w-0 space-y-2">
          <div>
            <div className="flex items-center justify-between text-[11px]">
              <span className="label">failures</span>
              <span className="text-muted">threshold · {view?.threshold ?? "—"}</span>
            </div>
            <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-border/60">
              <div
                className={
                  "h-full transition-all duration-500 " +
                  (severity === "critical" ? "bg-bad"  :
                   severity === "warn"     ? "bg-warn" : "bg-good")
                }
                style={{ width: `${failPct}%` }}
              />
            </div>
          </div>
          <div>
            <div className="flex items-center justify-between text-[11px]">
              <span className="label">window reset</span>
              <span className="text-muted">{view ? fmt(view.resetsInSec) : "—"}</span>
            </div>
            <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-border/60">
              <div
                className="h-full bg-gradient-to-r from-accent to-iris transition-all duration-700 ease-silk"
                style={{ width: `${progress}%` }}
              />
            </div>
          </div>
        </div>
      </div>

      <p className="mt-3 text-[11px] leading-relaxed text-muted">
        {view?.isPaused
          ? "System auto-paused. Reset requires Guardian or DAO vote — 2 failures in 600s is the trigger."
          : "Auto-pauses when > 2 failures hit within 600s. Reset only by Guardian or DAO vote."}
      </p>
    </section>
  );
}
