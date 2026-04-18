// frontend/lib/mcp.ts
// Browser client for the MCP gateway. Always goes through /api/mcp/[tool]
// so we never leak the JWT to the browser and we consolidate TLS cert
// handling (self-signed in dev) on the server.
export type ToolName =
  | "wallet_sign_transaction"
  | "supply_chain_api_query"
  | "contract_call_simulate"
  | "cross_chain_bridge_initiate"
  | "audit_log_write";

export async function callTool<T = unknown>(tool: ToolName, payload: unknown): Promise<T> {
  const res = await fetch(`/api/mcp/${tool}`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(payload),
  });
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`mcp ${tool} → ${res.status}: ${text}`);
  }
  return (await res.json()) as T;
}

export async function healthcheck(serviceUrl: string): Promise<{ ok: boolean; body?: unknown; error?: string }> {
  try {
    const r = await fetch(`/api/health?u=${encodeURIComponent(serviceUrl)}`, { cache: "no-store" });
    if (!r.ok) return { ok: false, error: `status ${r.status}` };
    return { ok: true, body: await r.json() };
  } catch (e) {
    return { ok: false, error: (e as Error).message };
  }
}
