// contracts/scripts/deploy.ts
// Parameterized DAES contract deployment. Works for local, Base/OP Sepolia,
// and (with DAES_ALLOW_MAINNET=1) Base/OP mainnet. Writes a per-chain
// addresses.json into deploy/addresses/<network>.json so follow-up tooling
// (set-peers, frontend env generation) has a single source of truth.
//
// Required env vars on live chains:
//   DEPLOYER_PRIVATE_KEY       — funded EOA (ethers signer 0)
//   DAES_SIGNER_1..5           — 5 signer addresses for the 3-of-5 multi-sig
//   DAES_BRIDGE_OPERATOR       — EOA the off-chain bridge daemon uses
//   DAES_POSTER                — EOA the agent-swarm-runtime uses
//   DAES_HUMAN_GUARDIAN        — EOA that resets the circuit breaker
//   DAES_ALLOW_MAINNET=1       — explicit opt-in for chainId 10 / 8453
//
// Usage:
//   npx hardhat run scripts/deploy.ts --network baseSepolia
//   DAES_ALLOW_MAINNET=1 npx hardhat run scripts/deploy.ts --network base
import { ethers, network } from "hardhat";
import { writeFileSync, mkdirSync, existsSync } from "node:fs";
import { join, dirname } from "node:path";
import { chainFor, assertMainnetGate } from "./chains";

function envAddress(key: string, fallback?: string): string {
  const raw = process.env[key];
  if (raw && /^0x[a-fA-F0-9]{40}$/.test(raw)) return ethers.getAddress(raw);
  if (fallback) return fallback;
  throw new Error(`Missing required address env ${key}`);
}

async function main() {
  const provider = ethers.provider;
  const net = await provider.getNetwork();
  const cfg = chainFor(network.name, Number(net.chainId));
  assertMainnetGate(cfg);

  const [deployer] = await ethers.getSigners();
  console.log(`[deploy] network=${network.name} chainId=${cfg.chainId} (${cfg.name})`);
  console.log(`[deploy] deployer=${deployer.address}`);

  // --- Resolve roles ---
  // On `local`/`hardhat` we fall back to signers[1..] so dev UX stays one-liner.
  // On live chains every role must come from env.
  const devSigners = await ethers.getSigners();
  const fallback = (i: number) => (cfg.kind === "local" ? devSigners[i].address : undefined);

  const signer1 = envAddress("DAES_SIGNER_1", fallback(1));
  const signer2 = envAddress("DAES_SIGNER_2", fallback(2));
  const signer3 = envAddress("DAES_SIGNER_3", fallback(3));
  const signer4 = envAddress("DAES_SIGNER_4", fallback(4));
  const signer5 = envAddress("DAES_SIGNER_5", fallback(5));
  const bridgeOperator = envAddress("DAES_BRIDGE_OPERATOR", fallback(6));
  const poster = envAddress("DAES_POSTER", fallback(7));
  const humanGuardian = envAddress("DAES_HUMAN_GUARDIAN", fallback(8));

  console.log(`[deploy] signers       = [${[signer1, signer2, signer3, signer4, signer5].join(", ")}]`);
  console.log(`[deploy] bridgeOperator= ${bridgeOperator}`);
  console.log(`[deploy] poster        = ${poster}`);
  console.log(`[deploy] humanGuardian = ${humanGuardian}`);

  // --- Deploy ---
  // Governor deploys first so SwarmConsensusOracle can bind to it at construction
  // (rotatePoster gates on msg.sender == governor).
  const Gov = await ethers.getContractFactory("DAESGovernor");
  const gov = await Gov.deploy([signer1, signer2, signer3, signer4, signer5], bridgeOperator);
  await gov.waitForDeployment();
  const govAddr = await gov.getAddress();
  console.log(`DAESGovernor         : ${govAddr}`);

  const Oracle = await ethers.getContractFactory("SwarmConsensusOracle");
  const oracle = await Oracle.deploy(poster, govAddr);
  await oracle.waitForDeployment();
  const oracleAddr = await oracle.getAddress();
  console.log(`SwarmConsensusOracle : ${oracleAddr}`);

  const CB = await ethers.getContractFactory("CircuitBreaker");
  const cb = await CB.deploy(humanGuardian);
  await cb.waitForDeployment();
  const cbAddr = await cb.getAddress();
  console.log(`CircuitBreaker       : ${cbAddr}`);

  const BE = await ethers.getContractFactory("BridgeExecutor");
  const be = await BE.deploy(oracleAddr, cbAddr, govAddr, bridgeOperator);
  await be.waitForDeployment();
  const beAddr = await be.getAddress();
  console.log(`BridgeExecutor       : ${beAddr}`);

  // M-1 bootstrap: CircuitBreaker.recordFailure is now gated to the bridge.
  // Guardian must call setBridge once, right after the bridge is deployed.
  // If DEPLOYER_PRIVATE_KEY != DAES_HUMAN_GUARDIAN, this will be skipped and
  // the guardian has to run the follow-up `setBridge` tx themselves.
  if (deployer.address.toLowerCase() === humanGuardian.toLowerCase()) {
    await (await cb.setBridge(beAddr)).wait();
    console.log(`CircuitBreaker.setBridge -> ${beAddr}`);
  } else {
    console.log(
      `[deploy] note: skipped CircuitBreaker.setBridge; deployer (${deployer.address}) != ` +
        `guardian (${humanGuardian}). Run as guardian:\n` +
        `  cast send ${cbAddr} "setBridge(address)" ${beAddr} --from ${humanGuardian}`,
    );
  }

  const TL = await ethers.getContractFactory("GuardianTimelock");
  const tl = await TL.deploy([govAddr], [govAddr], humanGuardian);
  await tl.waitForDeployment();
  const tlAddr = await tl.getAddress();
  console.log(`GuardianTimelock     : ${tlAddr}`);

  const Fac = await ethers.getContractFactory("AgentAccountFactory");
  const fac = await Fac.deploy(cfg.entryPoint);
  await fac.waitForDeployment();
  const facAddr = await fac.getAddress();
  console.log(`AgentAccountFactory  : ${facAddr}`);

  // DAESOApp: on `local` the chains.ts entry has the zero endpoint because
  // live LZ doesn't exist on hardhat — skip OApp deploy locally; use
  // deploy-local.ts (which uses MockLZEndpoint) for local end-to-end tests.
  let oappAddr: string | undefined;
  if (cfg.kind !== "local") {
    const OApp = await ethers.getContractFactory("DAESOApp");
    const oapp = await OApp.deploy(cfg.lzEndpoint, govAddr);
    await oapp.waitForDeployment();
    oappAddr = await oapp.getAddress();
    console.log(`DAESOApp             : ${oappAddr} (endpoint ${cfg.lzEndpoint}, eid ${cfg.lzEid})`);
  } else {
    console.log("DAESOApp             : skipped on local — use scripts/deploy-local.ts with MockLZEndpoint");
  }

  // --- Persist addresses ---
  const out = {
    chain: cfg.name,
    chainId: cfg.chainId,
    lzEid: cfg.lzEid,
    lzEndpoint: cfg.lzEndpoint,
    peerEid: cfg.peerEid,
    deployedAt: new Date().toISOString(),
    deployer: deployer.address,
    contracts: {
      SwarmConsensusOracle: oracleAddr,
      CircuitBreaker: cbAddr,
      DAESGovernor: govAddr,
      BridgeExecutor: beAddr,
      GuardianTimelock: tlAddr,
      AgentAccountFactory: facAddr,
      DAESOApp: oappAddr ?? null,
    },
    roles: {
      signers: [signer1, signer2, signer3, signer4, signer5],
      bridgeOperator,
      poster,
      humanGuardian,
    },
  };
  const outPath = join(__dirname, "..", "..", "deploy", "addresses", `${network.name}.json`);
  if (!existsSync(dirname(outPath))) mkdirSync(dirname(outPath), { recursive: true });
  writeFileSync(outPath, JSON.stringify(out, null, 2) + "\n");
  console.log(`\n[deploy] wrote ${outPath}`);
  console.log(`[deploy] next: npx hardhat run scripts/set-peers.ts --network ${network.name}`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
