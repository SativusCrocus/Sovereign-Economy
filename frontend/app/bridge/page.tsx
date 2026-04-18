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
  const fsmLabel = typeof state === "number" ? FSM_STATES[state] ?? `unknown(${state})` : "—";

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
    <div className="space-y-4">
      <h1 className="text-2xl font-bold tracking-tight">Bridge</h1>

      <section className="panel space-y-3">
        <h2 className="label">Signal probe</h2>
        <label className="block text-xs text-muted">signalText (keccak-hashed client-side)</label>
        <input className="input" value={signalText} onChange={(e) => setSignalText(e.target.value)} />
        <div className="flex items-center gap-3">
          <span className="text-xs text-muted">signalId:</span>
          <code className="truncate text-xs text-accent" title={signalId}>{signalId}</code>
        </div>
        <div className="flex items-center gap-3">
          <span className="text-xs text-muted">FSM state:</span>
          <span className="chip">{fsmLabel}</span>
        </div>
        <p className="text-xs text-muted">Signal kinds enum: {SIGNAL_KINDS.map((k, i) => `${i}=${k}`).join(" · ")}</p>
        {!bridge && <p className="text-warn text-xs">bridgeExecutor address for chain {chainId} not set — edit lib/config.ts after deploy-local.ts.</p>}
      </section>

      <section className="panel space-y-3">
        <h2 className="label">Operator actions</h2>
        <div className="flex flex-wrap items-center gap-2">
          <button className="btn-p" disabled={!isConnected || !bridge || isPending} onClick={stageForMultiSig}>
            stageForMultiSig
          </button>
          <a className="btn" href="/accounts">account actions →</a>
        </div>
        {!isConnected && <p className="text-warn text-xs">Connect a wallet with the operator role.</p>}
      </section>

      <section className="panel text-xs text-muted space-y-2">
        <p>Governor at <code className="text-accent">{governor ?? "unset"}</code>. Multi-sig signing + timelocked execution happen here.</p>
        <p>FSM safety rails: quorum ≥ 67%, ±1.5σ band, 3-of-5 signatures, 86400s timelock, 3600s guardian timeout, circuit-breaker &gt;2 failures per 600s.</p>
      </section>
    </div>
  );
}
