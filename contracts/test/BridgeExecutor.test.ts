// contracts/test/BridgeExecutor.test.ts
import { expect } from "chai";
import { ethers } from "hardhat";
import { time } from "@nomicfoundation/hardhat-network-helpers";

enum FSM { IDLE, RECEIVED, VALIDATED, THRESHOLD, STAGED, TIMEOUT, EXECUTED, REJECTED }

describe("BridgeExecutor", () => {
  async function deploy() {
    const [poster, governor, operator, other] = await ethers.getSigners();
    const Oracle = await ethers.getContractFactory("SwarmConsensusOracle");
    const oracle = await Oracle.deploy(poster.address);
    const CB = await ethers.getContractFactory("CircuitBreaker");
    const cb = await CB.deploy(governor.address);
    const BE = await ethers.getContractFactory("BridgeExecutor");
    const be = await BE.deploy(await oracle.getAddress(), await cb.getAddress(), governor.address, operator.address);
    return { oracle, cb, be, poster, governor, operator, other };
  }

  const ID = ethers.keccak256(ethers.toUtf8Bytes("sig-1"));

  it("walks happy path through FSM states", async () => {
    const { be, operator, governor } = await deploy();
    await be.connect(operator).onSwarmSignal(ID, 0, ethers.ZeroHash);
    expect(await be.stateOf(ID)).to.equal(FSM.RECEIVED);
    await be.connect(operator).validate(ID, "0x01");
    expect(await be.stateOf(ID)).to.equal(FSM.VALIDATED);
    await be.connect(operator).thresholdCheck(ID, 6700, 1_200_000);
    expect(await be.stateOf(ID)).to.equal(FSM.THRESHOLD);
    await be.connect(operator).stageForMultiSig(ID, ethers.ZeroHash);
    expect(await be.stateOf(ID)).to.equal(FSM.STAGED);
    await be.connect(governor).markExecuted(ID);
    expect(await be.stateOf(ID)).to.equal(FSM.EXECUTED);
  });

  it("rejects when quorum insufficient", async () => {
    const { be, operator } = await deploy();
    await be.connect(operator).onSwarmSignal(ID, 0, ethers.ZeroHash);
    await be.connect(operator).validate(ID, "0x01");
    await be.connect(operator).thresholdCheck(ID, 5000, 0);
    expect(await be.stateOf(ID)).to.equal(FSM.REJECTED);
  });

  it("only permits timeout after 3600s", async () => {
    const { be, operator } = await deploy();
    await be.connect(operator).onSwarmSignal(ID, 0, ethers.ZeroHash);
    await be.connect(operator).validate(ID, "0x01");
    await be.connect(operator).thresholdCheck(ID, 6700, 0);
    await be.connect(operator).stageForMultiSig(ID, ethers.ZeroHash);
    await expect(be.timeout(ID)).to.be.revertedWithCustomError(be, "BadTransition");
    await time.increase(3601);
    await be.timeout(ID);
    expect(await be.stateOf(ID)).to.equal(FSM.TIMEOUT);
  });

  it("blocks transitions when circuit breaker paused", async () => {
    const { be, cb, operator, governor } = await deploy();
    for (let i = 0; i < 3; i++) await cb.connect(governor).recordFailure?.(0).catch(() => {});
    // CB.recordFailure is public, called directly by operator role; go via governor to signal
    const CB = cb.connect(governor);
    await CB.recordFailure(0); await CB.recordFailure(0); await CB.recordFailure(0);
    expect(await cb.isPaused()).to.equal(true);
    await expect(be.connect(operator).onSwarmSignal(ID, 0, ethers.ZeroHash)).to.be.revertedWithCustomError(be, "Paused");
  });
});
