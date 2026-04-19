// frontend/components/HealthCard.tsx
"use client";
import { useEffect, useState } from "react";

interface ServiceHealth { name: string; url: string; ok: boolean; body?: unknown; error?: string }
interface HealthResponse { services: ServiceHealth[]; demo?: boolean }

export function HealthCard() {
  const [data, setData] = useState<HealthResponse | null>(null);
  const [err, setErr]   = useState<string | null>(null);
  const [lastUpdate, setLastUpdate] = useState<Date | null>(null);

  useEffect(() => {
    let cancelled = false;
    const tick = async () => {
      try {
        const r = await fetch("/api/health", { cache: "no-store" });
        if (!r.ok) throw new Error(`status ${r.status}`);
        const body = await r.json() as HealthResponse;
        if (!cancelled) { setData(body); setErr(null); setLastUpdate(new Date()); }
      } catch (e) { if (!cancelled) setErr((e as Error).message); }
    };
    tick();
    const id = setInterval(tick, 10_000);
    return () => { cancelled = true; clearInterval(id); };
  }, []);

  const services  = data?.services ?? null;
  const okCount   = services?.filter(s => s.ok).length ?? 0;
  const total     = services?.length ?? 0;
  const allOk     = total > 0 && okCount === total;
  const someDown  = total > 0 && okCount < total;

  return (
    <section className="panel">
      <div className="mb-3 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <h2 className="label">Service health</h2>
          {data?.demo && <span className="chip-w">preview</span>}
        </div>
        <div className="flex items-center gap-2 text-[11px] text-muted">
          {services && (
            <span className={allOk ? "chip-ok" : someDown ? "chip-w" : "chip-b"}>
              {okCount} / {total} ok
            </span>
          )}
          {lastUpdate && <span>updated {lastUpdate.toLocaleTimeString()}</span>}
        </div>
      </div>
      {err && <p className="text-bad text-sm">{err}</p>}
      {!services && !err && (
        <div className="grid grid-cols-2 gap-2 md:grid-cols-4">
          {Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="h-10 animate-pulse rounded-md border border-border bg-white/40" />
          ))}
        </div>
      )}
      {services && (
        <ul className="grid grid-cols-2 gap-2 md:grid-cols-4">
          {services.map(s => (
            <li key={s.name} className="kv">
              <span className="truncate text-text">{s.name}</span>
              <span
                className={s.ok ? "chip-ok" : "chip-b"}
                title={s.error ?? (typeof s.body === "string" ? s.body : JSON.stringify(s.body))}
              >
                {s.ok ? "ok" : "down"}
              </span>
            </li>
          ))}
        </ul>
      )}
      {data?.demo && (
        <p className="mt-3 text-[11px] leading-relaxed text-muted">
          This deploy runs on Vercel without a reachable DAES backend, so health probes return a deterministic sample.
          Run <code className="text-accent">docker compose up</code> locally to see real probes on <code className="text-accent">localhost:3001</code>.
        </p>
      )}
    </section>
  );
}
