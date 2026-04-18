// contracts/hardhat.config.ts
import type { HardhatUserConfig } from "hardhat/config";
import "@nomicfoundation/hardhat-toolbox";

const { BASE_RPC_URL, OP_RPC_URL, LOCAL_RPC_URL, DEPLOYER_PRIVATE_KEY } = process.env;

const config: HardhatUserConfig = {
  solidity: {
    version: "0.8.24",
    settings: {
      optimizer: { enabled: true, runs: 200 },
      evmVersion: "cancun",
      metadata: { bytecodeHash: "ipfs" },
    },
  },
  paths: {
    sources: "./src",
    artifacts: "./artifacts",
    cache: "./cache",
    tests: "./test",
  },
  networks: {
    hardhat: {
      chainId: 31337,
      hardfork: "cancun",
      mining: { auto: true, interval: 0 },
    },
    local: {
      url: LOCAL_RPC_URL ?? "http://blockchain-node:8545",
      chainId: 31337,
    },
    base: {
      url: BASE_RPC_URL ?? "https://mainnet.base.org",
      chainId: 8453,
      accounts: DEPLOYER_PRIVATE_KEY ? [DEPLOYER_PRIVATE_KEY] : [],
    },
    optimism: {
      url: OP_RPC_URL ?? "https://mainnet.optimism.io",
      chainId: 10,
      accounts: DEPLOYER_PRIVATE_KEY ? [DEPLOYER_PRIVATE_KEY] : [],
    },
  },
  mocha: { timeout: 120_000 },
};

export default config;
