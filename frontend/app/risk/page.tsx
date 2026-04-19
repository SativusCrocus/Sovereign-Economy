// frontend/app/risk/page.tsx
// Risk simulator — tweak the four safety stops and see, for a deterministic
// population of 2000 candidate signals, how many clear each stage.
// Complements /bridge/sim (single-signal trace).
"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { hashSeed, rng, ARCHETYPES, type Archetype } from "@/lib/demo/signals";

/* ─── Sample population ──────────────────────────────────────────────── */

interface Candidate {
  id: number;
  archetype: Archetype;
  kind: "BUY" | "SELL" | "HOLD" | "ESCALATE_TO_GUARDIAN";
  quorumPct: number;   // 0..100
  sigma: number;       // -3..3
  confidence: number;  // 0..1
}

const N = 2000;
const POPULATION: Candidate[] = (() => {
  const out: Candidate[] = [];
  const r = rng(hashSeed("risk-population"));
  for (let i = 0; i < N; i++) {
    const archIdx = (r() * ARCHETYPES.length) | 0;
    const archetype = ARCHETYPES[archIdx];
    // quorum — centred around 74% with tails
    const quorumPct = Math.max(40, Math.min(100, 74 + (r() * 2 - 1) * 18 + (r() < 0.05 ? (r() * 2 - 1) * 20 : 0)));
    // sigma — 0-centred normal-ish
    let sigma = 0;
    for (let k = 0; k < 4; k++) sigma += r() - 0.5;
    sigma = Math.max(-3, Math.min(3, sigma * 1.6));
    const confidence = Math.max(0, Math.min(1, 0.72 + (r() * 2 - 1) * 0.25));
    const kindRoll = r();
    const kind: Candidate["kind"] =
      archetype === "BlackSwan" && kindRoll < 0.22 ? "ESCALATE_TO_GUARDIAN" :
      kindRoll < 0.50 ? "BUY"  :
      kindRoll < 0.80 ? "SELL" :
      kindRoll < 0.95 ? "HOLD" :
                         "ESCALATE_TO_GUARDIAN";
    out.push({ id: i, archetype, kind, quorumPct, sigma, confidence });
  }
  return out;
})();

/* ─── Safety rails ───────────────────────────────────────────────────── */

interface Rails {
  minQuorumPct: number;        // stop 1 · consensus gate
  sigmaCapAbs: number;         // stop 1 · σ cap
  confidenceFloor: number;     // stop 2 · FSM validation
  circuitThreshold: number;    // stop 3 · circuit breaker (failures / 600s)
  multisigAvailable: number;   // stop 4 · how many of 5 signers online (3 required)
  rateLimitPerMin: number;     // stop 1 · rate limit on signal intake
}

const DEFAULTS: Rails = {
  minQuorumPct:      67,
  sigmaCapAbs:       1.5,
  confidenceFloor:   0.50,
  circuitThreshold:  2,
  multisigAvailable: 4,
  rateLimitPerMin:   6,
};

/* ─── Survivor computation ───────────────────────────────────────────── */

type StageKey = "raw" | "consensus" | "fsm" | "multisig" | "breaker";

interface StageResult {
  key: StageKey;
  label: string;
  color: string;
  description: string;
  survivors: Candidate[];
  reason: string;
}

function survivors(pop: Candidate[], rails: Rails): StageResult[] {
  // Stop 1 — consensus gate (quorum ≥ min, |σ| ≤ cap, rate-limit, drop HOLD)
  const consensusPassed = pop.filter(c => {
    if (c.kind === "HOLD") return false;
    if (c.quorumPct < rails.minQuorumPct) return false;
    if (Math.abs(c.sigma) > rails.sigmaCapAbs) return false;
    return true;
  });
  // Rate-limit: keep the first N per minute (deterministic order)
  const rateLimited = consensusPassed.slice(0, Math.round((rails.rateLimitPerMin * 60))); // effective cap per hour

  // Stop 2 — FSM validation (confidence floor; ESCALATE also passes)
  const fsmPassed = rateLimited.filter(c =>
    c.kind === "ESCALATE_TO_GUARDIAN" || c.confidence >= rails.confidenceFloor,
  );

  // Stop 3 — 3-of-5 multi-sig availability
  // If fewer than 3 signers are available, everything is blocked.
  const multisigPassed = rails.multisigAvailable >= 3
    ? fsmPassed
    : [];

  // Stop 4 — circuit breaker
  // Model: failures correlate loosely with low confidence + extreme σ.
  // If circuit-breaker "threshold" is 0, it's effectively off. If > threshold
  // failures have accumulated in the simulated 600s window, everything stops.
  const failures = multisigPassed.filter(c => c.confidence < 0.55 || Math.abs(c.sigma) > 2.2).length;
  const tripped = rails.circuitThreshold > 0 && failures > rails.circuitThreshold;
  const breakerPassed = tripped ? [] : multisigPassed;

  return [
    { key: "raw",       label: "candidates", color: "#64748b", description: "raw signals proposed this window", survivors: pop,               reason: "" },
    { key: "consensus", label: "consensus",  color: "#0284c7", description: `quorum ≥ ${rails.minQuorumPct}% · |σ| ≤ ${rails.sigmaCapAbs} · HOLD dropped`, survivors: rateLimited, reason: "" },
    { key: "fsm",       label: "FSM",        color: "#7c3aed", description: `confidence ≥ ${rails.confidenceFloor.toFixed(2)} at SIGNAL_VALIDATED`, survivors: fsmPassed, reason: "" },
    { key: "multisig",  label: "multi-sig",  color: "#db2777", description: `3-of-5 signers · currently ${rails.multisigAvailable} online`, survivors: multisigPassed, reason: rails.multisigAvailable < 3 ? "under quorum" : "" },
    { key: "breaker",   label: "breaker",    color: "#d97706", description: rails.circuitThreshold > 0 ? `< ${rails.circuitThreshold} simulated failures / 600s` : "breaker off", survivors: breakerPassed, reason: tripped ? "tripped" : "" },
  ];
}

/* ─── Page ───────────────────────────────────────────────────────────── */

export default function RiskPage() {
  const [r, setR] = useState<Rails>(DEFAULTS);
  const stages = useMemo(() => survivors(POPULATION, r), [r]);

  const archSurvivalByStage = useMemo(() => {
    return stages.map(stage => {
      const by: Record<Archetype, number> = {
        Speculator: 0, Arbitrageur: 0, Sovereign: 0, MarketMaker: 0, BlackSwan: 0,
      };
      for (const s of stage.survivors) by[s.archetype]++;
      return by;
    });
  }, [stages]);

  const totals = stages.map(s => s.survivors.length);
  const maxCount = POPULATION.length;

  return (
    <div className="space-y-10">
      <header className="space-y-3">
        <div className="flex items-center gap-2">
          <Link href="/" className="link text-xs">← dashboard</Link>
          <span className="chip-n">operator · what-if</span>
          <span className="chip">population {maxCount}</span>
        </div>
        <h1 className="heading">Risk simulator</h1>
        <p className="subheading">
          Adjust the four safety stops — consensus gate, FSM validation, 3-of-5 multi-sig, circuit breaker —
          and see how many of the {maxCount.toLocaleString()} candidate signals survive each stage.
          Useful for pre-rollout what-ifs on policy changes.
        </p>
      </header>

      {/* Control panel */}
      <section className="panel-lg grid gap-4 md:grid-cols-2">
        <Slider label="consensus · min quorum"  value={r.minQuorumPct}     min={50} max={100} step={1}   suffix="%" onChange={(v) => setR(p => ({ ...p, minQuorumPct: v }))} />
        <Slider label="consensus · σ cap"       value={r.sigmaCapAbs}      min={0}  max={3}   step={0.05}            onChange={(v) => setR(p => ({ ...p, sigmaCapAbs: Number(v.toFixed(2)) }))} />
        <Slider label="FSM · confidence floor"  value={r.confidenceFloor}  min={0}  max={1}   step={0.01}            onChange={(v) => setR(p => ({ ...p, confidenceFloor: Number(v.toFixed(2)) }))} />
        <Slider label="multi-sig · signers online" value={r.multisigAvailable} min={0} max={5} step={1}               onChange={(v) => setR(p => ({ ...p, multisigAvailable: v }))} markLabel="3 required" markValue={3} markRange={[0, 5]} />
        <Slider label="breaker · failure threshold" value={r.circuitThreshold}  min={0} max={8} step={1}               onChange={(v) => setR(p => ({ ...p, circuitThreshold: v }))} markLabel="0 = off" markValue={0} markRange={[0, 8]} />
        <Slider label="rate limit · signals/min"    value={r.rateLimitPerMin}  min={1} max={20} step={1}               onChange={(v) => setR(p => ({ ...p, rateLimitPerMin: v }))} />
        <div className="md:col-span-2">
          <button type="button" className="btn !py-1.5 !text-xs" onClick={() => setR(DEFAULTS)}>
            ↻ reset defaults
          </button>
        </div>
      </section>

      {/* Funnel */}
      <section className="panel-lg">
        <div className="mb-4 flex items-center justify-between">
          <h2 className="label">Survivor funnel</h2>
          <span className="text-[11px] text-muted">
            {totals[totals.length - 1].toLocaleString()} / {maxCount.toLocaleString()} survive · {((totals[totals.length - 1] / maxCount) * 100).toFixed(1)}%
          </span>
        </div>
        <ul className="space-y-3">
          {stages.map((s, i) => {
            const pct = (s.survivors.length / maxCount) * 100;
            const delta = i > 0 ? totals[i - 1] - totals[i] : null;
            return (
              <li key={s.key} className="group">
                <div className="flex items-center justify-between text-[11px]">
                  <div className="flex items-center gap-2">
                    <span
                      className="grid h-6 w-6 place-items-center rounded-md font-mono"
                      style={{ background: `${s.color}18`, color: s.color, border: `1px solid ${s.color}55` }}
                    >
                      {i}
                    </span>
                    <span className="font-mono text-text">{s.label}</span>
                    {s.reason && <span className="chip-b">{s.reason}</span>}
                  </div>
                  <span className="font-mono text-muted">
                    {s.survivors.length.toLocaleString()}
                    {delta !== null && <span className="ml-2 text-bad">{delta > 0 ? `−${delta.toLocaleString()}` : ""}</span>}
                    {delta !== null && delta === 0 && <span className="ml-2 text-good">no loss</span>}
                  </span>
                </div>
                <div className="mt-1 h-6 w-full overflow-hidden rounded-md border border-border bg-white/60">
                  <div
                    className="h-full transition-all duration-500 ease-silk"
                    style={{ width: `${pct}%`, background: `linear-gradient(90deg, ${s.color}aa, ${s.color}44)` }}
                  />
                </div>
                <p className="mt-1 text-[11px] text-muted">{s.description}</p>
              </li>
            );
          })}
        </ul>
      </section>

      {/* By-archetype breakdown */}
      <section className="panel-lg">
        <h2 className="label mb-3">Survival by archetype</h2>
        <div className="overflow-x-auto">
          <table className="min-w-full text-left text-[11px]">
            <thead className="text-muted">
              <tr className="border-b border-border">
                <th className="py-2 pr-3 font-mono">archetype</th>
                {stages.map(s => <th key={s.key} className="py-2 pr-3 text-right font-mono">{s.label}</th>)}
                <th className="py-2 pr-0 text-right font-mono">exec rate</th>
              </tr>
            </thead>
            <tbody className="font-mono">
              {ARCHETYPES.map(a => {
                const start = archSurvivalByStage[0][a];
                const end = archSurvivalByStage[archSurvivalByStage.length - 1][a];
                const pct = start > 0 ? (end / start) * 100 : 0;
                return (
                  <tr key={a} className="border-b border-border/60">
                    <td className="py-2 pr-3 text-text">{a}</td>
                    {archSurvivalByStage.map((m, i) => (
                      <td key={i} className="py-2 pr-3 text-right text-muted">{m[a]}</td>
                    ))}
                    <td className={"py-2 pr-0 text-right " + (pct >= 40 ? "text-good" : pct >= 15 ? "text-warn" : "text-bad")}>
                      {pct.toFixed(1)}%
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </section>

      {/* Notes */}
      <p className="text-[11px] text-muted">
        The population is deterministic (same seed every render) so the simulator responds to your inputs alone.
        The breaker stage trips all-or-nothing; tune the threshold to see the cliff.
      </p>
    </div>
  );
}

/* ─── Shared UI ──────────────────────────────────────────────────────── */

function Slider({
  label, value, min, max, step = 1, suffix = "",
  onChange, markLabel, markValue, markRange,
}: {
  label: string;
  value: number;
  min: number;
  max: number;
  step?: number;
  suffix?: string;
  onChange: (v: number) => void;
  markLabel?: string;
  markValue?: number;
  markRange?: [number, number];
}) {
  const markPct =
    markValue !== undefined && markRange
      ? ((markValue - markRange[0]) / (markRange[1] - markRange[0])) * 100
      : null;
  return (
    <label className="block">
      <div className="flex items-center justify-between">
        <span className="label">{label}</span>
        <span className="font-mono text-[11px] text-text">
          {value.toFixed(step < 1 ? 2 : 0)}{suffix}
        </span>
      </div>
      <div className="relative mt-2">
        <input
          type="range"
          min={min}
          max={max}
          step={step}
          value={value}
          onChange={(e) => onChange(Number(e.target.value))}
          className="h-1 w-full cursor-pointer appearance-none rounded-full bg-border accent-accent"
        />
        {markPct !== null && (
          <div
            className="pointer-events-none absolute top-1/2 h-3 w-px -translate-y-1/2 bg-bad/80"
            style={{ left: `${markPct}%` }}
            title={markLabel}
          />
        )}
      </div>
      {markLabel && <p className="mt-1 text-[10px] text-muted">{markLabel}</p>}
    </label>
  );
}
