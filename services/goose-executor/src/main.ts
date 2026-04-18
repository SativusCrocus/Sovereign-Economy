// services/goose-executor/src/main.ts
// Goose-style MCP client: subscribes to swarm signals via mcp-gateway,
// dispatches to one of five MCP tools, retries per spec policy.
import Fastify from "fastify";
import { loadSpec } from "./spec.ts";
import { dispatchSignal } from "./policy.ts";

const fastify = Fastify({ logger: { level: "info" } });
const spec    = await loadSpec();

fastify.get("/healthz", async () => ({ status: "ok", tools: spec.mcp_tools.map(t => t.name) }));

fastify.post("/swarm-signal", async (req, reply) => {
  const signal = req.body as { kind: "BUY" | "SELL" | "HOLD" | "ESCALATE_TO_GUARDIAN"; payload: unknown };
  const result = await dispatchSignal(spec, signal);
  return reply.send(result);
});

await fastify.listen({ host: "0.0.0.0", port: 9200 });
