// frontend/app/audit/page.tsx
"use client";
import { useState } from "react";
import { callTool } from "@/lib/mcp";

interface AuditWriteResult { cid: string; pinned_by: string[] }

export default function AuditPage() {
  const [cid, setCid] = useState("");
  const [fetched, setFetched] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);

  const [subject, setSubject] = useState("operator-console");
  const [eventType, setEventType] = useState("manual-entry");
  const [payload, setPayload] = useState(`{"note":"hello"}`);
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
    <div className="space-y-4">
      <h1 className="text-2xl font-bold tracking-tight">Audit log</h1>

      <section className="panel space-y-3">
        <h2 className="label">Write</h2>
        <div className="grid grid-cols-2 gap-3">
          <label className="block"><span className="label">subject</span><input className="input" value={subject} onChange={e => setSubject(e.target.value)} /></label>
          <label className="block"><span className="label">event_type</span><input className="input" value={eventType} onChange={e => setEventType(e.target.value)} /></label>
          <label className="col-span-2 block">
            <span className="label">payload (JSON)</span>
            <textarea className="input min-h-24" value={payload} onChange={e => setPayload(e.target.value)} />
          </label>
        </div>
        <button className="btn-p" disabled={busy} onClick={writeLog}>{busy ? "Pinning…" : "Write + pin"}</button>
        {writeResult && (
          <div className="text-xs space-y-1">
            <div><span className="label mr-2">cid</span><code className="text-accent break-all">{writeResult.cid}</code></div>
            <div><span className="label mr-2">pinned_by</span><span className="text-accent">{writeResult.pinned_by.join(", ")}</span></div>
          </div>
        )}
      </section>

      <section className="panel space-y-3">
        <h2 className="label">Read</h2>
        <div className="flex gap-2">
          <input className="input flex-1" placeholder="bafybei…" value={cid} onChange={e => setCid(e.target.value)} />
          <button className="btn" disabled={!cid} onClick={fetchFromIpfs}>Fetch</button>
        </div>
        {fetched && (
          <pre className="max-h-80 overflow-auto rounded-md border border-border bg-bg p-2 text-xs">{fetched}</pre>
        )}
      </section>

      {err && <section className="panel text-bad text-sm">error: {err}</section>}
      <p className="text-xs text-muted">Read path uses a public IPFS HTTP gateway ({gateway}). Production deployments should host a private gateway to avoid leaking CID access patterns.</p>
    </div>
  );
}
