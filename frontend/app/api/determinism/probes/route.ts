// frontend/app/api/determinism/probes/route.ts
// Returns 24h of state_hash samples + a summary. Wire to the agent-swarm
// runtime's replay probe in production; demo otherwise.
import { NextResponse } from "next/server";
import { determinismSamples, determinismSummary } from "@/lib/demo/cross";

export async function GET() {
  const samples = determinismSamples();
  const summary = determinismSummary(samples);
  return NextResponse.json({ demo: true, samples, summary });
}
