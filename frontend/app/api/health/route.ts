// frontend/app/api/health/route.ts
// Aggregates health checks for the 4 DAES services. Keeps raw service
// URLs on the server side; browser just hits /api/health.
import { NextRequest, NextResponse } from "next/server";

const SERVICES = {
  "agent-swarm-runtime":  process.env.AGENT_SWARM_URL  ?? "http://agent-swarm-runtime:9100",
  "goose-executor":       process.env.GOOSE_URL        ?? "http://goose-executor:9200",
  "mcp-gateway":          process.env.MCP_GATEWAY_URL  ?? "https://mcp-gateway:8443",
  "rag-ingester":         process.env.RAG_INGESTER_URL ?? "http://rag-ingester:9300",
} as const;

export async function GET(req: NextRequest) {
  const single = req.nextUrl.searchParams.get("u");
  const targets = single ? { custom: single } : SERVICES;

  const results = await Promise.all(
    Object.entries(targets).map(async ([name, url]) => {
      try {
        const r = await fetch(`${url}/healthz`, { signal: AbortSignal.timeout(3000), cache: "no-store" });
        if (!r.ok) return { name, url, ok: false, error: `status ${r.status}` };
        return { name, url, ok: true, body: await r.json() };
      } catch (e) {
        return { name, url, ok: false, error: (e as Error).message };
      }
    }),
  );
  return NextResponse.json({ services: results });
}
