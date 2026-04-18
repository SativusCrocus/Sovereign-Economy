// contracts/test/SwarmConsensusOracle.test.ts
import { expect } from "chai";
import { ethers } from "hardhat";

describe("SwarmConsensusOracle", () => {
  async function deploy() {
    const [poster, other] = await ethers.getSigners();
    const O = await ethers.getContractFactory("SwarmConsensusOracle");
    const oracle = await O.deploy(poster.address);
    await oracle.waitForDeployment();
    return { oracle, poster, other };
  }

  it("stores signals and updates latestSignalHash", async () => {
    const { oracle, poster } = await deploy();
    const h = ethers.keccak256(ethers.toUtf8Bytes("s1"));
    await oracle.connect(poster).postSignal(h, 0 /*BUY*/, 6700, 1_200_000);
    const s = await oracle.getSignal(h);
    expect(s.kind).to.equal(0);
    expect(s.quorumBps).to.equal(6700);
    expect(s.sigmaBandE6).to.equal(1_200_000n);
    expect(await oracle.latestSignalHash()).to.equal(h);
  });

  it("rejects non-poster, duplicates, bad kind", async () => {
    const { oracle, poster, other } = await deploy();
    const h = ethers.keccak256(ethers.toUtf8Bytes("s2"));
    await expect(oracle.connect(other).postSignal(h, 0, 6700, 0)).to.be.revertedWithCustomError(oracle, "NotPoster");
    await expect(oracle.connect(poster).postSignal(h, 4 /*bad*/, 6700, 0)).to.be.revertedWithCustomError(oracle, "BadKind");
    await oracle.connect(poster).postSignal(h, 0, 6700, 0);
    await expect(oracle.connect(poster).postSignal(h, 0, 6700, 0)).to.be.revertedWithCustomError(oracle, "Duplicate");
  });
});
