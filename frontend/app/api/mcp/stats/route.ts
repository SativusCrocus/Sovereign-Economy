// frontend/app/api/mcp/stats/route.ts
// Returns per-archetype × per-tool MCP call counts. Upstream source is the
// MCP gateway's /stats endpoint (Prometheus-style), but on preview deploys
// it's unreachable — we fall back to a deterministic demo matrix.
import { NextResponse } from "next/server";
import { ARCHETYPES, MCP_TOOLS, toolCallMatrix } from "@/lib/demo/signals";

const GATEWAY = process.env.MCP_GATEWAY_URL ?? "https://mcp-gateway:8443";
const JWT     = process.env.MCP_JWT ?? "";
const DEMO_MODE =
  process.env.DEMO_MODE === "1" || process.env.NEXT_PUBLIC_DEMO_MODE === "1";

function demoPayload() {
  const matrix = toolCallMatrix();
  const total = matrix.flat().reduce((a, b) => a + b, 0);
  return {
    demo: true,
    archetypes: ARCHETYPES,
    tools: MCP_TOOLS,
    matrix,
    total,
    updatedAt: Date.now(),
  };
}

export async function GET() {
  if (DEMO_MODE) return NextResponse.json(demoPayload());
  try {
    const r = await fetch(`${GATEWAY}/stats/archetype_tool_calls`, {
      signal: AbortSignal.timeout(2500),
      headers: { authorization: `Bearer ${JWT}` },
    });
    if (!r.ok) return NextResponse.json(demoPayload());
    const body = await r.json() as { archetypes: string[]; tools: string[]; matrix: number[][] };
    return NextResponse.json({ demo: false, total: body.matrix.flat().reduce((a,b)=>a+b,0), ...body, updatedAt: Date.now() });
  } catch {
    return NextResponse.json(demoPayload());
  }
}
