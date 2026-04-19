// frontend/components/CrossChainFlow.tsx
// Animated visualisation of LayerZero packets moving between Base (left)
// and Optimism (right). Each packet is a small dot that eases along an
// arc; click any dot to open the side drawer with the OApp message
// details (guid, eids, sender/receiver, tx hashes).
"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { CHAIN_LABEL, type ChainId } from "@/lib/demo/cross";

interface Packet {
  guid: string;
  nonce: number;
  srcEid: number;
  dstEid: number;
  srcChainId: ChainId;
  dstChainId: ChainId;
  sender: string;
  receiver: string;
  archetype: string;
  phase: number;
  sentAt: number;
  kind: string;
  size: number;
  txHashSrc: string;
  txHashDst: string | null;
}

const ARCH_COLOR: Record<string, string> = {
  Speculator:  "#f43f5e",
  Arbitrageur: "#14b8a6",
  Sovereign:   "#8b5cf6",
  MarketMaker: "#f97316",
  BlackSwan:   "#475569",
};

function short(h: string, n = 6) {
  if (!h || h.length < 2 * n + 4) return h;
  return `${h.slice(0, n + 2)}…${h.slice(-n)}`;
}

interface Anchor { x: number; y: number }

/** Quadratic bezier point with an arched midpoint. */
function bezier(a: Anchor, b: Anchor, t: number): Anchor {
  const cx = (a.x + b.x) / 2;
  const cy = Math.min(a.y, b.y) - Math.abs(b.x - a.x) * 0.28;
  const it = 1 - t;
  return {
    x: it * it * a.x + 2 * it * t * cx + t * t * b.x,
    y: it * it * a.y + 2 * it * t * cy + t * t * b.y,
  };
}

export function CrossChainFlow() {
  const wrapRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [size, setSize] = useState<{ w: number; h: number }>({ w: 720, h: 320 });
  const [packets, setPackets] = useState<Packet[]>([]);
  const [demo, setDemo] = useState(true);
  const [err, setErr] = useState<string | null>(null);
  const [selected, setSelected] = useState<Packet | null>(null);
  const [hoverId, setHoverId] = useState<string | null>(null);

  // Resize observer
  useEffect(() => {
    const el = wrapRef.current;
    if (!el) return;
    const ro = new ResizeObserver(entries => {
      for (const e of entries) {
        const { width } = e.contentRect;
        setSize({ w: Math.max(320, Math.floor(width)), h: 320 });
      }
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  // Poll feed
  useEffect(() => {
    let cancelled = false;
    const tick = async () => {
      try {
        const r = await fetch("/api/lz/packets", { cache: "no-store" });
        if (!r.ok) throw new Error(`status ${r.status}`);
        const body = await r.json() as { demo: boolean; packets: Packet[] };
        if (!cancelled) { setPackets(body.packets); setDemo(body.demo); setErr(null); }
      } catch (e) { if (!cancelled) setErr((e as Error).message); }
    };
    tick();
    const id = setInterval(tick, 4_000);
    return () => { cancelled = true; clearInterval(id); };
  }, []);

  const anchors = useMemo(() => {
    const cy = size.h / 2;
    return {
      8453: { x: 90, y: cy },
      10:   { x: size.w - 90, y: cy },
    } as const satisfies Record<ChainId, Anchor>;
  }, [size]);

  // Animation loop
  const rafRef = useRef(0);
  const packetsRef = useRef<Packet[]>([]);
  useEffect(() => { packetsRef.current = packets; }, [packets]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    canvas.width = size.w * dpr;
    canvas.height = size.h * dpr;
    canvas.style.width = `${size.w}px`;
    canvas.style.height = `${size.h}px`;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

    const startedAt = Date.now();
    const draw = () => {
      const w = size.w, h = size.h;
      ctx.clearRect(0, 0, w, h);

      // Backdrop: soft aurora behind the arcs
      const grad = ctx.createLinearGradient(0, 0, w, 0);
      grad.addColorStop(0,   "rgba(14,165,233,0.08)");
      grad.addColorStop(0.5, "rgba(124,58,237,0.06)");
      grad.addColorStop(1,   "rgba(219,39,119,0.08)");
      ctx.fillStyle = grad;
      ctx.fillRect(0, 0, w, h);

      // Dot grid
      ctx.fillStyle = "rgba(148,163,184,0.25)";
      for (let y = 16; y < h; y += 22) {
        for (let x = 16; x < w; x += 22) {
          ctx.fillRect(x - 0.5, y - 0.5, 1, 1);
        }
      }

      // Chain anchors (globes)
      (Object.entries(anchors) as [string, Anchor][]).forEach(([cid, a]) => {
        const id = Number(cid) as ChainId;
        const label = CHAIN_LABEL[id];
        const color = id === 8453 ? "#0284c7" : "#db2777";
        // outer glow
        const g = ctx.createRadialGradient(a.x, a.y, 10, a.x, a.y, 70);
        g.addColorStop(0, `${color}55`);
        g.addColorStop(1, `${color}00`);
        ctx.fillStyle = g;
        ctx.beginPath();
        ctx.arc(a.x, a.y, 70, 0, Math.PI * 2);
        ctx.fill();
        // core
        ctx.fillStyle = "#ffffff";
        ctx.beginPath();
        ctx.arc(a.x, a.y, 28, 0, Math.PI * 2);
        ctx.fill();
        ctx.strokeStyle = color;
        ctx.lineWidth = 2;
        ctx.stroke();
        // slow rotating ring
        const t = (Date.now() - startedAt) / 3000;
        ctx.strokeStyle = `${color}66`;
        ctx.lineWidth = 1;
        ctx.setLineDash([3, 5]);
        ctx.beginPath();
        ctx.arc(a.x, a.y, 36 + Math.sin(t) * 2, 0, Math.PI * 2);
        ctx.stroke();
        ctx.setLineDash([]);
        // label
        ctx.fillStyle = "#0f172a";
        ctx.font = "600 12px ui-sans-serif, system-ui, sans-serif";
        ctx.textAlign = "center";
        ctx.fillText(label, a.x, a.y + 52);
        ctx.font = "10px ui-monospace, Menlo, monospace";
        ctx.fillStyle = "#64748b";
        ctx.fillText(`eid ${id === 8453 ? 30184 : 30111}`, a.x, a.y + 66);
      });

      // Arc paths
      (["fwd", "rev"] as const).forEach(dir => {
        const a = dir === "fwd" ? anchors[8453] : anchors[10];
        const b = dir === "fwd" ? anchors[10]   : anchors[8453];
        ctx.strokeStyle = "rgba(100,116,139,0.22)";
        ctx.lineWidth = 1;
        ctx.beginPath();
        for (let t = 0; t <= 1; t += 0.02) {
          const p = bezier(a, b, t);
          if (t === 0) ctx.moveTo(p.x, p.y); else ctx.lineTo(p.x, p.y);
        }
        ctx.stroke();
      });

      // Packets
      const pkts = packetsRef.current;
      const lifeMs = 36_000;
      const now = Date.now();
      for (const p of pkts) {
        const age = now - p.sentAt;
        const phase = Math.max(0, Math.min(1, age / lifeMs));
        if (phase >= 1.15) continue;
        const a = anchors[p.srcChainId];
        const b = anchors[p.dstChainId];
        const pos = bezier(a, b, Math.min(1, phase));
        const isHover = hoverId === p.guid;
        const isSelected = selected?.guid === p.guid;
        const col = ARCH_COLOR[p.archetype] ?? "#0284c7";
        const size = isHover || isSelected ? 6.5 : 4.5;
        // trail
        ctx.strokeStyle = `${col}55`;
        ctx.lineWidth = 1.5;
        ctx.beginPath();
        for (let k = 0; k <= 10; k++) {
          const tt = Math.max(0, Math.min(1, phase - k * 0.015));
          const pp = bezier(a, b, tt);
          if (k === 0) ctx.moveTo(pp.x, pp.y); else ctx.lineTo(pp.x, pp.y);
        }
        ctx.stroke();
        // dot
        ctx.fillStyle = col;
        ctx.beginPath();
        ctx.arc(pos.x, pos.y, size, 0, Math.PI * 2);
        ctx.fill();
        if (isHover || isSelected) {
          ctx.strokeStyle = "#0284c7";
          ctx.lineWidth = 1.5;
          ctx.beginPath();
          ctx.arc(pos.x, pos.y, size + 3, 0, Math.PI * 2);
          ctx.stroke();
        }
        // delivery burst when freshly delivered
        if (phase > 0.98 && phase < 1.08) {
          const ringT = (phase - 0.98) / 0.1;
          ctx.strokeStyle = `${col}${Math.floor((1 - ringT) * 255).toString(16).padStart(2, "0")}`;
          ctx.lineWidth = 1.5;
          ctx.beginPath();
          ctx.arc(pos.x, pos.y, size + 14 * ringT, 0, Math.PI * 2);
          ctx.stroke();
        }
      }

      rafRef.current = requestAnimationFrame(draw);
    };
    rafRef.current = requestAnimationFrame(draw);
    return () => cancelAnimationFrame(rafRef.current);
  }, [size, anchors, hoverId, selected]);

  // Hit-testing for click / hover
  const pickPacket = useCallback((x: number, y: number): Packet | null => {
    const pkts = packetsRef.current;
    const now = Date.now();
    const lifeMs = 36_000;
    let best: { p: Packet; d2: number } | null = null;
    for (const p of pkts) {
      const phase = Math.max(0, Math.min(1, (now - p.sentAt) / lifeMs));
      if (phase >= 1.15) continue;
      const a = anchors[p.srcChainId];
      const b = anchors[p.dstChainId];
      const pos = bezier(a, b, Math.min(1, phase));
      const dx = pos.x - x, dy = pos.y - y;
      const d2 = dx * dx + dy * dy;
      if (d2 < 144 && (!best || d2 < best.d2)) best = { p, d2 };
    }
    return best?.p ?? null;
  }, [anchors]);

  const onMove = useCallback((e: React.MouseEvent) => {
    const rect = (e.currentTarget as HTMLDivElement).getBoundingClientRect();
    const p = pickPacket(e.clientX - rect.left, e.clientY - rect.top);
    setHoverId(p?.guid ?? null);
  }, [pickPacket]);

  const onClick = useCallback((e: React.MouseEvent) => {
    const rect = (e.currentTarget as HTMLDivElement).getBoundingClientRect();
    const p = pickPacket(e.clientX - rect.left, e.clientY - rect.top);
    setSelected(p);
  }, [pickPacket]);

  const inFlight = useMemo(() => {
    const now = Date.now();
    return packets.filter(p => now - p.sentAt < 36_000).length;
  }, [packets]);

  return (
    <section className="panel-lg relative overflow-hidden">
      <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <h2 className="label">Cross-chain flow · LayerZero</h2>
          {demo ? <span className="chip-w">preview</span> : <span className="chip-n pulse-dot text-good">live</span>}
          {err && <span className="chip-b">{err}</span>}
        </div>
        <div className="flex items-center gap-2 text-[11px] text-muted">
          <span>{inFlight} in flight · {packets.length - inFlight} delivered</span>
        </div>
      </div>

      <div
        ref={wrapRef}
        className="relative cursor-crosshair overflow-hidden rounded-xl border border-border bg-white/70"
        style={{ height: size.h }}
        onMouseMove={onMove}
        onMouseLeave={() => setHoverId(null)}
        onClick={onClick}
      >
        <canvas ref={canvasRef} className="block" />
        {hoverId && !selected && (
          <div className="pointer-events-none absolute left-3 top-3 rounded-lg border border-border bg-white/95 px-3 py-2 text-[11px] shadow-card">
            Click a packet dot to open its OApp message.
          </div>
        )}
      </div>

      {selected && (
        <div className="mt-3 rounded-xl border border-accent/30 bg-accent/5 p-4">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div className="space-y-1">
              <div className="flex items-center gap-2">
                <span className="chip-n">OApp message</span>
                <span className="chip">{selected.kind}</span>
                <span className="chip border-border bg-white">nonce {selected.nonce}</span>
                <span
                  className="inline-flex items-center gap-1.5 rounded-full border border-border bg-white px-2.5 py-0.5 text-[11px]"
                >
                  <span className="h-2 w-2 rounded-full" style={{ background: ARCH_COLOR[selected.archetype] }} aria-hidden />
                  <span className="font-mono">{selected.archetype}</span>
                </span>
              </div>
              <p className="text-xs text-muted">
                {CHAIN_LABEL[selected.srcChainId]} (eid {selected.srcEid}) → {CHAIN_LABEL[selected.dstChainId]} (eid {selected.dstEid}) ·{" "}
                phase {(selected.phase * 100).toFixed(0)}%
              </p>
            </div>
            <button className="btn !py-1 !px-2 !text-[11px]" onClick={() => setSelected(null)}>close</button>
          </div>
          <div className="mt-3 grid gap-2 text-[11px] md:grid-cols-2">
            <div className="kv"><span className="label">guid</span><code className="ml-2 truncate text-accent">{short(selected.guid, 6)}</code></div>
            <div className="kv"><span className="label">size</span><span className="text-text">{selected.size} B</span></div>
            <div className="kv"><span className="label">sender</span><code className="ml-2 truncate text-accent">{short(selected.sender, 5)}</code></div>
            <div className="kv"><span className="label">receiver</span><code className="ml-2 truncate text-accent">{short(selected.receiver, 5)}</code></div>
            <div className="kv"><span className="label">tx src</span><code className="ml-2 truncate text-accent">{short(selected.txHashSrc, 5)}</code></div>
            <div className="kv">
              <span className="label">tx dst</span>
              {selected.txHashDst
                ? <code className="ml-2 truncate text-accent">{short(selected.txHashDst, 5)}</code>
                : <span className="ml-2 text-muted">in flight</span>}
            </div>
          </div>
        </div>
      )}

      <p className="mt-3 text-[11px] leading-relaxed text-muted">
        Each dot is a LayerZero packet emitted by the DAESOApp. Hover to preview, click to open the full message.
        In production this reads <code className="text-accent">PacketSent</code> / <code className="text-accent">PacketDelivered</code> events
        from the endpoint — this preview generator is deterministic from the minute tick.
      </p>
    </section>
  );
}
