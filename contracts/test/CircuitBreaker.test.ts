// contracts/test/CircuitBreaker.test.ts
import { expect } from "chai";
import { ethers } from "hardhat";
import { time } from "@nomicfoundation/hardhat-network-helpers";

describe("CircuitBreaker", () => {
  async function deploy() {
    const [guardian, other] = await ethers.getSigners();
    const CB = await ethers.getContractFactory("CircuitBreaker");
    const cb = await CB.deploy(guardian.address);
    await cb.waitForDeployment();
    return { cb, guardian, other };
  }

  it("trips after >2 failures in 600s window", async () => {
    const { cb } = await deploy();
    expect(await cb.isPaused()).to.equal(false);
    await cb.recordFailure(0);
    await cb.recordFailure(1);
    expect(await cb.isPaused()).to.equal(false);
    await cb.recordFailure(2);
    expect(await cb.isPaused()).to.equal(true);
  });

  it("does not trip if failures fall out of the window", async () => {
    const { cb } = await deploy();
    await cb.recordFailure(0);
    await cb.recordFailure(0);
    await time.increase(601);
    await cb.recordFailure(0);
    expect(await cb.isPaused()).to.equal(false);
  });

  it("reset works only for guardian and only when paused", async () => {
    const { cb, guardian, other } = await deploy();
    // Guardian calls reset before paused → NotPaused
    await expect(cb.connect(guardian).reset()).to.be.revertedWithCustomError(cb, "NotPaused");
    // Non-guardian → NotGuardian (modifier runs first, independent of pause state)
    await expect(cb.connect(other).reset()).to.be.revertedWithCustomError(cb, "NotGuardian");
    await cb.recordFailure(0);
    await cb.recordFailure(0);
    await cb.recordFailure(0);
    expect(await cb.isPaused()).to.equal(true);
    await cb.connect(guardian).reset();
    expect(await cb.isPaused()).to.equal(false);
  });
});
