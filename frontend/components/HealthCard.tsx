// frontend/components/HealthCard.tsx
"use client";
import { useEffect, useState } from "react";

interface ServiceHealth { name: string; url: string; ok: boolean; body?: unknown; error?: string }

export function HealthCard() {
  const [data, setData] = useState<ServiceHealth[] | null>(null);
  const [err, setErr]   = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    const tick = async () => {
      try {
        const r = await fetch("/api/health", { cache: "no-store" });
        if (!r.ok) throw new Error(`status ${r.status}`);
        const body = await r.json();
        if (!cancelled) { setData(body.services); setErr(null); }
      } catch (e) { if (!cancelled) setErr((e as Error).message); }
    };
    tick();
    const id = setInterval(tick, 10_000);
    return () => { cancelled = true; clearInterval(id); };
  }, []);

  return (
    <section className="panel">
      <h2 className="label mb-3">Service health</h2>
      {err && <p className="text-bad text-sm">{err}</p>}
      {!data && !err && <p className="text-muted text-sm">Loading…</p>}
      <ul className="grid grid-cols-2 gap-2 md:grid-cols-4">
        {data?.map(s => (
          <li key={s.name} className="flex items-center justify-between rounded-md border border-border px-3 py-2">
            <span className="text-sm">{s.name}</span>
            <span className={s.ok ? "chip-ok" : "chip-b"} title={s.error ?? JSON.stringify(s.body)}>
              {s.ok ? "ok" : "down"}
            </span>
          </li>
        ))}
      </ul>
    </section>
  );
}
