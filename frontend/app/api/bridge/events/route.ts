// frontend/app/api/bridge/events/route.ts
// Demo feed of bridge executions when no contract address is configured.
// The UI preferentially uses a client-side viem reader, but in preview we
// return deterministic executions so the table is never empty.
import { NextResponse } from "next/server";
import { ARCHETYPES, FSM_STATES, SIGNAL_KINDS, hashSeed, rng } from "@/lib/demo/signals";

interface Execution {
  signalId: string;
  archetype: string;
  kind: string;
  pathStates: string[]; // FSM trail, e.g. ["IDLE", "SWARM_SIGNAL_RECEIVED", ...]
  finalState: string;
  txHash: string;
  block: number;
  chainId: number;
  ts: number;
  elapsedSec: number;
}

function fakeSignalId(n: number) {
  const r = rng(hashSeed(`sig-id:${n}`));
  let s = "0x";
  for (let i = 0; i < 64; i++) s += "0123456789abcdef"[(r() * 16) | 0];
  return s;
}
function fakeTxHash(n: number) {
  const r = rng(hashSeed(`tx:${n}`));
  let s = "0x";
  for (let i = 0; i < 64; i++) s += "0123456789abcdef"[(r() * 16) | 0];
  return s;
}

function demoExecutions(n: number = 16): Execution[] {
  const now = Date.now();
  const out: Execution[] = [];
  for (let i = 0; i < n; i++) {
    const r = rng(hashSeed(`exec:${Math.floor(now / 30_000) - i}`));
    const archetype = ARCHETYPES[(r() * ARCHETYPES.length) | 0];
    const kind = SIGNAL_KINDS[(r() * SIGNAL_KINDS.length) | 0];

    // Build a plausible FSM trail
    const roll = r();
    let finalIdx: number;
    if (roll < 0.70) finalIdx = 6; // EXECUTED
    else if (roll < 0.88) finalIdx = 7; // REJECTED
    else finalIdx = 5; // GUARDIAN_TIMEOUT
    const trail = [0, 1, 2, 3];
    if (finalIdx === 6) trail.push(4, 6);
    else if (finalIdx === 7) trail.push(7);
    else trail.push(4, 5);
    const pathStates = trail.map(i => FSM_STATES[i]);

    const idx = Math.floor(now / 30_000) - i;
    const chainId = (r() < 0.6) ? 8453 : 10; // Base vs Optimism
    out.push({
      signalId: fakeSignalId(idx),
      archetype,
      kind,
      pathStates,
      finalState: FSM_STATES[finalIdx],
      txHash: fakeTxHash(idx),
      block: 20_000_000 + ((r() * 200_000) | 0),
      chainId,
      ts: now - i * 30_000 - ((r() * 15_000) | 0),
      elapsedSec: 60 + ((r() * 3300) | 0),
    });
  }
  return out;
}

export async function GET() {
  return NextResponse.json({ demo: true, executions: demoExecutions() });
}
