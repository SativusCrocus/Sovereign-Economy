// contracts/scripts/set-peers.ts
// Wire the DAESOApp on the current network to its cross-chain counterpart.
// Reads deploy/addresses/<network>.json for the local address and
// deploy/addresses/<peerNetwork>.json for the peer address.
//
// NOTE: `setPeer` is owned by DAESGovernor, which reaches it only through
// its 3-of-5 stage/sign/execute pipeline. This script emits the calldata
// and (if --autostage) stages the action on the governor; signing and
// executing are manual operator steps using signAction/executeAction.
//
// Usage:
//   npx hardhat run scripts/set-peers.ts --network baseSepolia
//   npx hardhat run scripts/set-peers.ts --network baseSepolia -- --autostage
import { ethers, network } from "hardhat";
import { readFileSync, existsSync } from "node:fs";
import { join } from "node:path";
import { CHAINS, chainFor } from "./chains";

interface AddressFile {
  chainId: number;
  lzEid: number;
  peerEid: number;
  contracts: { DAESGovernor: string; DAESOApp: string | null };
}

function loadAddresses(net: string): AddressFile {
  const p = join(__dirname, "..", "..", "deploy", "addresses", `${net}.json`);
  if (!existsSync(p)) {
    throw new Error(`Missing ${p}. Run scripts/deploy.ts on ${net} first.`);
  }
  return JSON.parse(readFileSync(p, "utf8"));
}

function peerNetworkFor(localEid: number): string {
  for (const [name, cfg] of Object.entries(CHAINS)) {
    if (cfg.peerEid === localEid) return name;
  }
  throw new Error(`No peer network registered for eid ${localEid}`);
}

async function main() {
  const autostage = process.argv.includes("--autostage");
  const net = await ethers.provider.getNetwork();
  const cfg = chainFor(network.name, Number(net.chainId));

  const local = loadAddresses(network.name);
  if (!local.contracts.DAESOApp) {
    throw new Error(`DAESOApp not deployed on ${network.name}. Did deploy.ts skip it?`);
  }

  const peerNetwork = peerNetworkFor(cfg.lzEid);
  const peer = loadAddresses(peerNetwork);
  if (!peer.contracts.DAESOApp) {
    throw new Error(
      `Peer ${peerNetwork} has no DAESOApp in its addresses.json. ` +
        `Deploy it on ${peerNetwork} before wiring peers.`,
    );
  }

  const peerEid = cfg.peerEid;
  const peerBytes32 = ethers.zeroPadValue(peer.contracts.DAESOApp, 32);

  console.log(`[set-peers] local OApp    = ${local.contracts.DAESOApp} (${network.name}, eid ${cfg.lzEid})`);
  console.log(`[set-peers] peer OApp     = ${peer.contracts.DAESOApp} (${peerNetwork}, eid ${peerEid})`);
  console.log(`[set-peers] peer (bytes32)= ${peerBytes32}`);

  const oapp = await ethers.getContractAt("DAESOApp", local.contracts.DAESOApp);
  const calldata = oapp.interface.encodeFunctionData("setPeer", [peerEid, peerBytes32]);
  console.log(`\n[set-peers] setPeer calldata:\n${calldata}\n`);

  if (!autostage) {
    console.log(
      "[set-peers] --autostage not set. Hand the calldata above to the bridge operator and run:",
    );
    console.log(
      `  cast send <governor> "stageAction(bytes32,address,uint256,bytes)" <actionId> ${local.contracts.DAESOApp} 0 ${calldata}`,
    );
    return;
  }

  const [signer] = await ethers.getSigners();
  const gov = await ethers.getContractAt("DAESGovernor", local.contracts.DAESOApp);
  const bridgeOperator = await (await ethers.getContractAt("DAESGovernor", local.contracts.DAESGovernor)).bridgeOperator();
  if (signer.address.toLowerCase() !== bridgeOperator.toLowerCase()) {
    throw new Error(
      `--autostage requires signer == bridgeOperator. signer=${signer.address} bridgeOperator=${bridgeOperator}`,
    );
  }

  const actionId = ethers.keccak256(
    ethers.solidityPacked(
      ["string", "address", "uint32", "bytes32"],
      ["setPeer", local.contracts.DAESOApp, peerEid, peerBytes32],
    ),
  );
  console.log(`[set-peers] actionId = ${actionId}`);
  const govContract = await ethers.getContractAt("DAESGovernor", local.contracts.DAESGovernor);
  const tx = await govContract.stageAction(actionId, local.contracts.DAESOApp, 0, calldata);
  console.log(`[set-peers] staged (tx ${tx.hash}) — now collect 3-of-5 sigs, wait 86400s, executeAction`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
