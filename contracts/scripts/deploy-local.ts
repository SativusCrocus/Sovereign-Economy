// contracts/scripts/deploy-local.ts
// Deploys the full DAES contract set on the local Hardhat chain for
// integration tests. Unlike scripts/deploy.ts this uses MockLZEndpoint
// instead of the real LayerZero V2 endpoint, because LZ's endpoint does
// not exist on hardhat.
import { ethers } from "hardhat";
import { ENTRY_POINT_V07 } from "./chains";

async function main() {
  const [deployer, s1, s2, s3, s4, s5, bridge, poster, humanGuardian] = await ethers.getSigners();
  console.log("deployer:", deployer.address);

  const MockEndpoint = await ethers.getContractFactory("MockLZEndpoint");
  const endpoint = await MockEndpoint.deploy();
  await endpoint.waitForDeployment();
  console.log("MockLZEndpoint (test-only):", await endpoint.getAddress());

  // Governor is deployed first so SwarmConsensusOracle (and other
  // contracts that need governor-gated admin) can receive it at construction.
  const Gov = await ethers.getContractFactory("DAESGovernor");
  const gov = await Gov.deploy([s1.address, s2.address, s3.address, s4.address, s5.address], bridge.address);
  await gov.waitForDeployment();
  console.log("DAESGovernor:", await gov.getAddress());

  const Oracle = await ethers.getContractFactory("SwarmConsensusOracle");
  const oracle = await Oracle.deploy(poster.address, await gov.getAddress());
  await oracle.waitForDeployment();
  console.log("SwarmConsensusOracle:", await oracle.getAddress());

  const CB = await ethers.getContractFactory("CircuitBreaker");
  const cb = await CB.deploy(humanGuardian.address);
  await cb.waitForDeployment();
  console.log("CircuitBreaker:", await cb.getAddress());

  const BE = await ethers.getContractFactory("BridgeExecutor");
  const be = await BE.deploy(
    await oracle.getAddress(),
    await cb.getAddress(),
    await gov.getAddress(),
    bridge.address,
  );
  await be.waitForDeployment();
  console.log("BridgeExecutor:", await be.getAddress());

  // One-time bootstrap: guardian grants the bridge authority to recordFailure.
  await (await cb.connect(humanGuardian).setBridge(await be.getAddress())).wait();
  console.log("CircuitBreaker.setBridge ->", await be.getAddress());

  const TL = await ethers.getContractFactory("GuardianTimelock");
  const tl = await TL.deploy([await gov.getAddress()], [await gov.getAddress()], humanGuardian.address);
  await tl.waitForDeployment();
  console.log("GuardianTimelock:", await tl.getAddress());

  const Fac = await ethers.getContractFactory("AgentAccountFactory");
  const fac = await Fac.deploy(ENTRY_POINT_V07);
  await fac.waitForDeployment();
  console.log("AgentAccountFactory:", await fac.getAddress());

  const OApp = await ethers.getContractFactory("DAESOApp");
  const oapp = await OApp.deploy(await endpoint.getAddress(), await gov.getAddress());
  await oapp.waitForDeployment();
  console.log("DAESOApp:", await oapp.getAddress());
}

main().catch((e) => { console.error(e); process.exit(1); });
