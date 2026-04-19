// frontend/app/api/lz/packets/route.ts
// Returns the current window of in-flight + recently-delivered LayerZero
// packets between Base and Optimism. Demo-only for now — production would
// read the LayerZero `PacketSent` / `PacketDelivered` events off the
// DAES OApp.
import { NextResponse } from "next/server";
import { lzPackets } from "@/lib/demo/cross";

export async function GET() {
  return NextResponse.json({ demo: true, packets: lzPackets(), generatedAt: Date.now() });
}
