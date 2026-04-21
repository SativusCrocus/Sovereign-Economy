// contracts/scripts/chains.ts
// Per-chain deploy config. Centralized so deploy.ts and set-peers.ts
// share the same source of truth. LZ V2 endpoints are *network-wide*
// (one per chain); EIDs are how the endpoint addresses a peer chain.
//
// Sources:
//   LZ V2 endpoint list  https://docs.layerzero.network/v2/deployments
//   4337 EntryPoint      https://docs.stackup.sh/docs/entrypoint-and-account

export type ChainKind = "mainnet" | "testnet" | "local";

export interface ChainConfig {
  name: string;
  kind: ChainKind;
  chainId: number;
  lzEndpoint: string; // ILayerZeroEndpointV2 address on this chain
  lzEid: number;      // this chain's EID (used by peers as dstEid)
  entryPoint: string; // ERC-4337 v0.7 canonical singleton (same on every chain)
  /** EID of the cross-chain peer this deployment should call setPeer for. */
  peerEid: number;
}

export const ENTRY_POINT_V07 = "0x0000000071727De22E5E9d8BAf0edAc6f37da032";

export const LZ_ENDPOINT_MAINNET = "0x1a44076050125825900e736c501f859c50fE728c";
export const LZ_ENDPOINT_TESTNET = "0x6EDCE65403992e310A62460808c4b910D972f10f";

export const CHAINS: Record<string, ChainConfig> = {
  // Mainnets (Tier 4 — gated behind DAES_ALLOW_MAINNET=1)
  base: {
    name: "Base",
    kind: "mainnet",
    chainId: 8453,
    lzEndpoint: LZ_ENDPOINT_MAINNET,
    lzEid: 30184,
    entryPoint: ENTRY_POINT_V07,
    peerEid: 30111, // Optimism mainnet
  },
  optimism: {
    name: "Optimism",
    kind: "mainnet",
    chainId: 10,
    lzEndpoint: LZ_ENDPOINT_MAINNET,
    lzEid: 30111,
    entryPoint: ENTRY_POINT_V07,
    peerEid: 30184, // Base mainnet
  },

  // Testnets (Tier 2)
  baseSepolia: {
    name: "Base Sepolia",
    kind: "testnet",
    chainId: 84532,
    lzEndpoint: LZ_ENDPOINT_TESTNET,
    lzEid: 40245,
    entryPoint: ENTRY_POINT_V07,
    peerEid: 40232, // OP Sepolia
  },
  opSepolia: {
    name: "OP Sepolia",
    kind: "testnet",
    chainId: 11155420,
    lzEndpoint: LZ_ENDPOINT_TESTNET,
    lzEid: 40232,
    entryPoint: ENTRY_POINT_V07,
    peerEid: 40245, // Base Sepolia
  },

  // Local / hardhat
  local: {
    name: "Local",
    kind: "local",
    chainId: 31337,
    lzEndpoint: "0x0000000000000000000000000000000000000000", // use MockLZEndpoint via deploy-local
    lzEid: 40_000_000,
    entryPoint: ENTRY_POINT_V07,
    peerEid: 40_000_001,
  },
};

export function chainFor(hardhatNetworkName: string, chainId: number): ChainConfig {
  // Prefer name match (explicit --network), fall back to chainId.
  if (CHAINS[hardhatNetworkName]) return CHAINS[hardhatNetworkName];
  const match = Object.values(CHAINS).find((c) => c.chainId === chainId);
  if (!match) {
    throw new Error(
      `Unknown chain: network=${hardhatNetworkName} chainId=${chainId}. ` +
        `Register it in scripts/chains.ts before deploying.`,
    );
  }
  return match;
}

export function assertMainnetGate(cfg: ChainConfig) {
  if (cfg.kind !== "mainnet") return;
  if (process.env.DAES_ALLOW_MAINNET !== "1") {
    throw new Error(
      `Refusing to deploy to ${cfg.name} (mainnet) without DAES_ALLOW_MAINNET=1. ` +
        `Set the env var explicitly once Tier 4 (third-party audit + cross-chain ` +
        `replay protection) is complete.`,
    );
  }
}
