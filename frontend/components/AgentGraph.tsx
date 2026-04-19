// frontend/components/AgentGraph.tsx
// Deterministic 2000-agent relationship graph. Each node is one agent of the
// DAES swarm, colored by archetype; each edge is a "same-signal-cohort"
// relationship — the pattern you'd see when agents cross-reference state.
// Canvas 2D, no external deps, rebuilds from a seed (determinism is the point).
"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";

/* ─── Archetypes ───────────────────────────────────────────────────── */

const ARCHETYPES = [
  {
    name: "Speculator",   color: "#f43f5e",
    count: 480,
    activities: ["proposing BUY ETH/USD", "probing volatility", "signal cascade", "momentum scan", "quorum vote"],
  },
  {
    name: "Arbitrageur",  color: "#14b8a6",
    count: 420,
    activities: ["cross-DEX spread", "UserOp submit", "gas-optimise", "path-finding", "route simulate"],
  },
  {
    name: "Sovereign",    color: "#8b5cf6",
    count: 360,
    activities: ["policy review", "treasury rebalance", "stake voting", "risk envelope", "DAO delegate"],
  },
  {
    name: "MarketMaker",  color: "#f97316",
    count: 420,
    activities: ["order-book quote", "liquidity provision", "slippage calc", "inventory skew", "re-peg LP"],
  },
  {
    name: "BlackSwan",    color: "#475569",
    count: 320,
    activities: ["tail-risk scan", "escalate guardian", "hedging", "circuit-probe", "σ alert"],
  },
] as const;

const TOTAL = ARCHETYPES.reduce((a, b) => a + b.count, 0); // 2000

/* ─── Deterministic PRNG + Gaussian ───────────────────────────────── */

function mulberry32(seed: number) {
  let s = seed >>> 0;
  return function () {
    s = (s + 0x6D2B79F5) >>> 0;
    let t = Math.imul(s ^ (s >>> 15), 1 | s);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
function gauss(rng: () => number) {
  const u1 = Math.max(1e-9, rng());
  const u2 = rng();
  return Math.sqrt(-2 * Math.log(u1)) * Math.cos(2 * Math.PI * u2);
}

/* ─── Types ───────────────────────────────────────────────────────── */

interface Agent {
  id: number;
  archIdx: number;
  name: string;
  x: number;
  y: number;
  r: number;
  degree: number;
  activity: string;
  hub: boolean;
}
interface Edge { a: number; b: number; cross: boolean }
interface Graph { agents: Agent[]; edges: Edge[]; w: number; h: number; buckets: Map<string, number[]>; cell: number }

/* ─── Build ───────────────────────────────────────────────────────── */

function buildGraph(seed: number, w: number, h: number): Graph {
  const rng = mulberry32(seed);
  const cx = w / 2, cy = h / 2;
  const R  = Math.min(w, h) * 0.30;

  // Cluster centers, one per archetype, on a circle
  const centers = ARCHETYPES.map((_, i) => {
    const angle = (i / ARCHETYPES.length) * Math.PI * 2 - Math.PI / 2;
    return { x: cx + Math.cos(angle) * R, y: cy + Math.sin(angle) * R };
  });

  // Agents
  const agents: Agent[] = [];
  const hubIds = new Set<number>();
  const hubsPerArch = 2; // 2 hubs per archetype = 10 hubs total
  const spread = Math.min(w, h) * 0.18;

  ARCHETYPES.forEach((arch, archIdx) => {
    const c = centers[archIdx];
    const idxInArch: number[] = [];
    for (let i = 0; i < arch.count; i++) {
      const id = agents.length;
      idxInArch.push(id);

      // Gaussian jitter; every few agents pulled a bit toward global center for visual structure
      const gx = gauss(rng) * spread;
      const gy = gauss(rng) * spread;
      const pull = rng() < 0.03 ? 0.45 : 0;
      const x = c.x + gx * (1 - pull) + (cx - c.x) * pull;
      const y = c.y + gy * (1 - pull) + (cy - c.y) * pull;

      agents.push({
        id,
        archIdx,
        name: `agent-${arch.name}-${String(i).padStart(4, "0")}`,
        x, y, r: 1.6, degree: 0,
        activity: arch.activities[(rng() * arch.activities.length) | 0],
        hub: false,
      });
    }
    // Pick N random hubs from this archetype — they'll get larger radii + more edges
    for (let j = 0; j < hubsPerArch; j++) {
      const pick = idxInArch[(rng() * idxInArch.length) | 0];
      hubIds.add(pick);
      agents[pick].hub = true;
    }
  });

  // Spatial hash for nearest-neighbor lookup
  const cell = 38;
  const buckets = new Map<string, number[]>();
  const bk = (x: number, y: number) => `${(x / cell) | 0}:${(y / cell) | 0}`;
  agents.forEach(a => {
    const k = bk(a.x, a.y);
    const arr = buckets.get(k);
    if (arr) arr.push(a.id); else buckets.set(k, [a.id]);
  });

  // Edges: each agent links to its ~3 nearest in-cluster neighbors + occasional cross-cluster
  const edges: Edge[] = [];
  const seen = new Set<number>();
  const key = (i: number, j: number) => (i < j ? i * 10007 + j : j * 10007 + i);

  for (const a of agents) {
    const gx = (a.x / cell) | 0;
    const gy = (a.y / cell) | 0;
    const cands: number[] = [];
    for (let ox = -1; ox <= 1; ox++)
      for (let oy = -1; oy <= 1; oy++) {
        const arr = buckets.get(`${gx + ox}:${gy + oy}`);
        if (arr) cands.push(...arr);
      }
    cands.sort((i, j) => {
      const di = (agents[i].x - a.x) ** 2 + (agents[i].y - a.y) ** 2;
      const dj = (agents[j].x - a.x) ** 2 + (agents[j].y - a.y) ** 2;
      return di - dj;
    });
    const target = a.hub ? 6 + ((rng() * 4) | 0) : 2 + ((rng() * 3) | 0);
    let added = 0;
    for (const cid of cands) {
      if (cid === a.id || added >= target) continue;
      const k = key(a.id, cid);
      if (seen.has(k)) continue;
      seen.add(k);
      edges.push({ a: a.id, b: cid, cross: agents[cid].archIdx !== a.archIdx });
      agents[a.id].degree++;
      agents[cid].degree++;
      added++;
    }
    // Cross-cluster hop
    if (rng() < 0.035) {
      const t = (rng() * agents.length) | 0;
      if (t !== a.id) {
        const k = key(a.id, t);
        if (!seen.has(k)) {
          seen.add(k);
          edges.push({ a: a.id, b: t, cross: agents[t].archIdx !== a.archIdx });
          agents[a.id].degree++;
          agents[t].degree++;
        }
      }
    }
  }

  // Radius by degree (hubs are bigger)
  agents.forEach(a => {
    a.r = a.hub ? 3.5 + Math.min(4, a.degree * 0.12) : 1.3 + Math.min(2.5, a.degree * 0.14);
  });

  return { agents, edges, w, h, buckets, cell };
}

/* ─── Hit-test (bucketed) ─────────────────────────────────────────── */

function nearestAgent(g: Graph, x: number, y: number): number | null {
  const gx = (x / g.cell) | 0;
  const gy = (y / g.cell) | 0;
  let best = -1;
  let bestD2 = 256; // 16px max pick radius
  for (let ox = -1; ox <= 1; ox++)
    for (let oy = -1; oy <= 1; oy++) {
      const arr = g.buckets.get(`${gx + ox}:${gy + oy}`);
      if (!arr) continue;
      for (const id of arr) {
        const a = g.agents[id];
        const dx = a.x - x, dy = a.y - y;
        const d2 = dx * dx + dy * dy;
        if (d2 < bestD2) { bestD2 = d2; best = id; }
      }
    }
  return best >= 0 ? best : null;
}

/* ─── Rendering ───────────────────────────────────────────────────── */

interface DrawOpts {
  hoverId: number | null;
  showLabels: boolean;
  pulsePhase: number;
}

function draw(ctx: CanvasRenderingContext2D, g: Graph, opts: DrawOpts) {
  const { w, h, agents, edges } = g;
  ctx.clearRect(0, 0, w, h);

  // Backdrop dots
  ctx.fillStyle = "rgba(148,163,184,0.35)";
  for (let y = 16; y < h; y += 22) {
    for (let x = 16; x < w; x += 22) {
      ctx.fillRect(x - 0.5, y - 0.5, 1, 1);
    }
  }

  // Edges — faint baseline
  ctx.strokeStyle = "rgba(100,116,139,0.14)";
  ctx.lineWidth = 0.5;
  for (const e of edges) {
    const a = agents[e.a], b = agents[e.b];
    ctx.beginPath();
    ctx.moveTo(a.x, a.y);
    ctx.lineTo(b.x, b.y);
    ctx.stroke();
  }

  // Cross-cluster edges (more visible)
  ctx.strokeStyle = "rgba(148,163,184,0.28)";
  ctx.lineWidth = 0.6;
  for (const e of edges) {
    if (!e.cross) continue;
    const a = agents[e.a], b = agents[e.b];
    ctx.beginPath();
    ctx.moveTo(a.x, a.y);
    ctx.lineTo(b.x, b.y);
    ctx.stroke();
  }

  // Hover halo edges
  if (opts.hoverId !== null) {
    ctx.strokeStyle = "rgba(2,132,199,0.55)";
    ctx.lineWidth = 1.1;
    for (const e of edges) {
      if (e.a !== opts.hoverId && e.b !== opts.hoverId) continue;
      const a = agents[e.a], b = agents[e.b];
      ctx.beginPath();
      ctx.moveTo(a.x, a.y);
      ctx.lineTo(b.x, b.y);
      ctx.stroke();
    }
  }

  // Agents
  for (const a of agents) {
    ctx.fillStyle = ARCHETYPES[a.archIdx].color;
    ctx.globalAlpha = a.hub ? 1 : 0.85;
    ctx.beginPath();
    ctx.arc(a.x, a.y, a.r, 0, Math.PI * 2);
    ctx.fill();
    if (a.hub) {
      ctx.globalAlpha = 0.25 + 0.15 * Math.sin(opts.pulsePhase + a.id * 0.01);
      ctx.beginPath();
      ctx.arc(a.x, a.y, a.r + 6, 0, Math.PI * 2);
      ctx.fill();
    }
  }
  ctx.globalAlpha = 1;

  // Hub labels (and the hovered agent label)
  if (opts.showLabels || opts.hoverId !== null) {
    ctx.font = "10px ui-monospace, SFMono-Regular, Menlo, monospace";
    ctx.textBaseline = "middle";
    for (const a of agents) {
      const isHover = a.id === opts.hoverId;
      if (!a.hub && !isHover) continue;
      const label = isHover ? `${a.name} · ${a.activity}` : `${a.name}`;
      ctx.fillStyle = isHover ? "#0f172a" : "#334155";
      const px = a.x + a.r + 5;
      const py = a.y;
      // bg chip
      const metrics = ctx.measureText(label);
      const pad = 4;
      ctx.fillStyle = isHover ? "rgba(14,165,233,0.92)" : "rgba(255,255,255,0.92)";
      ctx.strokeStyle = isHover ? "rgba(14,165,233,1)" : "rgba(226,232,240,0.9)";
      const rx = px - pad;
      const ry = py - 9;
      const rw = metrics.width + pad * 2;
      const rh = 18;
      const rr = 4;
      ctx.beginPath();
      ctx.moveTo(rx + rr, ry);
      ctx.lineTo(rx + rw - rr, ry);
      ctx.quadraticCurveTo(rx + rw, ry, rx + rw, ry + rr);
      ctx.lineTo(rx + rw, ry + rh - rr);
      ctx.quadraticCurveTo(rx + rw, ry + rh, rx + rw - rr, ry + rh);
      ctx.lineTo(rx + rr, ry + rh);
      ctx.quadraticCurveTo(rx, ry + rh, rx, ry + rh - rr);
      ctx.lineTo(rx, ry + rr);
      ctx.quadraticCurveTo(rx, ry, rx + rr, ry);
      ctx.closePath();
      ctx.fill();
      ctx.lineWidth = 0.5;
      ctx.stroke();
      ctx.fillStyle = isHover ? "#ffffff" : "#334155";
      ctx.fillText(label, px, py);
    }
  }

  // Hover node ring
  if (opts.hoverId !== null) {
    const a = agents[opts.hoverId];
    ctx.strokeStyle = "#0284c7";
    ctx.lineWidth = 1.6;
    ctx.beginPath();
    ctx.arc(a.x, a.y, a.r + 4, 0, Math.PI * 2);
    ctx.stroke();
  }
}

/* ─── Component ───────────────────────────────────────────────────── */

export function AgentGraph() {
  const wrapRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const graphRef = useRef<Graph | null>(null);
  const [size, setSize] = useState<{ w: number; h: number } | null>(null);
  const [seed, setSeed] = useState(42);
  const [showLabels, setShowLabels] = useState(false);
  const [hoverId, setHoverId] = useState<number | null>(null);
  const [full, setFull] = useState(false);
  const [tooltip, setTooltip] = useState<{ x: number; y: number; id: number } | null>(null);

  // Resize observer
  useEffect(() => {
    const el = wrapRef.current;
    if (!el) return;
    const ro = new ResizeObserver(entries => {
      for (const e of entries) {
        const { width } = e.contentRect;
        const height = full ? Math.min(800, window.innerHeight * 0.85) : 520;
        setSize({ w: Math.max(320, Math.floor(width)), h: Math.floor(height) });
      }
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, [full]);

  // (Re)build graph on size / seed change
  const graph = useMemo(() => {
    if (!size) return null;
    return buildGraph(seed, size.w, size.h);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [seed, size?.w, size?.h]);
  useEffect(() => { graphRef.current = graph; }, [graph]);

  // Draw loop — needs to run to animate hub pulses; otherwise redraws on state
  const pulseRef = useRef(0);
  const hoverRef = useRef<number | null>(null);
  const showRef  = useRef(false);
  useEffect(() => { hoverRef.current = hoverId; }, [hoverId]);
  useEffect(() => { showRef.current  = showLabels; }, [showLabels]);

  useEffect(() => {
    if (!graph || !canvasRef.current || !size) return;
    const canvas = canvasRef.current;
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    canvas.width  = size.w * dpr;
    canvas.height = size.h * dpr;
    canvas.style.width  = size.w + "px";
    canvas.style.height = size.h + "px";
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

    let raf = 0;
    const loop = () => {
      pulseRef.current += 0.03;
      draw(ctx, graph, {
        hoverId: hoverRef.current,
        showLabels: showRef.current,
        pulsePhase: pulseRef.current,
      });
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
  }, [graph, size]);

  // Mouse handlers
  const onMove = useCallback((e: React.MouseEvent) => {
    const g = graphRef.current;
    if (!g) return;
    const rect = (e.currentTarget as HTMLDivElement).getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;
    const id = nearestAgent(g, x, y);
    setHoverId(id);
    setTooltip(id !== null ? { x, y, id } : null);
  }, []);
  const onLeave = useCallback(() => { setHoverId(null); setTooltip(null); }, []);

  const counts = useMemo(() => ARCHETYPES.map(a => a.count), []);

  return (
    <section className={`${full ? "fixed inset-4 z-30" : "relative"} panel-lg overflow-hidden transition-all duration-500 ease-silk`}>
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <div>
          <div className="flex items-center gap-2">
            <h2 className="label">Swarm · agent relationship graph</h2>
            <span className="chip-n pulse-dot text-good">live</span>
          </div>
          <p className="mt-1 text-xs text-muted">
            {TOTAL.toLocaleString()} agents · {ARCHETYPES.length} archetypes · deterministic layout from seed {seed}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <label className="flex cursor-pointer select-none items-center gap-2 text-xs text-muted">
            <span
              role="switch"
              aria-checked={showLabels}
              tabIndex={0}
              className={`switch ${showLabels ? "switch-on" : ""}`}
              onClick={() => setShowLabels(s => !s)}
              onKeyDown={e => (e.key === " " || e.key === "Enter") && setShowLabels(s => !s)}
            >
              <span className="switch-dot" style={{ transform: showLabels ? "translateX(16px)" : "translateX(0)" }} />
            </span>
            Show hub labels
          </label>
          <button className="btn !py-1.5 !text-xs" onClick={() => setSeed(s => s + 1)} aria-label="Refresh layout">
            ↻ Refresh
          </button>
          <button className="btn !py-1.5 !text-xs" onClick={() => setFull(f => !f)} aria-label={full ? "Exit full screen" : "Expand"}>
            {full ? "× Close" : "⤢ Expand"}
          </button>
        </div>
      </div>

      {/* Legend */}
      <div className="mb-3 flex flex-wrap gap-2">
        {ARCHETYPES.map((a, i) => (
          <span key={a.name} className="inline-flex items-center gap-1.5 rounded-full border border-border bg-white/70 px-2.5 py-0.5 text-[11px]">
            <span className="inline-block h-2 w-2 rounded-full" style={{ background: a.color }} aria-hidden />
            <span className="text-text">{a.name}</span>
            <span className="font-mono text-muted">{counts[i]}</span>
          </span>
        ))}
      </div>

      {/* Canvas container */}
      <div
        ref={wrapRef}
        className="relative w-full overflow-hidden rounded-xl border border-border bg-white/60"
        onMouseMove={onMove}
        onMouseLeave={onLeave}
      >
        <canvas ref={canvasRef} className="block" />

        {/* Floating tooltip */}
        {tooltip && graph && (
          <div
            className="pointer-events-none absolute z-10 rounded-lg border border-border bg-white/95 px-3 py-2 text-[11px] shadow-card backdrop-blur"
            style={{
              left:  Math.min(tooltip.x + 14, (size?.w ?? 0) - 260),
              top:   Math.min(tooltip.y + 14, (size?.h ?? 0) - 90),
              width: 248,
            }}
          >
            <div className="flex items-center gap-2">
              <span className="h-2 w-2 rounded-full" style={{ background: ARCHETYPES[graph.agents[tooltip.id].archIdx].color }} aria-hidden />
              <span className="font-mono text-text">{graph.agents[tooltip.id].name}</span>
            </div>
            <div className="mt-1.5 grid grid-cols-[70px_1fr] gap-x-2 gap-y-0.5 text-[11px]">
              <span className="text-muted">archetype</span><span className="text-text">{ARCHETYPES[graph.agents[tooltip.id].archIdx].name}</span>
              <span className="text-muted">activity</span> <span className="text-accent truncate">{graph.agents[tooltip.id].activity}</span>
              <span className="text-muted">degree</span>   <span className="font-mono text-text">{graph.agents[tooltip.id].degree}</span>
              <span className="text-muted">role</span>     <span className="text-text">{graph.agents[tooltip.id].hub ? "hub" : "follower"}</span>
            </div>
          </div>
        )}
      </div>

      {/* Caption */}
      <p className="mt-3 text-[11px] leading-relaxed text-muted">
        Nodes are agents, colored by archetype; edges are shared-signal cohorts. Hubs are high-degree agents that
        coordinate a local quorum. Hover any dot for its current activity. Layout is deterministic — a fixed seed
        reproduces the same topology every time (the same property the on-chain determinism probe verifies).
      </p>
    </section>
  );
}
