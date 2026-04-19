// frontend/components/BridgeTxExplorer.tsx
// Chronological list of bridge executions.
//   - When BridgeExecutor address is set for the current chain AND a public
//     client is available, reads StateTransitioned / SignalReceived events
//     via viem.getLogs. Groups by signalId and renders the FSM trail.
//   - Otherwise falls back to /api/bridge/events (deterministic demo).
"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { useChainId, usePublicClient } from "wagmi";
import type { Address } from "viem";
import { ADDRESSES, FSM_STATES } from "@/lib/config";

interface Execution {
  signalId: string;
  archetype?: string;
  kind?: string;
  pathStates: string[];
  finalState: string;
  txHash: string;
  block: number;
  chainId: number;
  ts: number;
  elapsedSec: number;
  demo?: boolean;
}

interface DemoResponse { demo: boolean; executions: Execution[] }

const EXPLORER: Record<number, { name: string; tx: (h: string) => string; block: (b: number) => string }> = {
  8453: {
    name: "Base",
    tx:    (h) => `https://basescan.org/tx/${h}`,
    block: (b) => `https://basescan.org/block/${b}`,
  },
  10: {
    name: "Optimism",
    tx:    (h) => `https://optimistic.etherscan.io/tx/${h}`,
    block: (b) => `https://optimistic.etherscan.io/block/${b}`,
  },
  31337: {
    name: "Hardhat",
    tx:    (h) => `#tx-${h}`,
    block: (b) => `#block-${b}`,
  },
};

function short(h: string, n = 6) {
  if (!h || h.length < 2 * n + 4) return h;
  return `${h.slice(0, n + 2)}…${h.slice(-n)}`;
}
function fmtTime(ts: number) {
  const s = (Date.now() - ts) / 1000;
  if (s < 60) return `${Math.floor(s)}s ago`;
  if (s < 3600) return `${Math.floor(s / 60)}m ago`;
  if (s < 86400) return `${Math.floor(s / 3600)}h ago`;
  return new Date(ts).toLocaleDateString();
}

function FinalBadge({ state }: { state: string }) {
  const cls =
    state === "EXECUTED" ? "chip-ok" :
    state === "REJECTED" ? "chip-b" :
    state === "GUARDIAN_TIMEOUT" ? "chip-w" :
    "chip";
  return <span className={cls}>{state.replace(/_/g, " ")}</span>;
}

function Trail({ pathStates }: { pathStates: string[] }) {
  // Map to FSM_STATES indices for consistent colouring
  const indices = pathStates.map(s => FSM_STATES.indexOf(s as (typeof FSM_STATES)[number]));
  return (
    <div className="flex flex-wrap items-center gap-0.5">
      {indices.map((i, k) => {
        const ok = i === 6;
        const bad = i === 7;
        const warn = i === 5;
        const cls = ok ? "bg-good/20 text-good border-good/30"
                  : bad ? "bg-bad/15 text-bad border-bad/30"
                  : warn ? "bg-warn/15 text-warn border-warn/30"
                  : "bg-accent/10 text-accent border-accent/30";
        return (
          <span key={k} className="inline-flex items-center gap-0.5">
            <span
              className={`inline-flex h-4 min-w-[18px] items-center justify-center rounded border px-1 text-[9px] font-mono ${cls}`}
              title={FSM_STATES[i] ?? "?"}
            >
              {i}
            </span>
            {k < indices.length - 1 && <span className="text-[9px] text-muted">→</span>}
          </span>
        );
      })}
    </div>
  );
}

export function BridgeTxExplorer() {
  const chainId = useChainId();
  const addrs = ADDRESSES[chainId] ?? {};
  const bridge = addrs.bridgeExecutor as Address | undefined;
  const pc = usePublicClient({ chainId });

  const [execs, setExecs] = useState<Execution[] | null>(null);
  const [demo, setDemo] = useState(true);
  const [err, setErr] = useState<string | null>(null);
  const [filter, setFilter] = useState<"all" | "EXECUTED" | "REJECTED" | "GUARDIAN_TIMEOUT">("all");

  // On-chain path
  useEffect(() => {
    if (!bridge || !pc) return;
    let cancelled = false;
    const run = async () => {
      try {
        const latest = await pc.getBlockNumber();
        const fromBlock = latest - 5_000n < 0n ? 0n : latest - 5_000n;
        // Read StateTransitioned events
        const logs = await pc.getLogs({
          address: bridge,
          event: {
            type: "event",
            name: "StateTransitioned",
            inputs: [
              { type: "bytes32", name: "signalId", indexed: true },
              { type: "uint8",   name: "from",     indexed: false },
              { type: "uint8",   name: "to",       indexed: false },
            ],
          } as const,
          fromBlock,
          toBlock: latest,
        });
        // Group by signalId
        const bySig = new Map<string, { from: number; to: number; block: bigint; hash: string }[]>();
        for (const l of logs) {
          const sig = l.args.signalId as string;
          const arr = bySig.get(sig) ?? [];
          arr.push({
            from: Number(l.args.from),
            to: Number(l.args.to),
            block: l.blockNumber!,
            hash: l.transactionHash!,
          });
          bySig.set(sig, arr);
        }
        // Build executions (newest last transition)
        const out: Execution[] = [];
        for (const [sig, arr] of bySig) {
          arr.sort((a, b) => Number(a.block - b.block));
          const path = [arr[0].from, ...arr.map(a => a.to)].map(i => FSM_STATES[i] ?? `?${i}`);
          const last = arr[arr.length - 1];
          const block = await pc.getBlock({ blockNumber: last.block });
          out.push({
            signalId: sig,
            pathStates: path,
            finalState: FSM_STATES[last.to] ?? `?${last.to}`,
            txHash: last.hash,
            block: Number(last.block),
            chainId,
            ts: Number(block.timestamp) * 1000,
            elapsedSec: 0,
          });
        }
        if (!cancelled) {
          out.sort((a, b) => b.ts - a.ts);
          setExecs(out.slice(0, 24));
          setDemo(false);
          setErr(null);
        }
      } catch (e) {
        if (!cancelled) setErr((e as Error).message);
      }
    };
    run();
  }, [bridge, pc, chainId]);

  // Demo path
  useEffect(() => {
    if (bridge && pc) return;
    let cancelled = false;
    const tick = async () => {
      try {
        const r = await fetch("/api/bridge/events", { cache: "no-store" });
        if (!r.ok) throw new Error(`status ${r.status}`);
        const body = (await r.json()) as DemoResponse;
        if (!cancelled) { setExecs(body.executions); setDemo(body.demo); setErr(null); }
      } catch (e) { if (!cancelled) setErr((e as Error).message); }
    };
    tick();
    const id = setInterval(tick, 20_000);
    return () => { cancelled = true; clearInterval(id); };
  }, [bridge, pc]);

  const rows = useMemo(() => {
    if (!execs) return [];
    if (filter === "all") return execs;
    return execs.filter(e => e.finalState === filter);
  }, [execs, filter]);

  return (
    <section className="panel-lg relative overflow-hidden">
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <h2 className="label">Bridge tx explorer</h2>
          {demo ? <span className="chip-w">preview</span> : <span className="chip-n pulse-dot text-good">on-chain</span>}
          {err && <span className="chip-b">{err}</span>}
        </div>
        <div className="flex items-center gap-1 rounded-lg border border-border bg-white/70 p-1 text-[11px]">
          {(["all", "EXECUTED", "REJECTED", "GUARDIAN_TIMEOUT"] as const).map(f => (
            <button
              key={f}
              type="button"
              onClick={() => setFilter(f)}
              className={
                "rounded-md px-2 py-1 font-mono transition-colors " +
                (filter === f
                  ? "bg-accent/10 text-accent ring-1 ring-accent/30"
                  : "text-muted hover:text-text")
              }
            >
              {f === "all" ? "all" : f.toLowerCase().replace(/_/g, " ")}
            </button>
          ))}
        </div>
      </div>

      {!execs && !err && (
        <div className="space-y-2">
          {Array.from({ length: 6 }).map((_, i) => (
            <div key={i} className="h-12 animate-pulse rounded-md border border-border bg-white/40" />
          ))}
        </div>
      )}

      {execs && rows.length === 0 && (
        <p className="py-6 text-center text-xs text-muted">
          No matching executions in the current window.
        </p>
      )}

      {execs && rows.length > 0 && (
        <div className="overflow-x-auto">
          <table className="min-w-full text-left text-[11px]">
            <thead className="text-muted">
              <tr className="border-b border-border">
                <th className="py-2 pr-3 font-mono">final</th>
                <th className="py-2 pr-3 font-mono">archetype · kind</th>
                <th className="py-2 pr-3 font-mono">FSM trail</th>
                <th className="py-2 pr-3 font-mono">signalId</th>
                <th className="py-2 pr-3 font-mono">tx · block</th>
                <th className="py-2 pr-3 font-mono">chain</th>
                <th className="py-2 pr-0 text-right font-mono">when</th>
              </tr>
            </thead>
            <tbody className="font-mono">
              {rows.map(e => {
                const ex = EXPLORER[e.chainId];
                return (
                  <tr
                    key={`${e.signalId}-${e.txHash}`}
                    className="group border-b border-border/60 transition-colors hover:bg-accent/5"
                  >
                    <td className="py-2 pr-3"><FinalBadge state={e.finalState} /></td>
                    <td className="py-2 pr-3 text-text">
                      {e.archetype ? (
                        <Link href={`/archetypes/${e.archetype.toLowerCase()}`} className="link">
                          {e.archetype}
                        </Link>
                      ) : <span className="text-muted">—</span>}
                      {e.kind && <span className="ml-1.5 text-muted">· {e.kind}</span>}
                    </td>
                    <td className="py-2 pr-3"><Trail pathStates={e.pathStates} /></td>
                    <td className="py-2 pr-3 text-accent">{short(e.signalId, 5)}</td>
                    <td className="py-2 pr-3">
                      {ex ? (
                        <a className="link" href={ex.tx(e.txHash)} target="_blank" rel="noreferrer">{short(e.txHash, 5)}</a>
                      ) : <span className="text-accent">{short(e.txHash, 5)}</span>}
                      <span className="ml-1 text-muted">· #{e.block.toLocaleString()}</span>
                    </td>
                    <td className="py-2 pr-3 text-muted">{ex?.name ?? `#${e.chainId}`}</td>
                    <td className="py-2 pr-0 text-right text-muted">{fmtTime(e.ts)}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {demo && (
        <p className="mt-3 text-[11px] leading-relaxed text-muted">
          Preview data — no <code className="text-accent">bridgeExecutor</code> address is configured for chain {chainId}.
          Deploy via <code className="text-accent">contracts/scripts/deploy-local.ts</code> and populate{" "}
          <code className="text-accent">frontend/lib/config.ts</code> to read real on-chain events.
        </p>
      )}
    </section>
  );
}
