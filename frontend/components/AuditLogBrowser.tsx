// frontend/components/AuditLogBrowser.tsx
// Filterable table of the recent IPFS-pinned audit entries.
// Features: subject + event-type filters, free-text search, one-click
// gateway link, inline decoded-payload preview.
"use client";

import { useEffect, useMemo, useState } from "react";

interface Entry {
  cid: string;
  ts: number;
  subject: string;
  event_type: string;
  size: number;
  pinners: string[];
  sizeClass: "small" | "medium" | "large";
  sampler: string;
}

interface IndexResp { demo: boolean; entries: Entry[] }
interface PreviewResp { demo: boolean; entry: Entry; payload: unknown }

function fmtBytes(n: number) {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  return `${(n / 1024 / 1024).toFixed(2)} MB`;
}

function fmtAgo(ts: number) {
  const s = (Date.now() - ts) / 1000;
  if (s < 60) return `${Math.floor(s)}s`;
  if (s < 3600) return `${Math.floor(s / 60)}m`;
  if (s < 86400) return `${Math.floor(s / 3600)}h`;
  return new Date(ts).toLocaleDateString();
}

function short(s: string, n = 10) {
  if (s.length <= n * 2 + 3) return s;
  return `${s.slice(0, n)}…${s.slice(-n)}`;
}

export function AuditLogBrowser() {
  const [data, setData] = useState<IndexResp | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [subject, setSubject] = useState<string>("all");
  const [eventType, setEventType] = useState<string>("all");
  const [query, setQuery] = useState<string>("");
  const [selected, setSelected] = useState<Entry | null>(null);
  const [preview, setPreview] = useState<PreviewResp | null>(null);
  const [loadingPreview, setLoadingPreview] = useState(false);

  const gateway = process.env.NEXT_PUBLIC_IPFS_HTTP_GATEWAY ?? "https://cloudflare-ipfs.com/ipfs";

  useEffect(() => {
    let cancelled = false;
    const tick = async () => {
      try {
        const r = await fetch("/api/audit/log", { cache: "no-store" });
        if (!r.ok) throw new Error(`status ${r.status}`);
        const body = await r.json() as IndexResp;
        if (!cancelled) { setData(body); setErr(null); }
      } catch (e) { if (!cancelled) setErr((e as Error).message); }
    };
    tick();
    const id = setInterval(tick, 30_000);
    return () => { cancelled = true; clearInterval(id); };
  }, []);

  const entries = data?.entries ?? [];
  const subjects = useMemo(() => Array.from(new Set(entries.map(e => e.subject))).sort(), [entries]);
  const eventTypes = useMemo(() => Array.from(new Set(entries.map(e => e.event_type))).sort(), [entries]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return entries.filter(e => {
      if (subject !== "all" && e.subject !== subject) return false;
      if (eventType !== "all" && e.event_type !== eventType) return false;
      if (!q) return true;
      return (
        e.cid.toLowerCase().includes(q) ||
        e.subject.toLowerCase().includes(q) ||
        e.event_type.toLowerCase().includes(q) ||
        e.sampler.toLowerCase().includes(q)
      );
    });
  }, [entries, subject, eventType, query]);

  async function openEntry(entry: Entry) {
    setSelected(entry);
    setPreview(null);
    setLoadingPreview(true);
    try {
      const r = await fetch(`/api/audit/log?cid=${encodeURIComponent(entry.cid)}`, { cache: "no-store" });
      if (!r.ok) throw new Error(`status ${r.status}`);
      const body = await r.json() as PreviewResp;
      setPreview(body);
    } catch (e) { setErr((e as Error).message); }
    finally { setLoadingPreview(false); }
  }

  return (
    <section className="panel-lg space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <h2 className="label">IPFS audit log · browser</h2>
          {data && (data.demo ? <span className="chip-w">preview</span> : <span className="chip-n pulse-dot text-good">live</span>)}
          {err && <span className="chip-b">{err}</span>}
        </div>
        {data && (
          <span className="text-[11px] text-muted">
            {filtered.length} / {entries.length} entries
          </span>
        )}
      </div>

      {/* Filters */}
      <div className="grid gap-2 md:grid-cols-[1fr_180px_200px]">
        <input
          className="input"
          placeholder="search · cid / subject / event / sampler"
          value={query}
          onChange={e => setQuery(e.target.value)}
        />
        <select className="input" value={subject} onChange={e => setSubject(e.target.value)}>
          <option value="all">all subjects</option>
          {subjects.map(s => <option key={s} value={s}>{s}</option>)}
        </select>
        <select className="input" value={eventType} onChange={e => setEventType(e.target.value)}>
          <option value="all">all event types</option>
          {eventTypes.map(t => <option key={t} value={t}>{t}</option>)}
        </select>
      </div>

      {!data && !err && (
        <div className="space-y-2">
          {Array.from({ length: 6 }).map((_, i) => (
            <div key={i} className="h-10 animate-pulse rounded-md border border-border bg-white/40" />
          ))}
        </div>
      )}

      {data && filtered.length === 0 && (
        <p className="py-6 text-center text-xs text-muted">No entries match the current filters.</p>
      )}

      {data && filtered.length > 0 && (
        <div className="overflow-x-auto">
          <table className="min-w-full text-left text-[11px]">
            <thead className="text-muted">
              <tr className="border-b border-border">
                <th className="py-2 pr-3 font-mono">subject</th>
                <th className="py-2 pr-3 font-mono">event</th>
                <th className="py-2 pr-3 font-mono">cid</th>
                <th className="py-2 pr-3 font-mono">sampler</th>
                <th className="py-2 pr-3 font-mono">size</th>
                <th className="py-2 pr-3 font-mono">pinners</th>
                <th className="py-2 pr-0 text-right font-mono">when</th>
              </tr>
            </thead>
            <tbody className="font-mono">
              {filtered.map(e => (
                <tr
                  key={e.cid}
                  onClick={() => openEntry(e)}
                  className={
                    "cursor-pointer border-b border-border/60 transition-colors hover:bg-accent/5 " +
                    (selected?.cid === e.cid ? "bg-accent/10" : "")
                  }
                >
                  <td className="py-2 pr-3 text-text">{e.subject}</td>
                  <td className="py-2 pr-3 text-accent">{e.event_type}</td>
                  <td className="py-2 pr-3 text-muted" title={e.cid}>{short(e.cid, 10)}</td>
                  <td className="py-2 pr-3 text-text">{e.sampler}</td>
                  <td className="py-2 pr-3 text-muted">{fmtBytes(e.size)}</td>
                  <td className="py-2 pr-3 text-muted">{e.pinners.join(", ")}</td>
                  <td className="py-2 pr-0 text-right text-muted">{fmtAgo(e.ts)} ago</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Preview drawer */}
      {selected && (
        <div className="mt-2 rounded-xl border border-accent/30 bg-accent/5 p-4">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div className="space-y-1">
              <div className="flex items-center gap-2">
                <span className="chip-n">{selected.subject}</span>
                <span className="chip">{selected.event_type}</span>
                <span className="chip">{fmtBytes(selected.size)}</span>
              </div>
              <p className="break-all font-mono text-[11px] text-accent">{selected.cid}</p>
              <p className="text-[11px] text-muted">
                sampler · {selected.sampler} · {new Date(selected.ts).toLocaleString()}
              </p>
            </div>
            <div className="flex items-center gap-2">
              <a
                className="btn !py-1 !px-2 !text-[11px]"
                href={`${gateway}/${selected.cid}`}
                target="_blank"
                rel="noreferrer"
              >
                open in gateway ↗
              </a>
              <button className="btn !py-1 !px-2 !text-[11px]" onClick={() => { setSelected(null); setPreview(null); }}>close</button>
            </div>
          </div>
          {loadingPreview && (
            <div className="mt-3 h-20 animate-pulse rounded-md border border-border bg-white/60" />
          )}
          {preview && (
            <pre className="mt-3 max-h-72 overflow-auto rounded-lg border border-border bg-white/80 p-3 text-[11px] leading-relaxed">
{JSON.stringify(preview.payload, null, 2)}
            </pre>
          )}
        </div>
      )}
    </section>
  );
}
