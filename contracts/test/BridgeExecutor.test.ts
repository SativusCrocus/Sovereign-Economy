// contracts/test/BridgeExecutor.test.ts
import { expect } from "chai";
import { ethers } from "hardhat";
import { time } from "@nomicfoundation/hardhat-network-helpers";

enum FSM { IDLE, RECEIVED, VALIDATED, THRESHOLD, STAGED, TIMEOUT, EXECUTED, REJECTED }

async function makeProof(
  poster: any,
  bridgeExecutorAddr: string,
  chainId: bigint,
  signalId: string,
  quorumBps: number,
  sigmaE6: number | bigint,
) {
  const preimage = ethers.solidityPackedKeccak256(
    ["uint256", "address", "bytes32", "uint16", "int64"],
    [chainId, bridgeExecutorAddr, signalId, quorumBps, sigmaE6],
  );
  const sig = await poster.signMessage(ethers.getBytes(preimage));
  return ethers.AbiCoder.defaultAbiCoder().encode(
    ["uint16", "int64", "bytes"],
    [quorumBps, sigmaE6, sig],
  );
}

describe("BridgeExecutor", () => {
  async function deploy() {
    const [poster, governor, operator, other] = await ethers.getSigners();
    const Oracle = await ethers.getContractFactory("SwarmConsensusOracle");
    const oracle = await Oracle.deploy(poster.address, governor.address);
    const CB = await ethers.getContractFactory("CircuitBreaker");
    const cb = await CB.deploy(governor.address); // governor doubles as CB guardian in tests
    const BE = await ethers.getContractFactory("BridgeExecutor");
    const be = await BE.deploy(await oracle.getAddress(), await cb.getAddress(), governor.address, operator.address);
    // M-1 bootstrap: guardian gives the bridge authority to recordFailure.
    await cb.connect(governor).setBridge(await be.getAddress());
    return { oracle, cb, be, poster, governor, operator, other };
  }

  const ID = ethers.keccak256(ethers.toUtf8Bytes("sig-1"));

  it("walks happy path through FSM states with real attestation", async () => {
    const { be, operator, governor, poster } = await deploy();
    const chainId = (await ethers.provider.getNetwork()).chainId;
    const beAddr = await be.getAddress();
    await be.connect(operator).onSwarmSignal(ID, 0, ethers.ZeroHash);
    expect(await be.stateOf(ID)).to.equal(FSM.RECEIVED);
    const proof = await makeProof(poster, beAddr, chainId, ID, 6700, 1_200_000);
    await be.connect(operator).validate(ID, proof);
    expect(await be.stateOf(ID)).to.equal(FSM.VALIDATED);
    await be.connect(operator).thresholdCheck(ID, 6700, 1_200_000);
    expect(await be.stateOf(ID)).to.equal(FSM.THRESHOLD);
    await be.connect(operator).stageForMultiSig(ID, ethers.ZeroHash);
    expect(await be.stateOf(ID)).to.equal(FSM.STAGED);
    await be.connect(governor).markExecuted(ID);
    expect(await be.stateOf(ID)).to.equal(FSM.EXECUTED);
  });

  it("rejects attestation signed by wrong key (H-3)", async () => {
    const { be, cb, operator, other } = await deploy();
    const chainId = (await ethers.provider.getNetwork()).chainId;
    const beAddr = await be.getAddress();
    await be.connect(operator).onSwarmSignal(ID, 0, ethers.ZeroHash);
    // Sign with `other`, not the oracle poster.
    const proof = await makeProof(other, beAddr, chainId, ID, 6700, 1_200_000);
    await expect(be.connect(operator).validate(ID, proof))
      .to.emit(be, "AttestationRejected")
      .withArgs(ID, ethers.encodeBytes32String("wrong-signer"));
    expect(await be.stateOf(ID)).to.equal(FSM.REJECTED);
    // Circuit breaker recorded an OracleStale failure.
    expect(await cb.failuresInWindow()).to.equal(1);
  });

  it("rejects attestation signed over a different chainId (Tier 4 replay)", async () => {
    const { be, operator, poster } = await deploy();
    const beAddr = await be.getAddress();
    // Poster signs with chainId=999 — a real attestation from another chain.
    // Current chain is 31337; replay attempt must be rejected.
    const proof = await makeProof(poster, beAddr, 999n, ID, 6700, 1_200_000);
    await be.connect(operator).onSwarmSignal(ID, 0, ethers.ZeroHash);
    await expect(be.connect(operator).validate(ID, proof))
      .to.emit(be, "AttestationRejected")
      .withArgs(ID, ethers.encodeBytes32String("wrong-signer"));
    expect(await be.stateOf(ID)).to.equal(FSM.REJECTED);
  });

  it("rejects attestation signed for a different BridgeExecutor (Tier 4 replay)", async () => {
    const { be, operator, poster } = await deploy();
    const chainId = (await ethers.provider.getNetwork()).chainId;
    // Poster signed the right fields but bound to a different bridge executor.
    const proof = await makeProof(poster, ethers.ZeroAddress, chainId, ID, 6700, 1_200_000);
    await be.connect(operator).onSwarmSignal(ID, 0, ethers.ZeroHash);
    await expect(be.connect(operator).validate(ID, proof))
      .to.emit(be, "AttestationRejected")
      .withArgs(ID, ethers.encodeBytes32String("wrong-signer"));
    expect(await be.stateOf(ID)).to.equal(FSM.REJECTED);
  });

  it("rejects empty proof (H-3 old bypass)", async () => {
    const { be, operator } = await deploy();
    await be.connect(operator).onSwarmSignal(ID, 0, ethers.ZeroHash);
    await expect(be.connect(operator).validate(ID, "0x"))
      .to.emit(be, "AttestationRejected")
      .withArgs(ID, ethers.encodeBytes32String("empty-proof"));
    expect(await be.stateOf(ID)).to.equal(FSM.REJECTED);
  });

  it("rejects when quorum insufficient", async () => {
    const { be, operator, poster } = await deploy();
    const chainId = (await ethers.provider.getNetwork()).chainId;
    const beAddr = await be.getAddress();
    await be.connect(operator).onSwarmSignal(ID, 0, ethers.ZeroHash);
    const proof = await makeProof(poster, beAddr, chainId, ID, 5000, 0);
    await be.connect(operator).validate(ID, proof);
    await be.connect(operator).thresholdCheck(ID, 5000, 0);
    expect(await be.stateOf(ID)).to.equal(FSM.REJECTED);
  });

  it("only permits timeout after 3600s", async () => {
    const { be, operator, poster } = await deploy();
    const chainId = (await ethers.provider.getNetwork()).chainId;
    const beAddr = await be.getAddress();
    await be.connect(operator).onSwarmSignal(ID, 0, ethers.ZeroHash);
    const proof = await makeProof(poster, beAddr, chainId, ID, 6700, 0);
    await be.connect(operator).validate(ID, proof);
    await be.connect(operator).thresholdCheck(ID, 6700, 0);
    await be.connect(operator).stageForMultiSig(ID, ethers.ZeroHash);
    await expect(be.timeout(ID)).to.be.revertedWithCustomError(be, "BadTransition");
    await time.increase(3601);
    await be.timeout(ID);
    expect(await be.stateOf(ID)).to.equal(FSM.TIMEOUT);
  });

  it("blocks transitions when circuit breaker paused", async () => {
    const { be, cb, operator } = await deploy();
    // M-1 gating means recordFailure only accepts calls from the bridge itself.
    // Trip the breaker by submitting three rejected attestations through the
    // legitimate path — each failed validate records an OracleStale failure.
    for (let i = 0; i < 3; i++) {
      const sid = ethers.keccak256(ethers.toUtf8Bytes(`bad-${i}`));
      await be.connect(operator).onSwarmSignal(sid, 0, ethers.ZeroHash);
      await be.connect(operator).validate(sid, "0x"); // empty proof → OracleStale failure
    }
    expect(await cb.isPaused()).to.equal(true);
    await expect(be.connect(operator).onSwarmSignal(ID, 0, ethers.ZeroHash)).to.be.revertedWithCustomError(be, "Paused");
  });
});
