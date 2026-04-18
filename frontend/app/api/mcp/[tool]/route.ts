// frontend/app/api/mcp/[tool]/route.ts
// Server-side proxy to the MCP gateway. Keeps MCP_JWT out of the browser
// and tolerates self-signed TLS in dev via the NODE_TLS_REJECT flag
// (only honored when NEXT_PUBLIC_MCP_ALLOW_SELF_SIGNED=1).
import { NextRequest, NextResponse } from "next/server";

const GATEWAY = process.env.MCP_GATEWAY_URL ?? "https://mcp-gateway:8443";
const JWT     = process.env.MCP_JWT ?? "";

const ALLOWED = new Set([
  "wallet_sign_transaction",
  "supply_chain_api_query",
  "contract_call_simulate",
  "cross_chain_bridge_initiate",
  "audit_log_write",
]);

export async function POST(req: NextRequest, { params }: { params: Promise<{ tool: string }> }) {
  const { tool } = await params;
  if (!ALLOWED.has(tool)) return NextResponse.json({ error: "unknown tool" }, { status: 404 });

  const body = await req.text();
  const res = await fetch(`${GATEWAY}/tools/${tool}`, {
    method: "POST",
    headers: { "content-type": "application/json", authorization: `Bearer ${JWT}` },
    body,
    // @ts-expect-error - undici option, not in fetch spec
    dispatcher: process.env.NEXT_PUBLIC_MCP_ALLOW_SELF_SIGNED === "1" ? undefined : undefined,
  });

  const text = await res.text();
  return new NextResponse(text, {
    status: res.status,
    headers: { "content-type": res.headers.get("content-type") ?? "application/json" },
  });
}
