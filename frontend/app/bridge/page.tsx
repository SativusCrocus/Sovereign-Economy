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
    <div className="space-y-6">
      <header className="space-y-1.5">
        <h1 className="heading">Bridge</h1>
        <p className="text-sm text-muted">
          Inspect swarm-signal state through the 8-state FSM. Stage a validated signal for 3-of-5 multi-sig
          execution — subject to the 86 400 s timelock.
        </p>
      </header>

      <section className="panel-lg">
        <h2 className="label mb-3">FSM state machine</h2>
        <ol className="flex flex-wrap items-center gap-1.5 text-[11px]">
          {FSM_STATES.map((s, i) => {
            const active = i === stateIdx;
            return (
              <li key={s} className="flex items-center gap-1.5">
                <span
                  className={
                    "rounded-md border px-2 py-1 font-mono tracking-wider transition " +
                    (active
                      ? "border-accent bg-accent/10 text-accent shadow-glow"
                      : "border-border text-muted")
                  }
                >
                  <span className="mr-1.5 text-[10px] opacity-60">{i}</span>
                  {s}
                </span>
                {i < FSM_STATES.length - 1 && <span className="text-border">›</span>}
              </li>
            );
          })}
        </ol>
      </section>

      <section className="panel space-y-4">
        <h2 className="label">Signal probe</h2>
        <label className="block">
          <span className="label">signalText · keccak-hashed client-side</span>
          <input className="input mt-1.5" value={signalText} onChange={(e) => setSignalText(e.target.value)} />
        </label>
        <div className="grid gap-2 md:grid-cols-2">
          <div className="kv"><span className="label">signalId</span><code className="ml-2 truncate text-accent" title={signalId}>{signalId}</code></div>
          <div className="kv"><span className="label">FSM state</span><span className={stateIdx >= 0 ? "chip-n" : "chip"}>{fsmLabel}</span></div>
        </div>
        <p className="text-xs text-muted">
          Signal kinds:{" "}
          {SIGNAL_KINDS.map((k, i) => (
            <code key={k} className="mr-2 text-accent">{i}={k}</code>
          ))}
        </p>
        {!bridge && (
          <div className="rounded-md border border-warn/40 bg-warn/5 p-3 text-xs text-warn">
            bridgeExecutor address for chain {chainId} not set — edit <code>frontend/lib/config.ts</code> after running <code>contracts/scripts/deploy-local.ts</code>.
          </div>
        )}
      </section>

      <section className="panel space-y-3">
        <h2 className="label">Operator actions</h2>
        <div className="flex flex-wrap items-center gap-2">
          <button className="btn-p" disabled={!isConnected || !bridge || isPending} onClick={stageForMultiSig}>
            {isPending ? "Staging…" : "stageForMultiSig"}
          </button>
          <a className="btn" href="/accounts">Agent accounts →</a>
        </div>
        {!isConnected && <p className="text-xs text-warn">Connect a wallet with the operator role.</p>}
      </section>

      <section className="panel-lg">
        <h2 className="label mb-3">Safety rails · four independent stops</h2>
        <div className="grid gap-3 md:grid-cols-2">
          {[
            { t: "Consensus gate",       d: "≥67% quorum within ±1.5σ of median · rate-limited to 6 signals/min" },
            { t: "Bridge FSM",           d: "Rejects malformed signals at SIGNAL_VALIDATED · 3600 s guardian timeout" },
            { t: "3-of-5 multi-sig",     d: "{AgentClassA · AgentClassB · HumanGuardian · TimeLock86400 · DAOSnapshot}" },
            { t: "Circuit breaker",      d: ">2 failures in 600 s auto-pauses · reset only by Guardian or DAO vote" },
          ].map((s, i) => (
            <div key={s.t} className="rounded-lg border border-border bg-bg/40 p-3">
              <div className="flex items-center gap-2">
                <span className="chip-n">{i + 1}</span>
                <span className="text-sm font-semibold text-text">{s.t}</span>
              </div>
              <p className="mt-1.5 text-xs text-muted">{s.d}</p>
            </div>
          ))}
        </div>
        <p className="mt-4 text-xs text-muted">
          Governor at <code className="text-accent">{governor ?? "unset"}</code>. The 86 400 s timelock alone means no action ships sooner than 24 h.
        </p>
      </section>
    </div>
  );
}
