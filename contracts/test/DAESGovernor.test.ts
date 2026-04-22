// contracts/test/DAESGovernor.test.ts
import { expect } from "chai";
import { ethers } from "hardhat";
import { time } from "@nomicfoundation/hardhat-network-helpers";

describe("DAESGovernor", () => {
  async function deploy() {
    const [s1, s2, s3, s4, s5, bridge, other] = await ethers.getSigners();
    const Signers: [string, string, string, string, string] = [
      s1.address, s2.address, s3.address, s4.address, s5.address,
    ];
    const G = await ethers.getContractFactory("DAESGovernor");
    const g = await G.deploy(Signers, bridge.address);
    return { g, s1, s2, s3, s4, s5, bridge, other };
  }

  it("stages, collects 3 sigs, executes only after 86400s", async () => {
    const { g, s1, s2, s3, bridge, other } = await deploy();
    // Use an EOA as target so call succeeds with empty data.
    const target = other.address;
    const data = "0x";
    const actionId = ethers.keccak256(ethers.toUtf8Bytes("act-1"));

    await expect(g.connect(other).stageAction(actionId, target, 0, data))
      .to.be.revertedWithCustomError(g, "NotBridgeOperator");

    await g.connect(bridge).stageAction(actionId, target, 0, data);
    await g.connect(s1).signAction(actionId, 0, "0x");
    await g.connect(s2).signAction(actionId, 1, "0x");
    await g.connect(s3).signAction(actionId, 2, "0x");

    await expect(g.executeAction(actionId)).to.be.revertedWithCustomError(g, "TooEarly");
    await time.increase(86401);
    await g.executeAction(actionId);
  });

  it("rejects unknown signers and wrong role", async () => {
    const { g, s1, s2, bridge, other } = await deploy();
    const actionId = ethers.keccak256(ethers.toUtf8Bytes("act-2"));
    await g.connect(bridge).stageAction(actionId, other.address, 0, "0x");
    await expect(g.connect(other).signAction(actionId, 0, "0x")).to.be.revertedWithCustomError(g, "NotSigner");
    // s1 cannot sign as role 1 (AgentClassB)
    await expect(g.connect(s1).signAction(actionId, 1, "0x")).to.be.revertedWithCustomError(g, "NotSigner");
    await g.connect(s1).signAction(actionId, 0, "0x");
    // double sign blocked
    await expect(g.connect(s1).signAction(actionId, 0, "0x")).to.be.revertedWithCustomError(g, "AlreadySigned");
  });

  it("M-2: rotateSigner is self-gated and requires 3-of-5 + 86400s", async () => {
    const { g, s1, s2, s3, bridge, other } = await deploy();
    const [, , , , , , , newSigner] = await ethers.getSigners();

    // Direct call must revert: only the governor can call rotateSigner on itself.
    await expect(g.connect(bridge).rotateSigner(0, newSigner.address))
      .to.be.revertedWithCustomError(g, "NotSelf");

    // Reach rotateSigner through stage → 3-of-5 sign → 86400s timelock → execute.
    const govAddr = await g.getAddress();
    const calldata = g.interface.encodeFunctionData("rotateSigner", [0, newSigner.address]);
    const actionId = ethers.keccak256(ethers.toUtf8Bytes("rotate-act"));

    await g.connect(bridge).stageAction(actionId, govAddr, 0, calldata);
    await g.connect(s1).signAction(actionId, 0, "0x");
    await g.connect(s2).signAction(actionId, 1, "0x");
    await g.connect(s3).signAction(actionId, 2, "0x");
    await expect(g.executeAction(actionId)).to.be.revertedWithCustomError(g, "TooEarly");
    await time.increase(86401);

    const oldSigner = s1.address;
    await expect(g.executeAction(actionId))
      .to.emit(g, "SignerRotated")
      .withArgs(0, oldSigner, newSigner.address);

    expect(await g.signerOf(0)).to.equal(newSigner.address);

    // After rotation the old signer can no longer sign as role 0.
    const nextActionId = ethers.keccak256(ethers.toUtf8Bytes("post-rotate"));
    await g.connect(bridge).stageAction(nextActionId, other.address, 0, "0x");
    await expect(g.connect(s1).signAction(nextActionId, 0, "0x"))
      .to.be.revertedWithCustomError(g, "NotSigner");
    await g.connect(newSigner).signAction(nextActionId, 0, "0x");
  });

  it("M-2: rotateSigner rejects the zero address", async () => {
    const { g, s1, s2, s3, bridge } = await deploy();
    const govAddr = await g.getAddress();
    const calldata = g.interface.encodeFunctionData("rotateSigner", [0, ethers.ZeroAddress]);
    const actionId = ethers.keccak256(ethers.toUtf8Bytes("rotate-zero"));
    await g.connect(bridge).stageAction(actionId, govAddr, 0, calldata);
    await g.connect(s1).signAction(actionId, 0, "0x");
    await g.connect(s2).signAction(actionId, 1, "0x");
    await g.connect(s3).signAction(actionId, 2, "0x");
    await time.increase(86401);
    // executeAction bubbles up the inner revert data verbatim, so
    // rotateSigner's ZeroSigner error surfaces directly.
    await expect(g.executeAction(actionId)).to.be.revertedWithCustomError(g, "ZeroSigner");
  });
});
