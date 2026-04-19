// frontend/app/bridge/sim/page.tsx
// Pure client-side FSM simulator. Operators tweak quorum / σ / signal kind
// / guardian-timeout and see exactly which FSM states would fire and which
// safety rails would veto.
"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { FSM_STATES, SIGNAL_KINDS } from "@/lib/config";

type FsmStep = {
  state: (typeof FSM_STATES)[number];
  ok: boolean;
  note: string;
};

type SimOutcome = {
  trail: FsmStep[];
  terminal: (typeof FSM_STATES)[number];
  outcome: "EXECUTED" | "REJECTED" | "GUARDIAN_TIMEOUT";
  rejectedAt?: (typeof FSM_STATES)[number];
  reason?: string;
};

interface Params {
  kind: (typeof SIGNAL_KINDS)[number];
  quorumPct: number;           // 50..100
  sigma: number;               // -3..3
  confidence: number;          // 0..1
  circuitBreakerTripped: boolean;
  guardianTimeoutSec: number;  // 3600 default
  simulateTimeout: boolean;
  simulateGuardian: boolean;
  minQuorumPct: number;        // required quorum
  sigmaCapAbs: number;         // |sigma| ≤ cap
}

const DEFAULTS: Params = {
  kind: "BUY",
  quorumPct: 72,
  sigma: 0.4,
  confidence: 0.82,
  circuitBreakerTripped: false,
  guardianTimeoutSec: 3600,
  simulateTimeout: false,
  simulateGuardian: false,
  minQuorumPct: 67,
  sigmaCapAbs: 1.5,
};

function simulate(p: Params): SimOutcome {
  const trail: FsmStep[] = [];
  const reject = (state: (typeof FSM_STATES)[number], reason: string): SimOutcome => {
    trail.push({ state: "REJECTED", ok: false, note: reason });
    return { trail, terminal: "REJECTED", outcome: "REJECTED", rejectedAt: state, reason };
  };

  trail.push({ state: "IDLE", ok: true, note: "ready" });

  // Receive
  if (p.circuitBreakerTripped) {
    return reject("IDLE", "circuit breaker is tripped — no new signals accepted");
  }
  trail.push({ state: "SWARM_SIGNAL_RECEIVED", ok: true, note: `kind=${p.kind}` });

  // Validate
  if (p.confidence < 0.5) return reject("SWARM_SIGNAL_RECEIVED", `confidence ${p.confidence.toFixed(2)} below 0.50`);
  if (p.kind === "ESCALATE_TO_GUARDIAN") {
    // ESCALATE bypasses threshold + multisig and goes straight to guardian
    trail.push({ state: "SIGNAL_VALIDATED", ok: true, note: "ESCALATE — routed to guardian" });
    trail.push({ state: "GUARDIAN_TIMEOUT", ok: !p.simulateTimeout, note: p.simulateTimeout ? "no guardian response" : "guardian handled" });
    if (p.simulateTimeout) {
      return { trail, terminal: "GUARDIAN_TIMEOUT", outcome: "GUARDIAN_TIMEOUT", reason: `guardian > ${p.guardianTimeoutSec}s` };
    }
    trail.push({ state: "EXECUTED", ok: true, note: "guardian-approved execute" });
    return { trail, terminal: "EXECUTED", outcome: "EXECUTED" };
  }
  trail.push({ state: "SIGNAL_VALIDATED", ok: true, note: `confidence ${p.confidence.toFixed(2)}` });

  // Threshold check
  if (p.quorumPct < p.minQuorumPct)
    return reject("SIGNAL_VALIDATED", `quorum ${p.quorumPct}% below required ${p.minQuorumPct}%`);
  if (Math.abs(p.sigma) > p.sigmaCapAbs)
    return reject("SIGNAL_VALIDATED", `|σ|=${Math.abs(p.sigma).toFixed(2)} exceeds cap ${p.sigmaCapAbs}`);
  trail.push({ state: "THRESHOLD_CHECK", ok: true, note: `q=${p.quorumPct}% · σ=${p.sigma.toFixed(2)}` });

  if (p.kind === "HOLD") {
    return reject("THRESHOLD_CHECK", "HOLD — nothing to stage");
  }

  // Multi-sig
  trail.push({ state: "MULTI_SIG_STAGED", ok: true, note: "3-of-5 staged · AgentA · AgentB · …" });

  if (p.simulateGuardian) {
    trail.push({ state: "GUARDIAN_TIMEOUT", ok: !p.simulateTimeout, note: p.simulateTimeout ? "no guardian response" : "guardian handled" });
    if (p.simulateTimeout) {
      return { trail, terminal: "GUARDIAN_TIMEOUT", outcome: "GUARDIAN_TIMEOUT", reason: `guardian > ${p.guardianTimeoutSec}s` };
    }
  }

  trail.push({ state: "EXECUTED", ok: true, note: "multisig cleared · executed" });
  return { trail, terminal: "EXECUTED", outcome: "EXECUTED" };
}

function OutcomeBadge({ outcome }: { outcome: SimOutcome["outcome"] }) {
  const cls =
    outcome === "EXECUTED" ? "chip-ok" :
    outcome === "REJECTED" ? "chip-b" :
                             "chip-w";
  return <span className={cls}>{outcome.replace(/_/g, " ").toLowerCase()}</span>;
}

export default function FsmSimPage() {
  const [p, setP] = useState<Params>(DEFAULTS);
  const sim = useMemo(() => simulate(p), [p]);

  function update<K extends keyof Params>(key: K, value: Params[K]) {
    setP(prev => ({ ...prev, [key]: value }));
  }

  const reachedIndex = useMemo(() => {
    // Highest FSM state index reached by the trail (useful for drawing the flow).
    const ordered = sim.trail
      .map(s => FSM_STATES.indexOf(s.state))
      .filter(i => i >= 0);
    return ordered.length ? Math.max(...ordered) : 0;
  }, [sim]);

  return (
    <div className="space-y-10">
      <header className="space-y-3">
        <Link href="/bridge" className="link text-xs">← bridge</Link>
        <div className="flex items-center gap-2">
          <span className="chip-n">operator · what-if</span>
          <span className="chip">client-side</span>
        </div>
        <h1 className="heading">FSM simulator</h1>
        <p className="subheading">
          Tweak the four safety-rail thresholds — quorum floor, σ-cap, confidence, guardian timeout — and
          see exactly which FSM states a signal would traverse and which rail (if any) would veto it.
          No on-chain calls; purely a mental model for onboarding.
        </p>
      </header>

      {/* FSM flow, reused from /bridge */}
      <section className="panel-lg">
        <div className="mb-3 flex items-center justify-between">
          <h2 className="label">Simulated flow</h2>
          <div className="flex items-center gap-2">
            <OutcomeBadge outcome={sim.outcome} />
          </div>
        </div>
        <div className="relative">
          <div
            className="absolute left-2 right-2 top-[18px] h-px bg-gradient-to-r from-border via-accent/40 to-border"
            aria-hidden
          />
          <ol className="relative grid grid-cols-4 gap-3 md:grid-cols-8">
            {FSM_STATES.map((s, i) => {
              const touched = sim.trail.some(t => t.state === s);
              const isTerminal = sim.terminal === s;
              return (
                <li key={s} className="flex flex-col items-center gap-2 text-center">
                  <div
                    className={
                      "grid h-9 w-9 place-items-center rounded-xl border text-[11px] font-mono transition-all duration-300 ease-silk " +
                      (isTerminal
                        ? (sim.outcome === "EXECUTED" ? "border-good bg-good/20 text-good shadow-glow" :
                           sim.outcome === "REJECTED" ? "border-bad bg-bad/20 text-bad shadow-glow" :
                                                        "border-warn bg-warn/20 text-warn shadow-glow")
                        : touched ? "border-accent bg-accent/10 text-accent"
                        : i <= reachedIndex ? "border-iris/40 bg-iris/5 text-iris"
                        : "border-border bg-white/60 text-subtle")
                    }
                  >
                    {i}
                  </div>
                  <span className={"text-[10px] font-mono uppercase leading-tight " + (touched || isTerminal ? "text-text" : "text-muted")}>
                    {s.replace(/_/g, " ")}
                  </span>
                </li>
              );
            })}
          </ol>
        </div>
      </section>

      {/* Controls + trail */}
      <section className="grid gap-4 md:grid-cols-[1fr_1fr]">
        <div className="panel-lg space-y-4">
          <h2 className="label">Inputs</h2>

          <label className="block">
            <span className="label">signal kind</span>
            <div className="mt-1.5 flex flex-wrap gap-1">
              {SIGNAL_KINDS.map(k => (
                <button
                  key={k}
                  type="button"
                  onClick={() => update("kind", k)}
                  className={
                    "rounded-md border px-2.5 py-1 text-[11px] font-mono transition-colors " +
                    (p.kind === k
                      ? "border-accent/60 bg-accent/10 text-accent"
                      : "border-border bg-white/80 text-muted hover:text-text")
                  }
                >
                  {k}
                </button>
              ))}
            </div>
          </label>

          <Slider
            label="quorum"
            value={p.quorumPct}
            min={50} max={100} step={1}
            suffix="%"
            onChange={(v) => update("quorumPct", v)}
            markLabel={`floor ${p.minQuorumPct}%`}
            markValue={p.minQuorumPct}
            markRange={[50, 100]}
          />
          <Slider
            label="σ (sigma)"
            value={p.sigma}
            min={-3} max={3} step={0.05}
            onChange={(v) => update("sigma", Number(v.toFixed(2)))}
            markLabel={`cap ±${p.sigmaCapAbs}`}
            markValue={p.sigmaCapAbs}
            markRange={[-3, 3]}
          />
          <Slider
            label="confidence"
            value={p.confidence}
            min={0} max={1} step={0.01}
            onChange={(v) => update("confidence", Number(v.toFixed(2)))}
            markLabel="floor 0.50"
            markValue={0.5}
            markRange={[0, 1]}
          />

          <div className="grid gap-3 md:grid-cols-2">
            <label className="block">
              <span className="label">min quorum (rail)</span>
              <input
                type="number"
                className="input mt-1.5"
                value={p.minQuorumPct}
                min={50} max={100}
                onChange={(e) => update("minQuorumPct", Number(e.target.value))}
              />
            </label>
            <label className="block">
              <span className="label">σ cap (rail)</span>
              <input
                type="number"
                className="input mt-1.5"
                step="0.1"
                value={p.sigmaCapAbs}
                min={0} max={5}
                onChange={(e) => update("sigmaCapAbs", Number(e.target.value))}
              />
            </label>
            <label className="block">
              <span className="label">guardian timeout</span>
              <input
                type="number"
                className="input mt-1.5"
                value={p.guardianTimeoutSec}
                min={60} max={86400}
                onChange={(e) => update("guardianTimeoutSec", Number(e.target.value))}
              />
            </label>
            <label className="block">
              <span className="label">controls</span>
              <div className="mt-1.5 flex flex-col gap-2">
                <ToggleRow
                  label="circuit breaker tripped"
                  checked={p.circuitBreakerTripped}
                  onChange={(v) => update("circuitBreakerTripped", v)}
                />
                <ToggleRow
                  label="route via guardian"
                  checked={p.simulateGuardian}
                  onChange={(v) => update("simulateGuardian", v)}
                />
                <ToggleRow
                  label="simulate guardian timeout"
                  checked={p.simulateTimeout}
                  onChange={(v) => update("simulateTimeout", v)}
                />
              </div>
            </label>
          </div>

          <button
            type="button"
            className="btn !py-1.5 !text-xs"
            onClick={() => setP(DEFAULTS)}
          >
            ↻ reset defaults
          </button>
        </div>

        <div className="panel-lg space-y-3">
          <h2 className="label">Trail</h2>
          <ol className="space-y-2">
            {sim.trail.map((step, i) => (
              <li key={i} className="flex items-start gap-3 rounded-lg border border-border bg-white/70 p-2.5">
                <span
                  className={
                    "mt-0.5 grid h-6 w-6 shrink-0 place-items-center rounded-md border text-[10px] font-mono " +
                    (step.ok
                      ? "border-accent/40 bg-accent/10 text-accent"
                      : "border-bad/40 bg-bad/10 text-bad")
                  }
                >
                  {i + 1}
                </span>
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <span className="font-mono text-[12px] text-text">{step.state.replace(/_/g, " ")}</span>
                    <span className={step.ok ? "chip-ok" : "chip-b"}>{step.ok ? "ok" : "blocked"}</span>
                  </div>
                  <p className="text-[11px] text-muted">{step.note}</p>
                </div>
              </li>
            ))}
          </ol>
          {sim.outcome === "REJECTED" && (
            <div className="rounded-lg border border-bad/30 bg-bad/10 p-3 text-[11px] text-bad">
              <span className="font-semibold">Rejected at {sim.rejectedAt?.replace(/_/g, " ")}:</span> {sim.reason}
            </div>
          )}
          {sim.outcome === "GUARDIAN_TIMEOUT" && (
            <div className="rounded-lg border border-warn/30 bg-warn/10 p-3 text-[11px] text-warn">
              Guardian did not respond within {p.guardianTimeoutSec}s — signal parked for manual review.
            </div>
          )}
          {sim.outcome === "EXECUTED" && (
            <div className="rounded-lg border border-good/30 bg-good/10 p-3 text-[11px] text-good">
              All four safety rails cleared — this signal would execute on-chain, subject to the 86 400 s timelock.
            </div>
          )}
        </div>
      </section>

      {/* Safety rail cheat-sheet */}
      <section className="panel-lg">
        <h2 className="label mb-3">Safety rails · cheat-sheet</h2>
        <ul className="grid gap-2 text-[11px] md:grid-cols-2">
          <li className="kv"><span className="label">consensus gate</span><span className="ml-2 text-text">quorum ≥ {p.minQuorumPct}% · |σ| ≤ {p.sigmaCapAbs}</span></li>
          <li className="kv"><span className="label">FSM</span><span className="ml-2 text-text">malformed signals rejected at SIGNAL_VALIDATED</span></li>
          <li className="kv"><span className="label">multi-sig</span><span className="ml-2 text-text">3 of 5 · AgentA · AgentB · HumanGuardian · TimeLock86400 · DAOSnapshot</span></li>
          <li className="kv"><span className="label">circuit breaker</span><span className="ml-2 text-text">2+ failures in 600s auto-pauses</span></li>
        </ul>
      </section>
    </div>
  );
}

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

function ToggleRow({
  label, checked, onChange,
}: {
  label: string;
  checked: boolean;
  onChange: (v: boolean) => void;
}) {
  return (
    <label className="flex cursor-pointer items-center justify-between gap-2 text-[11px]">
      <span className="text-muted">{label}</span>
      <span
        role="switch"
        aria-checked={checked}
        tabIndex={0}
        className={`switch ${checked ? "switch-on" : ""}`}
        onClick={() => onChange(!checked)}
        onKeyDown={(e) => (e.key === " " || e.key === "Enter") && onChange(!checked)}
      >
        <span
          className="switch-dot"
          style={{ transform: checked ? "translateX(16px)" : "translateX(0)" }}
        />
      </span>
    </label>
  );
}
