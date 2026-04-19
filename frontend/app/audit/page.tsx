// frontend/app/audit/page.tsx
"use client";
import { useState } from "react";
import { callTool } from "@/lib/mcp";
import { AuditLogBrowser } from "@/components/AuditLogBrowser";

interface AuditWriteResult { cid: string; pinned_by: string[] }

export default function AuditPage() {
  const [cid, setCid] = useState("");
  const [fetched, setFetched] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);

  const [subject, setSubject]     = useState("operator-console");
  const [eventType, setEventType] = useState("manual-entry");
  const [payload, setPayload]     = useState(`{"note":"hello"}`);
  const [writeResult, setWriteResult] = useState<AuditWriteResult | null>(null);
  const [busy, setBusy] = useState(false);

  const gateway = process.env.NEXT_PUBLIC_IPFS_HTTP_GATEWAY ?? "https://cloudflare-ipfs.com/ipfs";

  async function fetchFromIpfs() {
    setErr(null); setFetched(null);
    try {
      const r = await fetch(`${gateway}/${cid}`);
      if (!r.ok) throw new Error(`status ${r.status}`);
      setFetched(await r.text());
    } catch (e) { setErr((e as Error).message); }
  }

  async function writeLog() {
    setBusy(true); setErr(null); setWriteResult(null);
    try {
      let parsed: unknown;
      try { parsed = JSON.parse(payload); }
      catch { throw new Error("payload must be valid JSON"); }
      const res = await callTool<{ result: AuditWriteResult }>(
        "audit_log_write",
        { subject, event_type: eventType, payload: parsed },
      );
      setWriteResult(res.result);
    } catch (e) { setErr((e as Error).message); }
    finally { setBusy(false); }
  }

  return (
    <div className="space-y-10">
      <header className="space-y-3">
        <div className="flex items-center gap-2">
          <span className="chip border-magenta/40 text-magenta bg-magenta/10">layer 2 · IPFS</span>
          <span className="chip">immutable</span>
        </div>
        <h1 className="heading">Audit log</h1>
        <p className="subheading">
          Write immutable operator entries to IPFS, pinned across multiple providers. Fetch any historical entry by its CID through a public gateway.
        </p>
      </header>

      <section className="panel-lg space-y-5">
        <h2 className="label">Write + pin</h2>
        <div className="grid gap-4 md:grid-cols-2">
          <label className="block">
            <span className="label">subject</span>
            <input className="input mt-1.5" value={subject} onChange={e => setSubject(e.target.value)} />
          </label>
          <label className="block">
            <span className="label">event_type</span>
            <input className="input mt-1.5" value={eventType} onChange={e => setEventType(e.target.value)} />
          </label>
          <label className="md:col-span-2 block">
            <span className="label">payload · JSON</span>
            <textarea
              className="input mt-1.5 min-h-32 font-mono"
              value={payload}
              onChange={e => setPayload(e.target.value)}
            />
          </label>
        </div>
        <button className="btn-p sheen" disabled={busy} onClick={writeLog}>
          {busy ? "Pinning…" : "Write + pin"}
        </button>
        {writeResult && (
          <div className="mt-3 space-y-2 text-xs">
            <div className="kv"><span className="label">cid</span><code className="ml-3 truncate text-accent">{writeResult.cid}</code></div>
            <div className="kv"><span className="label">pinned_by</span><span className="ml-3 text-accent">{writeResult.pinned_by.join(", ")}</span></div>
          </div>
        )}
      </section>

      <AuditLogBrowser />

      <section className="panel-lg space-y-5">
        <h2 className="label">Read by CID</h2>
        <div className="flex gap-2">
          <input
            className="input flex-1"
            placeholder="bafybei…"
            value={cid}
            onChange={e => setCid(e.target.value)}
          />
          <button className="btn" disabled={!cid} onClick={fetchFromIpfs}>Fetch</button>
        </div>
        {fetched && (
          <pre className="max-h-80 overflow-auto rounded-lg border border-border bg-bg/60 p-4 text-[11px] leading-relaxed">
{fetched}
          </pre>
        )}
        <p className="text-xs text-muted">
          Read path uses a public IPFS HTTP gateway — <code className="text-accent">{gateway}</code>.
          Production deployments should host a private gateway to avoid leaking CID access patterns.
        </p>
      </section>

      {err && (
        <section className="panel text-sm text-bad" style={{ borderColor: "rgba(248,113,113,0.4)" }}>
          error: {err}
        </section>
      )}
    </div>
  );
}
