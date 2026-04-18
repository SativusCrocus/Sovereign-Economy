// contracts/scripts/deploy-local.ts
// Deploys the full DAES contract set to the current network.
// On 'local' this uses the Hardhat / Anvil dev chain; on Base or
// Optimism it uses the real ERC-4337 EntryPoint and LayerZero endpoint.
import { ethers } from "hardhat";

const ENTRYPOINT_V07  = "0x0000000071727De22E5E9d8BAf0edAc6f37da032";
const LZ_ENDPOINT_V2  = "0x1a44076050125825900e736c501f859c50fE728c"; // Base + Optimism

async function main() {
  const [deployer, s1, s2, s3, s4, s5, bridge, poster, humanGuardian] = await ethers.getSigners();
  console.log("deployer:", deployer.address);

  const Oracle = await ethers.getContractFactory("SwarmConsensusOracle");
  const oracle = await Oracle.deploy(poster.address);
  await oracle.waitForDeployment();
  console.log("SwarmConsensusOracle:", await oracle.getAddress());

  const CB = await ethers.getContractFactory("CircuitBreaker");
  const cb = await CB.deploy(humanGuardian.address);
  await cb.waitForDeployment();
  console.log("CircuitBreaker:", await cb.getAddress());

  const Gov = await ethers.getContractFactory("DAESGovernor");
  const gov = await Gov.deploy([s1.address, s2.address, s3.address, s4.address, s5.address], bridge.address);
  await gov.waitForDeployment();
  console.log("DAESGovernor:", await gov.getAddress());

  const BE = await ethers.getContractFactory("BridgeExecutor");
  const be = await BE.deploy(
    await oracle.getAddress(),
    await cb.getAddress(),
    await gov.getAddress(),
    bridge.address,
  );
  await be.waitForDeployment();
  console.log("BridgeExecutor:", await be.getAddress());

  const TL = await ethers.getContractFactory("GuardianTimelock");
  const tl = await TL.deploy([await gov.getAddress()], [await gov.getAddress()], humanGuardian.address);
  await tl.waitForDeployment();
  console.log("GuardianTimelock:", await tl.getAddress());

  const Fac = await ethers.getContractFactory("AgentAccountFactory");
  const fac = await Fac.deploy(ENTRYPOINT_V07);
  await fac.waitForDeployment();
  console.log("AgentAccountFactory:", await fac.getAddress());

  const OApp = await ethers.getContractFactory("DAESOApp");
  const oapp = await OApp.deploy(LZ_ENDPOINT_V2, await gov.getAddress());
  await oapp.waitForDeployment();
  console.log("DAESOApp:", await oapp.getAddress());
}

main().catch((e) => { console.error(e); process.exit(1); });
