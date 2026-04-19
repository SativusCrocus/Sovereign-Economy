// frontend/components/DeterminismTimeline.tsx
// 24-hour state_hash timeline. Each tick is a 5-minute probe run: we hash
// the swarm state across three replicas and check parity. Green = match,
// red = mismatch. A mini sparkline below shows mismatches per hour.
"use client";

import { useEffect, useMemo, useRef, useState } from "react";

interface Probe {
  ts: number;
  state_hash: string;
  match: boolean;
  replica: string;
}
interface Summary {
  total: number;
  mismatches: number;
  matchPct: number;
  lastMismatch: number | null;
}
interface Response { demo: boolean; samples: Probe[]; summary: Summary }

function fmtClock(ts: number) {
  const d = new Date(ts);
  return d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
}

function fmtAgo(ts: number | null) {
  if (!ts) return "—";
  const s = (Date.now() - ts) / 1000;
  if (s < 60) return `${Math.floor(s)}s ago`;
  if (s < 3600) return `${Math.floor(s / 60)}m ago`;
  if (s < 86_400) return `${Math.floor(s / 3600)}h ago`;
  return new Date(ts).toLocaleString();
}

export function DeterminismTimeline() {
  const [data, setData] = useState<Response | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [hoverIdx, setHoverIdx] = useState<number | null>(null);
  const railRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    let cancelled = false;
    const tick = async () => {
      try {
        const r = await fetch("/api/determinism/probes", { cache: "no-store" });
        if (!r.ok) throw new Error(`status ${r.status}`);
        const body = await r.json() as Response;
        if (!cancelled) { setData(body); setErr(null); }
      } catch (e) { if (!cancelled) setErr((e as Error).message); }
    };
    tick();
    const id = setInterval(tick, 30_000);
    return () => { cancelled = true; clearInterval(id); };
  }, []);

  // Aggregate mismatches per hour for the sparkline
  const hourly = useMemo(() => {
    if (!data) return null;
    const buckets: { hour: number; mismatches: number; total: number }[] = [];
    for (let h = 23; h >= 0; h--) buckets.push({ hour: h, mismatches: 0, total: 0 });
    const now = Date.now();
    for (const s of data.samples) {
      const hoursAgo = Math.floor((now - s.ts) / 3_600_000);
      if (hoursAgo < 0 || hoursAgo > 23) continue;
      const bucket = buckets[23 - hoursAgo];
      bucket.total++;
      if (!s.match) bucket.mismatches++;
    }
    return buckets;
  }, [data]);

  const hovered = hoverIdx !== null && data ? data.samples[hoverIdx] : null;
  const severity = !data ? "idle"
    : data.summary.mismatches === 0 ? "ok"
    : data.summary.mismatches < 5   ? "warn"
    : "critical";

  return (
    <section className="panel-lg relative overflow-hidden">
      <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <h2 className="label">Determinism probe · 24h</h2>
          {data && (data.demo ? <span className="chip-w">preview</span> : <span className="chip-n pulse-dot text-good">live</span>)}
          <span className={
            severity === "ok"       ? "chip-ok" :
            severity === "warn"     ? "chip-w"  :
            severity === "critical" ? "chip-b"  :
                                      "chip"
          }>
            {data ? `${data.summary.matchPct.toFixed(2)}% match` : "probing"}
          </span>
        </div>
        {data && (
          <div className="flex items-center gap-3 text-[11px] text-muted">
            <span>{data.summary.mismatches} / {data.summary.total} mismatches</span>
            <span>last mismatch · {fmtAgo(data.summary.lastMismatch)}</span>
          </div>
        )}
      </div>

      {err && <p className="text-[11px] text-bad">{err}</p>}

      {!data && !err && (
        <div className="h-10 animate-pulse rounded-md border border-border bg-white/40" />
      )}

      {data && (
        <>
          {/* Main rail: 288 tiny bars */}
          <div
            ref={railRef}
            className="relative h-12 w-full rounded-md border border-border bg-white/60"
            onMouseLeave={() => setHoverIdx(null)}
          >
            <div className="absolute inset-0 flex items-stretch gap-[1px] p-[2px]">
              {data.samples.map((s, i) => (
                <button
                  type="button"
                  key={s.ts}
                  className={
                    "group relative flex-1 rounded-[1px] transition-all duration-150 " +
                    (s.match
                      ? "bg-good/70 hover:bg-good"
                      : "bg-bad hover:bg-bad/90 ring-1 ring-bad/50")
                  }
                  onMouseEnter={() => setHoverIdx(i)}
                  onClick={() => setHoverIdx(i)}
                  aria-label={`${fmtClock(s.ts)} ${s.match ? "match" : "MISMATCH"}`}
                  title={`${fmtClock(s.ts)} · ${s.match ? "match" : "MISMATCH"}`}
                />
              ))}
            </div>
            {/* hour gridlines */}
            {Array.from({ length: 5 }).map((_, i) => (
              <div
                key={i}
                className="pointer-events-none absolute inset-y-1 w-px bg-border/80"
                style={{ left: `${((i + 1) * 16.666)}%` }}
              />
            ))}
          </div>

          {/* Axis labels */}
          <div className="mt-1 flex justify-between text-[10px] font-mono text-muted">
            <span>24h ago</span><span>18h</span><span>12h</span><span>6h</span><span>now</span>
          </div>

          {/* Detail + per-hour sparkline */}
          <div className="mt-4 grid gap-3 md:grid-cols-[1fr_1fr]">
            <div className="panel !p-3">
              <div className="flex items-center gap-2">
                <span className="label">sample</span>
                {hovered ? (
                  <span className={hovered.match ? "chip-ok" : "chip-b"}>
                    {hovered.match ? "match" : "MISMATCH"}
                  </span>
                ) : (
                  <span className="chip">hover a tick</span>
                )}
              </div>
              {hovered ? (
                <div className="mt-2 space-y-1 text-[11px] font-mono">
                  <div className="kv"><span className="label">at</span><span className="text-text">{new Date(hovered.ts).toLocaleString()}</span></div>
                  <div className="kv"><span className="label">replica</span><span className="text-accent">{hovered.replica}</span></div>
                  <div className="kv">
                    <span className="label">state_hash</span>
                    <code className="ml-2 truncate text-accent" title={hovered.state_hash}>
                      {`${hovered.state_hash.slice(0, 10)}…${hovered.state_hash.slice(-6)}`}
                    </code>
                  </div>
                </div>
              ) : (
                <p className="mt-2 text-[11px] text-muted">
                  Each tick is one of 288 replay-parity samples over the last 24h.
                  A deterministic swarm matches across replicas by construction —
                  any red tick is a regression worth chasing.
                </p>
              )}
            </div>

            <div className="panel !p-3">
              <div className="mb-1 flex items-center justify-between">
                <span className="label">mismatches per hour</span>
                <span className="text-[11px] text-muted">24h</span>
              </div>
              {hourly && (
                <div className="flex h-16 items-end gap-[2px]">
                  {hourly.map((h, i) => {
                    const maxM = Math.max(1, ...hourly.map(b => b.mismatches));
                    const mPct = (h.mismatches / maxM) * 100;
                    return (
                      <div
                        key={i}
                        className="group relative flex-1"
                        title={`h-${23 - i} · ${h.mismatches} mismatches / ${h.total}`}
                      >
                        <div
                          className={"w-full rounded-t " + (h.mismatches > 0 ? "bg-bad/80" : "bg-border/50")}
                          style={{ height: `${h.mismatches > 0 ? Math.max(10, mPct) : 6}%` }}
                        />
                      </div>
                    );
                  })}
                </div>
              )}
              <div className="mt-1 flex justify-between text-[10px] font-mono text-muted">
                <span>−23h</span><span>−12h</span><span>now</span>
              </div>
            </div>
          </div>
        </>
      )}
    </section>
  );
}
