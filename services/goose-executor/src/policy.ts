// services/goose-executor/src/policy.ts
import { request } from "undici";
import type { DaesSpec } from "./spec.ts";

type SignalKind = "BUY" | "SELL" | "HOLD" | "ESCALATE_TO_GUARDIAN";

const GATEWAY = process.env.MCP_GATEWAY_URL ?? "https://mcp-gateway:8443";
const JWT     = process.env.MCP_JWT ?? "";

export async function dispatchSignal(spec: DaesSpec, signal: { kind: SignalKind; payload: unknown }) {
  switch (signal.kind) {
    case "HOLD":
      return { accepted: true, reason: "HOLD — no action" };
    case "ESCALATE_TO_GUARDIAN":
      return callTool(spec, "audit_log_write", { subject: "guardian", event_type: "escalation", payload: signal.payload });
    case "BUY":
    case "SELL":
      return callTool(spec, "contract_call_simulate", signal.payload);
  }
}

export async function callTool(spec: DaesSpec, name: string, params: unknown) {
  const tool = spec.mcp_tools.find(t => t.name === name);
  if (!tool) throw new Error(`unknown tool: ${name}`);
  const { policy, base_ms, max_attempts, jitter } = tool.retry;

  let attempt = 0;
  let delay = base_ms;
  // eslint-disable-next-line no-constant-condition
  while (true) {
    attempt++;
    try {
      const res = await request(`${GATEWAY}/tools/${name}`, {
        method: "POST",
        headers: { "content-type": "application/json", authorization: `Bearer ${JWT}` },
        body: JSON.stringify(params),
        bodyTimeout: tool.max_latency_ms,
        headersTimeout: tool.max_latency_ms,
      });
      if (res.statusCode >= 500) throw new Error(`upstream ${res.statusCode}`);
      return await res.body.json();
    } catch (err) {
      if (attempt >= max_attempts) throw err;
      if (policy === "exponential") delay *= 2;
      const j = jitter ? Math.random() * 0.3 * delay : 0;
      await new Promise(r => setTimeout(r, delay + j));
    }
  }
}
