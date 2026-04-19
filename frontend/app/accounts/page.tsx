// frontend/app/accounts/page.tsx
"use client";
import { useState } from "react";
import { useAccount, useChainId } from "wagmi";
import { callTool } from "@/lib/mcp";
import { ARCHETYPES, ENTRYPOINT_V07, LZ_EID } from "@/lib/config";

interface WalletSignResult {
  user_op_hash: string;
  signed_user_op: Record<string, unknown>;
  signer_address: string;
  bundler_tx_hash: string | null;
  entrypoint: string;
  chain_id: number;
}

export default function AccountsPage() {
  const { isConnected, address } = useAccount();
  const chainId = useChainId();
  const [archetype, setArchetype] = useState(0);
  const [target, setTarget] = useState<string>("");
  const [value, setValue]   = useState<string>("0");
  const [callData, setCallData] = useState<string>("0x");
  const [result, setResult] = useState<WalletSignResult | null>(null);
  const [err, setErr]       = useState<string | null>(null);
  const [busy, setBusy]     = useState(false);

  async function submit() {
    setBusy(true); setErr(null); setResult(null);
    try {
      const res = await callTool<{ ok: boolean; result?: WalletSignResult; tool?: string }>(
        "wallet_sign_transaction",
        {
          agent_id: `agent-${ARCHETYPES[archetype].name}-0000`,
          chain_id: chainId,
          user_op: {
            sender:             address ?? "0x0000000000000000000000000000000000000000",
            nonce:              "0x0",
            initCode:           "0x",
            callData,
            accountGasLimits:   "0x0000000000000000000000000001388800000000000000000000000000013888", // 80k/80k
            preVerificationGas: "0x5208",
            gasFees:            "0x00000000000000000000000077359400000000000000000000000000059682f0", // 2 gwei / 100 gwei
            paymasterAndData:   "0x",
            signature:          "0x",
          },
        },
      );
      if (!res.result) throw new Error("missing result");
      setResult(res.result);
    } catch (e) { setErr((e as Error).message); }
    finally { setBusy(false); }
  }

  const eid = LZ_EID[chainId as keyof typeof LZ_EID];

  return (
    <div className="space-y-6">
      <header className="space-y-1.5">
        <h1 className="heading">Agent accounts</h1>
        <p className="text-sm text-muted">
          Sign ERC-4337 v0.7 UserOperations as a swarm archetype and submit via the Pimlico bundler.
          Keys are provisioned per archetype — in production, via HSM.
        </p>
      </header>

      <section className="grid gap-3 md:grid-cols-3">
        <div className="panel">
          <div className="label">EntryPoint · v0.7</div>
          <code className="mt-1 block break-all text-[11px] text-accent">{ENTRYPOINT_V07}</code>
        </div>
        <div className="panel">
          <div className="label">Chain</div>
          <div className="mt-1 text-sm font-semibold text-text">chain-id {chainId}</div>
          <div className="text-xs text-muted">LayerZero eid · {eid ?? "—"}</div>
        </div>
        <div className="panel">
          <div className="label">Connected wallet</div>
          <code className="mt-1 block break-all text-[11px] text-accent">{address ?? "—"}</code>
        </div>
      </section>

      <section className="panel-lg space-y-4">
        <h2 className="label">Sign + bundler-submit a UserOp</h2>
        <div className="grid gap-3 md:grid-cols-2">
          <label className="block">
            <span className="label">Archetype</span>
            <select className="input mt-1.5" value={archetype} onChange={e => setArchetype(Number(e.target.value))}>
              {ARCHETYPES.map(a => <option key={a.id} value={a.id}>{a.name}</option>)}
            </select>
          </label>
          <label className="block">
            <span className="label">Sender</span>
            <input className="input mt-1.5" readOnly value={address ?? "—"} />
          </label>
          <label className="md:col-span-2 block">
            <span className="label">Target · execute.target</span>
            <input className="input mt-1.5" value={target} onChange={e => setTarget(e.target.value)} placeholder="0x…" />
          </label>
          <label className="block">
            <span className="label">Value · wei</span>
            <input className="input mt-1.5" value={value} onChange={e => setValue(e.target.value)} />
          </label>
          <label className="block">
            <span className="label">callData</span>
            <input className="input mt-1.5" value={callData} onChange={e => setCallData(e.target.value)} />
          </label>
        </div>
        <div className="flex items-center gap-3 pt-1">
          <button className="btn-p" disabled={!isConnected || busy} onClick={submit}>
            {busy ? "Signing…" : "Sign + submit via Pimlico"}
          </button>
          {!isConnected && <span className="text-xs text-warn">Connect a wallet first.</span>}
        </div>
      </section>

      {err && (
        <section className="panel border-bad/50 bg-bad/5 text-sm text-bad">error: {err}</section>
      )}

      {result && (
        <section className="panel-lg space-y-2 text-xs">
          <h2 className="label">Result</h2>
          <div className="kv"><span className="label">userOpHash</span><code className="ml-3 truncate text-accent">{result.user_op_hash}</code></div>
          <div className="kv"><span className="label">signer</span><code className="ml-3 truncate text-accent">{result.signer_address}</code></div>
          <div className="kv">
            <span className="label">bundler tx</span>
            <code className="ml-3 truncate text-accent">{result.bundler_tx_hash ?? "(not submitted — set PIMLICO_API_KEY)"}</code>
          </div>
          <details className="mt-2">
            <summary className="cursor-pointer text-muted hover:text-accent">signed UserOp · debug</summary>
            <pre className="mt-2 max-h-80 overflow-auto rounded-md border border-border bg-bg p-2 text-[11px]">
{JSON.stringify(result.signed_user_op, null, 2)}
            </pre>
          </details>
        </section>
      )}
    </div>
  );
}
