// contracts/test/CircuitBreaker.test.ts
import { expect } from "chai";
import { ethers } from "hardhat";
import { time, impersonateAccount, setBalance } from "@nomicfoundation/hardhat-network-helpers";

describe("CircuitBreaker", () => {
  async function deploy() {
    const [guardian, bridge, other] = await ethers.getSigners();
    const CB = await ethers.getContractFactory("CircuitBreaker");
    const cb = await CB.deploy(guardian.address);
    await cb.waitForDeployment();
    // M-1 bootstrap: guardian grants bridge authority to recordFailure.
    await cb.connect(guardian).setBridge(bridge.address);
    return { cb, guardian, bridge, other };
  }

  it("trips after >2 failures in 600s window", async () => {
    const { cb, bridge } = await deploy();
    expect(await cb.isPaused()).to.equal(false);
    await cb.connect(bridge).recordFailure(0);
    await cb.connect(bridge).recordFailure(1);
    expect(await cb.isPaused()).to.equal(false);
    await cb.connect(bridge).recordFailure(2);
    expect(await cb.isPaused()).to.equal(true);
  });

  it("does not trip if failures fall out of the window", async () => {
    const { cb, bridge } = await deploy();
    await cb.connect(bridge).recordFailure(0);
    await cb.connect(bridge).recordFailure(0);
    await time.increase(601);
    await cb.connect(bridge).recordFailure(0);
    expect(await cb.isPaused()).to.equal(false);
  });

  it("reset works only for guardian and only when paused", async () => {
    const { cb, guardian, bridge, other } = await deploy();
    await expect(cb.connect(guardian).reset()).to.be.revertedWithCustomError(cb, "NotPaused");
    await expect(cb.connect(other).reset()).to.be.revertedWithCustomError(cb, "NotGuardian");
    await cb.connect(bridge).recordFailure(0);
    await cb.connect(bridge).recordFailure(0);
    await cb.connect(bridge).recordFailure(0);
    expect(await cb.isPaused()).to.equal(true);
    await cb.connect(guardian).reset();
    expect(await cb.isPaused()).to.equal(false);
  });

  it("M-1: recordFailure rejects callers that aren't the bridge", async () => {
    const { cb, guardian, other } = await deploy();
    await expect(cb.connect(other).recordFailure(0)).to.be.revertedWithCustomError(cb, "NotBridge");
    await expect(cb.connect(guardian).recordFailure(0)).to.be.revertedWithCustomError(cb, "NotBridge");
  });

  it("M-1: setBridge is one-time only and guardian-gated", async () => {
    const [guardian, bridge, other] = await ethers.getSigners();
    const CB = await ethers.getContractFactory("CircuitBreaker");
    const cb = await CB.deploy(guardian.address);
    // Non-guardian cannot bootstrap.
    await expect(cb.connect(other).setBridge(bridge.address)).to.be.revertedWithCustomError(cb, "NotGuardian");
    await expect(cb.connect(guardian).setBridge(ethers.ZeroAddress)).to.be.revertedWithCustomError(cb, "ZeroBridge");
    await cb.connect(guardian).setBridge(bridge.address);
    expect(await cb.bridge()).to.equal(bridge.address);
    // Second attempt must fail.
    await expect(cb.connect(guardian).setBridge(other.address)).to.be.revertedWithCustomError(cb, "BridgeAlreadySet");
  });

  it("M-5: failuresInWindow excludes failures at exactly t == lastReset", async () => {
    const { cb, guardian, bridge } = await deploy();
    // Pause by recording 3 failures.
    await cb.connect(bridge).recordFailure(0);
    await cb.connect(bridge).recordFailure(0);
    await cb.connect(bridge).recordFailure(0);
    expect(await cb.isPaused()).to.equal(true);

    // Pack `reset()` and a fresh `recordFailure(0)` into one block so they
    // share block.timestamp. The reset tx runs first (by nonce order) and
    // sets lastReset = T; the recordFailure tx runs next and writes ts = T.
    // `failuresInWindow` uses `t > lastReset`, so this failure must NOT count.
    await ethers.provider.send("evm_setAutomine", [false]);
    await cb.connect(guardian).reset();
    await cb.connect(bridge).recordFailure(0);
    await ethers.provider.send("evm_mine", []);
    await ethers.provider.send("evm_setAutomine", [true]);

    const lastResetTs = await cb.lastReset();
    const logs = await cb.queryFilter(cb.filters.FailureRecorded());
    // ethers v6: accessing `args.at` collides with Array.prototype.at, so we
    // pull the field positionally. `FailureRecorded(kind, at)` → args[1] = at.
    expect(logs[logs.length - 1].args[1]).to.equal(lastResetTs);

    expect(await cb.failuresInWindow()).to.equal(0);
    expect(await cb.isPaused()).to.equal(false);

    // Sanity: a failure strictly after lastReset does count.
    await time.increase(1);
    await cb.connect(bridge).recordFailure(0);
    expect(await cb.failuresInWindow()).to.equal(1);
  });

  void impersonateAccount;
  void setBalance;
});
