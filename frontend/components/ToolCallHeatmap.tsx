// frontend/components/ToolCallHeatmap.tsx
// 5×5 heatmap: archetypes (rows) × MCP tools (cols). Cells are coloured by
// call count with a blue → violet → magenta ramp that matches the theme.
// Hover any cell for its exact count; click a row to open the archetype
// deep-dive page.
"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";

interface StatsResponse {
  demo: boolean;
  archetypes: readonly string[];
  tools: readonly string[];
  matrix: number[][];
  total: number;
  updatedAt: number;
}

const SHORT_TOOL: Record<string, string> = {
  wallet_sign_transaction:    "wallet_sign",
  supply_chain_api_query:     "supply_chain",
  contract_call_simulate:     "contract_sim",
  cross_chain_bridge_initiate:"bridge_init",
  audit_log_write:            "audit_log",
};

function tint(value: number, max: number) {
  // Map value/max -> a blue→violet→magenta gradient.
  const t = Math.min(1, value / Math.max(1, max));
  // Low end: near transparent; high end: saturated
  const opacity = 0.08 + t * 0.62;
  // Hue shift from sky (200) → violet (265) → pink (330)
  const hue = 200 + t * 130;
  return `hsla(${hue.toFixed(0)}, 80%, ${(68 - t * 18).toFixed(0)}%, ${opacity.toFixed(3)})`;
}

export function ToolCallHeatmap() {
  const [data, setData] = useState<StatsResponse | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [hover, setHover] = useState<{ row: number; col: number } | null>(null);

  useEffect(() => {
    let cancelled = false;
    const tick = async () => {
      try {
        const r = await fetch("/api/mcp/stats", { cache: "no-store" });
        if (!r.ok) throw new Error(`status ${r.status}`);
        const body = (await r.json()) as StatsResponse;
        if (!cancelled) { setData(body); setErr(null); }
      } catch (e) { if (!cancelled) setErr((e as Error).message); }
    };
    tick();
    const id = setInterval(tick, 15_000);
    return () => { cancelled = true; clearInterval(id); };
  }, []);

  const max = useMemo(() => data ? Math.max(1, ...data.matrix.flat()) : 1, [data]);

  const rowTotals = useMemo(() => data?.matrix.map(r => r.reduce((a, b) => a + b, 0)) ?? [], [data]);
  const colTotals = useMemo(() => {
    if (!data) return [];
    const cols = new Array(data.tools.length).fill(0);
    for (const r of data.matrix) for (let c = 0; c < r.length; c++) cols[c] += r[c];
    return cols;
  }, [data]);

  return (
    <section className="panel relative overflow-hidden">
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <h2 className="label">MCP tool-call heatmap</h2>
          {data && (data.demo
            ? <span className="chip-w">preview</span>
            : <span className="chip-n pulse-dot text-good">live</span>)}
        </div>
        {data && (
          <span className="text-[11px] text-muted">
            Σ · {data.total.toLocaleString()} calls · last 1h
          </span>
        )}
      </div>

      {err && <p className="text-[11px] text-bad">{err}</p>}

      {!data && !err && (
        <div className="grid gap-1" style={{ gridTemplateColumns: "110px repeat(5, 1fr)" }}>
          {Array.from({ length: 6 * 6 }).map((_, i) => (
            <div key={i} className="h-8 animate-pulse rounded-md border border-border bg-white/40" />
          ))}
        </div>
      )}

      {data && (
        <div className="overflow-x-auto">
          <div
            className="min-w-[540px] grid gap-1 text-[11px] font-mono"
            style={{ gridTemplateColumns: `110px repeat(${data.tools.length}, 1fr) 70px` }}
          >
            {/* Header row */}
            <div />
            {data.tools.map((t, c) => (
              <div
                key={t}
                className={
                  "flex items-end justify-center px-1 pb-1 text-center leading-tight text-muted " +
                  (hover?.col === c ? "text-accent" : "")
                }
              >
                <span className="rotate-[-12deg] origin-bottom-left whitespace-nowrap md:rotate-0">
                  {SHORT_TOOL[t] ?? t}
                </span>
              </div>
            ))}
            <div className="text-right text-muted">Σ arch</div>

            {/* Cells */}
            {data.archetypes.map((a, r) => (
              <FragmentRow
                key={a}
                name={a}
                r={r}
                row={data.matrix[r]}
                tools={data.tools}
                max={max}
                hover={hover}
                setHover={setHover}
                total={rowTotals[r]}
              />
            ))}

            {/* Column totals */}
            <div className="pt-2 text-right text-muted">Σ tool</div>
            {colTotals.map((v, c) => (
              <div
                key={c}
                className={
                  "pt-2 text-center " +
                  (hover?.col === c ? "text-accent" : "text-muted")
                }
              >
                {v.toLocaleString()}
              </div>
            ))}
            <div className="pt-2 text-right font-semibold text-text">
              {data.total.toLocaleString()}
            </div>
          </div>
        </div>
      )}

      {data && (
        <div className="mt-3 flex items-center gap-2 text-[11px] text-muted">
          <span className="label">scale</span>
          <div className="h-2 flex-1 rounded-full" style={{
            background: "linear-gradient(90deg, hsla(200,80%,68%,0.1), hsla(265,80%,58%,0.5), hsla(330,80%,50%,0.8))",
          }} />
          <span>0</span><span>{max}</span>
        </div>
      )}
    </section>
  );
}

function FragmentRow({
  name, r, row, tools, max, hover, setHover, total,
}: {
  name: string;
  r: number;
  row: number[];
  tools: readonly string[];
  max: number;
  hover: { row: number; col: number } | null;
  setHover: (h: { row: number; col: number } | null) => void;
  total: number;
}) {
  return (
    <>
      <Link
        href={`/archetypes/${name.toLowerCase()}`}
        className={
          "flex items-center justify-end pr-2 text-muted hover:text-accent transition-colors " +
          (hover?.row === r ? "text-accent" : "")
        }
      >
        <span className="truncate">{name}</span>
      </Link>
      {row.map((v, c) => {
        const activeRow = hover?.row === r;
        const activeCol = hover?.col === c;
        return (
          <button
            key={`${r}-${c}`}
            type="button"
            title={`${name} · ${tools[c]} · ${v.toLocaleString()} calls`}
            onMouseEnter={() => setHover({ row: r, col: c })}
            onMouseLeave={() => setHover(null)}
            className={
              "relative grid h-10 place-items-center rounded-md border transition-all duration-200 " +
              (activeRow || activeCol
                ? "border-accent/70 shadow-glow"
                : "border-border hover:border-accent/50")
            }
            style={{ background: tint(v, max) }}
          >
            <span className={"text-text/80 " + (v > max * 0.6 ? "text-white drop-shadow" : "")}>
              {v}
            </span>
          </button>
        );
      })}
      <div className="flex items-center justify-end pr-1 text-text">{total.toLocaleString()}</div>
    </>
  );
}
