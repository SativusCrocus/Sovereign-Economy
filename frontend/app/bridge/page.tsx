// frontend/app/bridge/page.tsx
"use client";
import { useState } from "react";
import { useAccount, useChainId, useReadContract, useWriteContract } from "wagmi";
import { keccak256, toBytes, type Abi, type Address } from "viem";
import { ABIS } from "@/lib/contracts";
import { ADDRESSES, FSM_STATES, SIGNAL_KINDS } from "@/lib/config";

export default function BridgePage() {
  const { isConnected } = useAccount();
  const chainId = useChainId();
  const addrs = ADDRESSES[chainId] ?? {};
  const bridge = addrs.bridgeExecutor as Address | undefined;
  const governor = addrs.governor as Address | undefined;

  const [signalText, setSignalText] = useState("BUY/ETH-USD/2026-04-18");
  const signalId = keccak256(toBytes(signalText));

  const { data: state } = useReadContract({
    address: bridge,
    abi: ABIS.bridge as Abi,
    functionName: "stateOf",
    args: [signalId],
    query: { enabled: Boolean(bridge) },
  });
  const stateIdx = typeof state === "number" ? state : -1;
  const fsmLabel = stateIdx >= 0 ? FSM_STATES[stateIdx] ?? `unknown(${state})` : "—";

  const { writeContractAsync, isPending } = useWriteContract();

  async function stageForMultiSig() {
    if (!bridge) throw new Error("bridgeExecutor address not configured");
    await writeContractAsync({
      address: bridge,
      abi: ABIS.bridge as Abi,
      functionName: "stageForMultiSig",
      args: [signalId, signalId],
    });
  }

  return (
    <div className="space-y-10">
      <header className="space-y-3">
        <div className="flex items-center gap-2">
          <span className="chip-n">layer 3 · settlement</span>
          <span className="chip">chain {chainId}</span>
        </div>
        <h1 className="heading">Bridge</h1>
        <p className="subheading">
          Inspect swarm-signal state through the 8-state FSM. Stage a validated signal for 3-of-5 multi-sig —
          subject to the 86 400 s timelock.
        </p>
      </header>

      {/* FSM flow */}
      <section className="panel-lg">
        <div className="mb-4 flex items-center justify-between">
          <h2 className="label">FSM state machine</h2>
          <span className={stateIdx >= 0 ? "chip-n pulse-dot text-good" : "chip"}>
            current · {fsmLabel}
          </span>
        </div>

        {/* flowing connector + stops */}
        <div className="relative">
          <div
            className="absolute left-2 right-2 top-1/2 h-px -translate-y-1/2 bg-gradient-to-r from-border via-accent/40 to-border"
            aria-hidden
          />
          <ol className="relative grid grid-cols-4 gap-3 md:grid-cols-8">
            {FSM_STATES.map((s, i) => {
              const active = i === stateIdx;
              const past = stateIdx >= 0 && i < stateIdx;
              return (
                <li key={s} className="flex flex-col items-center gap-2 text-center">
                  <div
                    className={
                      "grid h-9 w-9 place-items-center rounded-xl border text-[11px] font-mono transition-all duration-500 ease-silk " +
                      (active
                        ? "border-accent bg-accent/20 text-accent shadow-glow scale-110"
                        : past
                        ? "border-iris/40 bg-iris/10 text-iris"
                        : "border-border bg-panel/60 text-subtle")
                    }
                  >
                    {i}
                  </div>
                  <span
                    className={
                      "text-[10px] font-mono uppercase tracking-wider leading-tight " +
                      (active ? "text-accent" : past ? "text-iris/80" : "text-muted")
                    }
                  >
                    {s.replace(/_/g, " ")}
                  </span>
                </li>
              );
            })}
          </ol>
        </div>
      </section>

      {/* Signal probe */}
      <section className="panel-lg space-y-4">
        <h2 className="label">Signal probe</h2>
        <label className="block">
          <span className="label">signal text · keccak-hashed client-side</span>
          <input className="input mt-1.5" value={signalText} onChange={(e) => setSignalText(e.target.value)} />
        </label>
        <div className="grid gap-2 md:grid-cols-2">
          <div className="kv"><span className="label">signalId</span><code className="ml-2 truncate text-accent" title={signalId}>{signalId}</code></div>
          <div className="kv"><span className="label">FSM state</span><span className={stateIdx >= 0 ? "chip-n" : "chip"}>{fsmLabel}</span></div>
        </div>
        <div className="flex flex-wrap items-center gap-2 text-xs text-muted">
          <span className="label">signal kinds</span>
          {SIGNAL_KINDS.map((k, i) => (
            <code key={k} className="rounded-md border border-border bg-bg/40 px-2 py-0.5 text-accent">{i}={k}</code>
          ))}
        </div>
        {!bridge && (
          <div className="rounded-lg border border-warn/40 bg-warn/10 p-3 text-xs text-warn">
            bridgeExecutor address for chain {chainId} not set — edit <code>frontend/lib/config.ts</code> after running
            {" "}<code>contracts/scripts/deploy-local.ts</code>.
          </div>
        )}
      </section>

      {/* Operator actions */}
      <section className="panel-lg space-y-4">
        <h2 className="label">Operator actions</h2>
        <div className="flex flex-wrap items-center gap-3">
          <button
            className="btn-p sheen"
            disabled={!isConnected || !bridge || isPending}
            onClick={stageForMultiSig}
          >
            {isPending ? "Staging…" : "stageForMultiSig"}
          </button>
          <a className="btn" href="/accounts">Agent accounts →</a>
        </div>
        {!isConnected && <p className="text-xs text-warn">Connect a wallet with the operator role.</p>}
      </section>

      {/* Safety rails */}
      <section className="panel-lg">
        <h2 className="label mb-4">Safety rails · four independent stops</h2>
        <div className="grid gap-3 md:grid-cols-2">
          {[
            { t: "Consensus gate",   c: "accent",  d: "≥67% quorum within ±1.5σ of median · rate-limited to 6 signals/min" },
            { t: "Bridge FSM",       c: "iris",    d: "Rejects malformed signals at SIGNAL_VALIDATED · 3600 s guardian timeout" },
            { t: "3-of-5 multi-sig", c: "magenta", d: "{AgentClassA · AgentClassB · HumanGuardian · TimeLock86400 · DAOSnapshot}" },
            { t: "Circuit breaker",  c: "amber",   d: ">2 failures in 600 s auto-pauses · reset only by Guardian or DAO vote" },
          ].map((s, i) => (
            <div key={s.t} className="relative overflow-hidden rounded-xl border border-border bg-panel/60 p-4 tile-hover">
              <div
                className="pointer-events-none absolute -right-10 -top-10 h-28 w-28 rounded-full opacity-40 blur-2xl"
                style={{
                  background:
                    s.c === "accent"  ? "radial-gradient(circle, rgba(56,189,248,0.5), transparent 70%)"  :
                    s.c === "iris"    ? "radial-gradient(circle, rgba(167,139,250,0.5), transparent 70%)" :
                    s.c === "magenta" ? "radial-gradient(circle, rgba(244,114,182,0.5), transparent 70%)" :
                                        "radial-gradient(circle, rgba(251,191,36,0.5), transparent 70%)",
                }}
                aria-hidden
              />
              <div className="relative">
                <div className="flex items-center gap-2">
                  <span className={
                    s.c === "accent"  ? "chip-n" :
                    s.c === "iris"    ? "chip-i" :
                    s.c === "magenta" ? "chip border-magenta/40 text-magenta bg-magenta/10" :
                                        "chip-w"
                  }>stop {i + 1}</span>
                  <span className="text-sm font-semibold tracking-tight text-text">{s.t}</span>
                </div>
                <p className="mt-2 text-xs leading-relaxed text-muted">{s.d}</p>
              </div>
            </div>
          ))}
        </div>
        <p className="mt-5 text-xs text-muted">
          Governor at <code className="text-accent">{governor ?? "unset"}</code>. The 86 400 s timelock alone means no action ships sooner than 24 h.
        </p>
      </section>
    </div>
  );
}
