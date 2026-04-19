// frontend/components/GrafanaEmbed.tsx
"use client";
import { useEffect, useMemo, useState } from "react";
import { GRAFANA_URL } from "@/lib/config";

function isReachableUrl(url: string) {
  // From a browser, http://localhost:3000 is only reachable by someone running the
  // full stack locally. On Vercel the iframe just renders blank. Treat localhost /
  // private IPs as "not reachable from this browser" and render the preview fallback.
  try {
    const u = new URL(url);
    const host = u.hostname;
    if (host === "localhost" || host === "127.0.0.1" || host === "0.0.0.0") return false;
    if (host.startsWith("192.168.") || host.startsWith("10.") || host.startsWith("172.")) return false;
    if (u.protocol !== "https:" && u.protocol !== "http:") return false;
    return true;
  } catch {
    return false;
  }
}

export function GrafanaEmbed({
  dashboardUid = "daes-overview",
  height = 480,
}: { dashboardUid?: string; height?: number }) {
  const src = `${GRAFANA_URL}/d/${dashboardUid}?orgId=1&kiosk=tv&theme=dark`;

  const [mode, setMode] = useState<"checking" | "embedded" | "preview">(() =>
    isReachableUrl(GRAFANA_URL) ? "checking" : "preview",
  );

  useEffect(() => {
    if (mode !== "checking") return;
    let cancelled = false;
    // Best-effort reachability check. `no-cors` hides status but resolves ≈ reachable,
    // rejects on DNS/connection errors. Time-boxed so we fall back within 2.5s.
    const ac = new AbortController();
    const t = setTimeout(() => ac.abort(), 2500);
    fetch(`${GRAFANA_URL}/api/health`, { mode: "no-cors", signal: ac.signal })
      .then(() => { if (!cancelled) setMode("embedded"); })
      .catch(() => { if (!cancelled) setMode("preview"); })
      .finally(() => clearTimeout(t));
    return () => { cancelled = true; ac.abort(); };
  }, [mode]);

  return (
    <section className="panel">
      <div className="mb-3 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <h2 className="label">Grafana · {dashboardUid}</h2>
          <span className={mode === "embedded" ? "chip-n pulse-dot text-good" : "chip-w"}>
            {mode === "embedded" ? "live" : mode === "checking" ? "probing" : "preview"}
          </span>
        </div>
        <a
          className="link text-xs"
          href={mode === "embedded" ? src : "https://github.com/SativusCrocus/Sovereign-Economy/blob/main/config/grafana/dashboards/daes-overview.json"}
          target="_blank"
          rel="noreferrer"
        >
          {mode === "embedded" ? "open in Grafana ↗" : "dashboard JSON ↗"}
        </a>
      </div>

      {mode === "embedded" && (
        <iframe
          src={src}
          title={`Grafana ${dashboardUid}`}
          className="w-full rounded-md border border-border bg-bg"
          style={{ height }}
        />
      )}
      {mode === "checking" && (
        <div
          className="flex w-full animate-pulse items-center justify-center rounded-md border border-border bg-bg/40 text-xs text-muted"
          style={{ height }}
        >
          Probing Grafana at {GRAFANA_URL}…
        </div>
      )}
      {mode === "preview" && <GrafanaPreview height={height} />}
    </section>
  );
}

/* ------------------------------------------------------------------ */
/*  Deterministic mock dashboard — rendered when Grafana isn't reachable
    (Vercel deploy, docs screenshot, etc.). Shapes mimic the real panels
    in config/grafana/dashboards/daes-overview.json.                    */
/* ------------------------------------------------------------------ */

const TILES = [
  {
    id: "swarm",
    title: "Swarm signal rate",
    unit: "sig/min",
    value: "4.82",
    trend: "+12%",
    color: "#7dd3fc",
    good: true,
    desc: "1000 agents · quorum ≥ 67% · ±1.5σ of median",
  },
  {
    id: "hash",
    title: "State-hash probe",
    unit: "determinism",
    value: "100.0%",
    trend: "0 drift",
    color: "#4ade80",
    good: true,
    desc: "numpy.SeedSequence · replay parity check",
  },
  {
    id: "mcp",
    title: "MCP tool p95",
    unit: "ms",
    value: "184",
    trend: "−7ms",
    color: "#38bdf8",
    good: true,
    desc: "5 tools · mTLS + JWT · FastAPI handlers",
  },
  {
    id: "fsm",
    title: "Bridge FSM throughput",
    unit: "tx/hr",
    value: "9",
    trend: "stable",
    color: "#fbbf24",
    good: true,
    desc: "8-state machine · 86 400 s timelock",
  },
] as const;

// Tiny LCG so the sparkline is deterministic per tile id — the whole point of
// DAES is "same seed ⇒ same output." The fake dashboard honours that.
function lcg(seed: number, n: number) {
  const out: number[] = [];
  let x = seed;
  for (let i = 0; i < n; i++) {
    x = (x * 1664525 + 1013904223) >>> 0;
    out.push((x & 0xffff) / 0xffff);
  }
  return out;
}
function sparkPath(values: number[], w = 260, h = 56) {
  if (values.length === 0) return "";
  const min = Math.min(...values);
  const max = Math.max(...values);
  const range = Math.max(1e-9, max - min);
  const step = w / (values.length - 1);
  return values
    .map((v, i) => {
      const x = i * step;
      const y = h - ((v - min) / range) * (h - 6) - 3;
      return `${i === 0 ? "M" : "L"}${x.toFixed(2)},${y.toFixed(2)}`;
    })
    .join(" ");
}

function Sparkline({ seed, color }: { seed: number; color: string }) {
  const pts = useMemo(() => lcg(seed, 48), [seed]);
  // Smooth with a rolling mean so it looks like a metric, not noise.
  const smooth = useMemo(() => {
    const k = 4;
    return pts.map((_, i, a) => {
      const s = Math.max(0, i - k);
      const e = Math.min(a.length, i + k + 1);
      const win = a.slice(s, e);
      return win.reduce((x, y) => x + y, 0) / win.length;
    });
  }, [pts]);
  const d = sparkPath(smooth);
  return (
    <svg viewBox="0 0 260 56" preserveAspectRatio="none" className="h-14 w-full">
      <defs>
        <linearGradient id={`fill-${seed}`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={color} stopOpacity="0.35" />
          <stop offset="100%" stopColor={color} stopOpacity="0" />
        </linearGradient>
      </defs>
      <path d={`${d} L260,56 L0,56 Z`} fill={`url(#fill-${seed})`} />
      <path d={d} stroke={color} strokeWidth="1.5" fill="none" />
    </svg>
  );
}

function GrafanaPreview({ height }: { height: number }) {
  return (
    <div className="rounded-md border border-border bg-bg/40 p-4" style={{ minHeight: height }}>
      <div className="mb-3 flex flex-wrap items-center gap-2 text-[11px] text-muted">
        <span className="chip-w">Preview mode</span>
        <span>
          Grafana not reachable from this browser — showing a deterministic sample of the real
          <code className="mx-1 text-accent">daes-overview</code> dashboard.
        </span>
      </div>

      <div className="grid gap-3 md:grid-cols-2">
        {TILES.map((t, i) => (
          <div key={t.id} className="rounded-lg border border-border bg-panel/60 p-4">
            <div className="flex items-start justify-between">
              <div>
                <div className="label">{t.title}</div>
                <div className="mt-1 flex items-baseline gap-1.5">
                  <span className="text-2xl font-bold tracking-tight" style={{ color: t.color }}>
                    {t.value}
                  </span>
                  <span className="text-[11px] text-muted">{t.unit}</span>
                </div>
              </div>
              <span className={t.good ? "chip-ok" : "chip-w"}>{t.trend}</span>
            </div>
            <div className="mt-2">
              <Sparkline seed={17 + i * 101} color={t.color} />
            </div>
            <p className="mt-2 text-[11px] leading-relaxed text-muted">{t.desc}</p>
          </div>
        ))}
      </div>

      <div className="mt-4 grid gap-2 text-[11px] text-muted md:grid-cols-3">
        <div className="kv"><span className="label">datasource</span><span className="text-accent">prometheus · 15s</span></div>
        <div className="kv"><span className="label">retention</span><span className="text-accent">15 d · block 2h</span></div>
        <div className="kv"><span className="label">alerts</span><span className="text-good">0 firing</span></div>
      </div>

      <p className="mt-4 text-[11px] leading-relaxed text-muted">
        To wire live metrics, set <code className="text-accent">NEXT_PUBLIC_GRAFANA_URL</code> to a
        publicly reachable Grafana instance and whitelist this origin for iframe embedding.
      </p>
    </div>
  );
}
