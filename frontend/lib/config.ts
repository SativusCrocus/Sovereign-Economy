// frontend/lib/config.ts
import { base, optimism, hardhat, type Chain } from "wagmi/chains";

export const SUPPORTED_CHAINS: readonly [Chain, ...Chain[]] = [base, optimism, hardhat];

export const MCP_GATEWAY_URL = process.env.NEXT_PUBLIC_MCP_GATEWAY_URL ?? "https://localhost:8443";
export const GRAFANA_URL     = process.env.NEXT_PUBLIC_GRAFANA_URL     ?? "http://localhost:3000";

// ERC-4337 v0.7 EntryPoint (same on Base and Optimism).
export const ENTRYPOINT_V07 = "0x0000000071727De22E5E9d8BAf0edAc6f37da032" as const;
// LayerZero V2 endpoint (same address on Base and Optimism mainnet).
export const LZ_ENDPOINT_V2 = "0x1a44076050125825900e736c501f859c50fE728c" as const;
export const LZ_EID = { [base.id]: 30184, [optimism.id]: 30111, [hardhat.id]: 0 } as const;

export interface DaesAddresses {
  governor:           `0x${string}`;
  bridgeExecutor:     `0x${string}`;
  circuitBreaker:     `0x${string}`;
  guardianTimelock:   `0x${string}`;
  swarmOracle:        `0x${string}`;
  agentAccountFactory:`0x${string}`;
  daesOApp:           `0x${string}`;
}

/** Populate per-chain after running contracts/scripts/deploy-local.ts. */
export const ADDRESSES: Record<number, Partial<DaesAddresses>> = {
  [base.id]: {},
  [optimism.id]: {},
  [hardhat.id]: {},
};

export const ARCHETYPES = [
  { id: 0, name: "Speculator" },
  { id: 1, name: "Arbitrageur" },
  { id: 2, name: "Sovereign" },
  { id: 3, name: "MarketMaker" },
  { id: 4, name: "BlackSwan" },
] as const;

export const SIGNAL_KINDS = ["BUY", "SELL", "HOLD", "ESCALATE_TO_GUARDIAN"] as const;
export const FSM_STATES = [
  "IDLE", "SWARM_SIGNAL_RECEIVED", "SIGNAL_VALIDATED", "THRESHOLD_CHECK",
  "MULTI_SIG_STAGED", "GUARDIAN_TIMEOUT", "EXECUTED", "REJECTED",
] as const;
