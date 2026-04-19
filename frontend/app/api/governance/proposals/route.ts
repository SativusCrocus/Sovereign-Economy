// frontend/app/api/governance/proposals/route.ts
// Returns the current batch of DAO proposals with timelock ETAs.
// In production this reads the DAESGovernor contract; demo otherwise.
import { NextResponse } from "next/server";
import { proposals } from "@/lib/demo/cross";

export async function GET() {
  return NextResponse.json({ demo: true, proposals: proposals() });
}
