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

const DEMO_MODE = process.env.DEMO_MODE === "1" || process.env.NEXT_PUBLIC_DEMO_MODE === "1";

// Deterministic fake response used on Vercel / demo deploys where the DAES
// backend isn't reachable from the public internet. Marked demo=true so the
// UI can show a "preview" chip and the data isn't mistaken for a real probe.
function demoResponse() {
  return NextResponse.json({
    demo: true,
    services: [
      { name: "agent-swarm-runtime", url: "demo://preview", ok: true, body: { status: "ok", agents: 1000, quorum: 0.74 } },
      { name: "goose-executor",      url: "demo://preview", ok: true, body: { status: "ok", mcp_calls_total: 18342 } },
      { name: "mcp-gateway",         url: "demo://preview", ok: true, body: { status: "ok", tools: 5 } },
      { name: "rag-ingester",        url: "demo://preview", ok: true, body: { status: "ok", indexed_docs: 124_891 } },
    ],
  });
}

export async function GET(req: NextRequest) {
  if (DEMO_MODE) return demoResponse();

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
