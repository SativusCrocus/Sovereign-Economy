// frontend/app/api/signals/stream/route.ts
// Server-sent events endpoint for the live signal ticker.
//   - If DEMO_MODE or the upstream agent-swarm-runtime is unreachable,
//     emits deterministic demo signals ~every 1.6s.
//   - Otherwise tries to proxy upstream SSE; falls back to demo on error.
// The caller sees `demo: boolean` in every frame.
import type { NextRequest } from "next/server";
import { signalAt } from "@/lib/demo/signals";

const AGENT_SWARM_URL = process.env.AGENT_SWARM_URL ?? "http://agent-swarm-runtime:9100";
const DEMO_MODE =
  process.env.DEMO_MODE === "1" || process.env.NEXT_PUBLIC_DEMO_MODE === "1";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

function sseEncode(event: string, data: unknown) {
  return `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`;
}

export async function GET(req: NextRequest) {
  const url = new URL(req.url);
  const forceDemo = DEMO_MODE || url.searchParams.get("demo") === "1";

  const encoder = new TextEncoder();

  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      let closed = false;
      let tick = Math.floor(Date.now() / 1000);

      const send = (event: string, data: unknown) => {
        if (closed) return;
        try { controller.enqueue(encoder.encode(sseEncode(event, data))); }
        catch { closed = true; }
      };

      req.signal.addEventListener("abort", () => {
        closed = true;
        try { controller.close(); } catch {}
      });

      send("hello", { demo: forceDemo, ts: Date.now() });

      // Attempt real upstream first, unless forced into demo mode.
      if (!forceDemo) {
        try {
          const res = await fetch(`${AGENT_SWARM_URL}/signals/stream`, {
            signal: AbortSignal.timeout(2500),
            headers: { accept: "text/event-stream" },
          });
          if (res.ok && res.body) {
            const reader = res.body.getReader();
            while (!closed) {
              const { done, value } = await reader.read();
              if (done) break;
              try { controller.enqueue(value); } catch { closed = true; break; }
            }
            if (!closed) { closed = true; try { controller.close(); } catch {} }
            return;
          }
        } catch {
          // fall through to demo
        }
      }

      // Demo stream: emit a fresh signal every 1.6s.
      send("mode", { demo: true });
      while (!closed) {
        const sig = signalAt(tick, Date.now());
        send("signal", { demo: true, ...sig });
        tick++;
        await new Promise(r => setTimeout(r, 1600));
      }
      try { controller.close(); } catch {}
    },
  });

  return new Response(stream, {
    headers: {
      "content-type": "text/event-stream; charset=utf-8",
      "cache-control": "no-cache, no-transform",
      connection: "keep-alive",
      "x-accel-buffering": "no",
    },
  });
}
