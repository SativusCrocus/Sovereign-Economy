// frontend/components/GovernancePanel.tsx
// Dashboard panel: open proposals, vote tallies, timelock ETA countdowns.
"use client";

import { useEffect, useMemo, useState } from "react";

type ProposalState =
  | "Pending" | "Active" | "Succeeded" | "Queued" | "Executed" | "Defeated" | "Canceled";

interface Action { target: string; calldata: string; desc: string }
interface Proposal {
  id: number;
  title: string;
  proposer: string;
  state: ProposalState;
  forVotes: number;
  againstVotes: number;
  abstainVotes: number;
  quorum: number;
  createdAt: number;
  voteEndsAt: number;
  timelockEta: number | null;
  actions: Action[];
  summary: string;
}
interface Resp { demo: boolean; proposals: Proposal[] }

const STATE_CHIP: Record<ProposalState, string> = {
  Active:    "chip-n pulse-dot text-good",
  Pending:   "chip",
  Succeeded: "chip-ok",
  Queued:    "chip-w",
  Executed:  "chip-ok",
  Defeated:  "chip-b",
  Canceled:  "chip",
};

function fmtCountdown(ms: number): string {
  if (ms <= 0) return "ready";
  const s = Math.floor(ms / 1000);
  const d = Math.floor(s / 86400);
  const h = Math.floor((s % 86400) / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  if (d > 0) return `${d}d ${h.toString().padStart(2, "0")}h`;
  if (h > 0) return `${h}h ${m.toString().padStart(2, "0")}m`;
  if (m > 0) return `${m}m ${sec.toString().padStart(2, "0")}s`;
  return `${sec}s`;
}
function fmtVotes(n: number) {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(2)}M`;
  if (n >= 1_000)     return `${(n / 1_000).toFixed(1)}k`;
  return n.toString();
}
function short(h: string, n = 6) {
  if (h.length <= 2 * n + 4) return h;
  return `${h.slice(0, n + 2)}…${h.slice(-n)}`;
}

export function GovernancePanel() {
  const [data, setData] = useState<Resp | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [now, setNow] = useState(() => Date.now());
  const [expanded, setExpanded] = useState<number | null>(null);

  useEffect(() => {
    let cancelled = false;
    const tick = async () => {
      try {
        const r = await fetch("/api/governance/proposals", { cache: "no-store" });
        if (!r.ok) throw new Error(`status ${r.status}`);
        const body = await r.json() as Resp;
        if (!cancelled) { setData(body); setErr(null); }
      } catch (e) { if (!cancelled) setErr((e as Error).message); }
    };
    tick();
    const id = setInterval(tick, 20_000);
    return () => { cancelled = true; clearInterval(id); };
  }, []);

  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 1_000);
    return () => clearInterval(id);
  }, []);

  const sorted = useMemo(() => {
    if (!data) return [];
    const order: ProposalState[] = ["Active", "Queued", "Succeeded", "Executed", "Pending", "Defeated", "Canceled"];
    return [...data.proposals].sort((a, b) => {
      const ai = order.indexOf(a.state), bi = order.indexOf(b.state);
      if (ai !== bi) return ai - bi;
      return b.createdAt - a.createdAt;
    });
  }, [data]);

  const counts = useMemo(() => {
    const c: Record<ProposalState, number> = {
      Pending: 0, Active: 0, Succeeded: 0, Queued: 0, Executed: 0, Defeated: 0, Canceled: 0,
    };
    for (const p of data?.proposals ?? []) c[p.state]++;
    return c;
  }, [data]);

  return (
    <section className="panel-lg space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <h2 className="label">DAO governance</h2>
          {data && (data.demo ? <span className="chip-w">preview</span> : <span className="chip-n pulse-dot text-good">live</span>)}
          {err && <span className="chip-b">{err}</span>}
        </div>
        {data && (
          <div className="flex flex-wrap items-center gap-1.5 text-[11px]">
            <span className="chip-n">{counts.Active} active</span>
            <span className="chip-w">{counts.Queued} queued</span>
            <span className="chip-ok">{counts.Executed} executed</span>
            <span className="chip-b">{counts.Defeated} defeated</span>
          </div>
        )}
      </div>

      {!data && !err && (
        <div className="space-y-2">
          {Array.from({ length: 3 }).map((_, i) => (
            <div key={i} className="h-20 animate-pulse rounded-md border border-border bg-white/40" />
          ))}
        </div>
      )}

      {data && sorted.length > 0 && (
        <ul className="space-y-2">
          {sorted.map(p => {
            const total = p.forVotes + p.againstVotes + p.abstainVotes;
            const forPct     = total > 0 ? (p.forVotes / total) * 100 : 0;
            const againstPct = total > 0 ? (p.againstVotes / total) * 100 : 0;
            const abstainPct = total > 0 ? (p.abstainVotes / total) * 100 : 0;
            const quorumHit  = p.forVotes + p.againstVotes >= p.quorum;
            const isOpen = expanded === p.id;

            const timelockMs = p.timelockEta ? p.timelockEta - now : null;
            const voteMs     = p.voteEndsAt - now;

            return (
              <li key={p.id} className="rounded-xl border border-border bg-white/70 p-3 transition-all duration-300 ease-silk hover:border-accent/40">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className={STATE_CHIP[p.state]}>{p.state.toLowerCase()}</span>
                      <span className="chip border-border text-muted">#{p.id}</span>
                      {quorumHit && p.state === "Active" && <span className="chip-ok">quorum met</span>}
                      {p.state === "Active" && voteMs > 0 && (
                        <span className="chip-w">voting · {fmtCountdown(voteMs)}</span>
                      )}
                      {p.state === "Queued" && timelockMs !== null && (
                        <span className="chip-w">timelock · {fmtCountdown(timelockMs)}</span>
                      )}
                      {p.state === "Succeeded" && timelockMs !== null && (
                        <span className="chip">queueable · {fmtCountdown(timelockMs)}</span>
                      )}
                    </div>
                    <h3 className="mt-1.5 truncate text-sm font-semibold tracking-tight text-text">{p.title}</h3>
                    <p className="mt-1 text-[11px] text-muted">
                      by <code className="text-accent">{short(p.proposer, 5)}</code> · opened {new Date(p.createdAt).toLocaleDateString()}
                    </p>
                  </div>
                  <button
                    className="btn !py-1 !px-2 !text-[11px]"
                    onClick={() => setExpanded(isOpen ? null : p.id)}
                    aria-expanded={isOpen}
                  >
                    {isOpen ? "hide" : "details"}
                  </button>
                </div>

                {/* Vote bar */}
                <div className="mt-3">
                  <div className="flex h-2 w-full overflow-hidden rounded-full bg-border/60">
                    <div className="h-full bg-good transition-all duration-500" style={{ width: `${forPct}%` }} />
                    <div className="h-full bg-bad transition-all duration-500" style={{ width: `${againstPct}%` }} />
                    <div className="h-full bg-muted/60 transition-all duration-500" style={{ width: `${abstainPct}%` }} />
                  </div>
                  <div className="mt-1 flex flex-wrap items-center gap-3 text-[11px] text-muted">
                    <span className="text-good">for · {fmtVotes(p.forVotes)} ({forPct.toFixed(0)}%)</span>
                    <span className="text-bad">against · {fmtVotes(p.againstVotes)} ({againstPct.toFixed(0)}%)</span>
                    <span>abstain · {fmtVotes(p.abstainVotes)}</span>
                    <span className="ml-auto">quorum {fmtVotes(p.quorum)}</span>
                  </div>
                </div>

                {isOpen && (
                  <div className="mt-3 space-y-2 rounded-lg border border-border bg-white/80 p-3 text-[11px]">
                    <p className="text-text">{p.summary}</p>
                    <div className="space-y-1">
                      <span className="label">actions</span>
                      {p.actions.map((a, i) => (
                        <div key={i} className="kv font-mono">
                          <span className="truncate text-muted" title={a.target}>{short(a.target, 6)}</span>
                          <span className="ml-2 truncate text-accent">{a.desc}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}
