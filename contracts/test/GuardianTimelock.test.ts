// contracts/test/GuardianTimelock.test.ts
import { expect } from "chai";
import { ethers } from "hardhat";

describe("GuardianTimelock", () => {
  it("enforces 86400s min delay at construction", async () => {
    const [admin, proposer, executor] = await ethers.getSigners();
    const F = await ethers.getContractFactory("GuardianTimelock");
    const tl = await F.deploy([proposer.address], [executor.address], admin.address);
    await tl.waitForDeployment();
    expect(await tl.getMinDelay()).to.equal(86400n);
  });
});
