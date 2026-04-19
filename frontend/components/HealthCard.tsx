// frontend/components/HealthCard.tsx
"use client";
import { useEffect, useState } from "react";

interface ServiceHealth { name: string; url: string; ok: boolean; body?: unknown; error?: string }

export function HealthCard() {
  const [data, setData] = useState<ServiceHealth[] | null>(null);
  const [err, setErr]   = useState<string | null>(null);
  const [lastUpdate, setLastUpdate] = useState<Date | null>(null);

  useEffect(() => {
    let cancelled = false;
    const tick = async () => {
      try {
        const r = await fetch("/api/health", { cache: "no-store" });
        if (!r.ok) throw new Error(`status ${r.status}`);
        const body = await r.json();
        if (!cancelled) { setData(body.services); setErr(null); setLastUpdate(new Date()); }
      } catch (e) { if (!cancelled) setErr((e as Error).message); }
    };
    tick();
    const id = setInterval(tick, 10_000);
    return () => { cancelled = true; clearInterval(id); };
  }, []);

  const okCount   = data?.filter(s => s.ok).length ?? 0;
  const total     = data?.length ?? 0;
  const allOk     = total > 0 && okCount === total;
  const someDown  = total > 0 && okCount < total;

  return (
    <section className="panel">
      <div className="mb-3 flex items-center justify-between">
        <h2 className="label">Service health</h2>
        <div className="flex items-center gap-2 text-[11px] text-muted">
          {data && (
            <span className={allOk ? "chip-ok" : someDown ? "chip-w" : "chip-b"}>
              {okCount} / {total} ok
            </span>
          )}
          {lastUpdate && <span>updated {lastUpdate.toLocaleTimeString()}</span>}
        </div>
      </div>
      {err && <p className="text-bad text-sm">{err}</p>}
      {!data && !err && (
        <div className="grid grid-cols-2 gap-2 md:grid-cols-4">
          {Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="h-10 animate-pulse rounded-md border border-border bg-bg/40" />
          ))}
        </div>
      )}
      {data && (
        <ul className="grid grid-cols-2 gap-2 md:grid-cols-4">
          {data.map(s => (
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
    </section>
  );
}
