// frontend/app/api/audit/log/route.ts
// List/browse/preview interface for the IPFS audit-log index.
// GET /api/audit/log                -> list { entries, demo }
// GET /api/audit/log?cid=<cid>      -> preview decoded payload for one entry
// In production this wraps the RAG ingester's pin index. Demo otherwise.
import { NextRequest, NextResponse } from "next/server";
import { auditIndex, auditPreview } from "@/lib/demo/cross";

export async function GET(req: NextRequest) {
  const cid = req.nextUrl.searchParams.get("cid");
  const entries = auditIndex();
  if (cid) {
    const entry = entries.find(e => e.cid === cid);
    if (!entry) return NextResponse.json({ error: "unknown cid" }, { status: 404 });
    return NextResponse.json({ demo: true, entry, payload: auditPreview(entry) });
  }
  return NextResponse.json({ demo: true, entries });
}
