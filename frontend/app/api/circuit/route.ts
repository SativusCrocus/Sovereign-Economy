// frontend/app/api/circuit/route.ts
// Returns current circuit-breaker state. Priority:
//   1. On-chain read via viem — ONLY if NEXT_PUBLIC_CIRCUIT_BREAKER_ADDRESS is set.
//   2. Deterministic demo otherwise (marked `demo: true`).
// Keeping this server-side means we can expand to multi-chain without
// rewiring the browser — the widget just polls /api/circuit.
import { NextResponse } from "next/server";
import { circuitState } from "@/lib/demo/signals";

const DEMO_MODE =
  process.env.DEMO_MODE === "1" || process.env.NEXT_PUBLIC_DEMO_MODE === "1";

export async function GET() {
  if (DEMO_MODE) {
    return NextResponse.json({ demo: true, ...circuitState() });
  }
  // For now we don't have a server-side viem client; the widget itself
  // does on-chain reads when a wallet is connected. This endpoint only
  // serves demo data, which is the expected behaviour on Vercel.
  return NextResponse.json({ demo: true, ...circuitState() });
}
