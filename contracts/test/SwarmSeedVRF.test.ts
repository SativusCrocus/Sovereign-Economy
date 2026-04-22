// contracts/test/SwarmSeedVRF.test.ts
import { expect } from "chai";
import { ethers } from "hardhat";

describe("SwarmSeedVRF", () => {
  async function deploy() {
    const [governor, other, coordinatorSigner] = await ethers.getSigners();

    // Minimal mock of IVRFCoordinatorV2Plus: records the last request + gives
    // the test harness a way to invoke rawFulfillRandomWords on the consumer.
    const Mock = await ethers.getContractFactory("MockVRFCoordinator");
    const mock = await Mock.deploy();
    await mock.waitForDeployment();

    const VRF = await ethers.getContractFactory("SwarmSeedVRF");
    const vrf = await VRF.deploy(
      await mock.getAddress(),
      governor.address,
      ethers.ZeroHash,              // keyHash (arbitrary for mock)
      42n,                          // subId
      3,                            // requestConfirmations
      200_000,                      // callbackGasLimit
    );
    await vrf.waitForDeployment();

    // Wire the mock so it knows which consumer to call back.
    await mock.setConsumer(await vrf.getAddress());

    return { vrf, mock, governor, other };
  }

  it("rejects requestSeed from non-governor", async () => {
    const { vrf, other } = await deploy();
    await expect(vrf.connect(other).requestSeed()).to.be.revertedWithCustomError(vrf, "NotGovernor");
  });

  it("governor can requestSeed; state stays NoSeedYet until fulfillment", async () => {
    const { vrf, governor } = await deploy();
    await expect(vrf.connect(governor).requestSeed()).to.emit(vrf, "SeedRequested");
    expect(await vrf.isReady()).to.equal(false);
    await expect(vrf.latestSeed()).to.be.revertedWithCustomError(vrf, "NoSeedYet");
  });

  it("only the coordinator can fulfill; seed persists after fulfillment", async () => {
    const { vrf, mock, governor } = await deploy();
    const tx = await vrf.connect(governor).requestSeed();
    const rcpt = await tx.wait();
    const ev = rcpt!.logs.find(l => "fragment" in l && (l as any).fragment?.name === "SeedRequested");
    const requestId: bigint = (ev as any).args[0];

    // Non-coordinator fulfillment rejected.
    await expect(vrf.rawFulfillRandomWords(requestId, [123n])).to.be.revertedWithCustomError(vrf, "NotCoordinator");

    // Coordinator-authorised fulfillment goes through the mock.
    const seed = 0xDEADBEEFCAFEBABEn;
    await expect(mock.fulfill(requestId, [seed])).to.emit(vrf, "SeedFulfilled");
    expect(await vrf.isReady()).to.equal(true);
    const [storedSeed, blockNum] = await vrf.latestSeed();
    expect(storedSeed).to.equal(seed);
    expect(blockNum).to.be.greaterThan(0n);
  });

  it("rejects double-fulfillment of the same requestId", async () => {
    const { vrf, mock, governor } = await deploy();
    const tx = await vrf.connect(governor).requestSeed();
    const rcpt = await tx.wait();
    const ev = rcpt!.logs.find(l => "fragment" in l && (l as any).fragment?.name === "SeedRequested");
    const requestId: bigint = (ev as any).args[0];
    await mock.fulfill(requestId, [1n]);
    await expect(mock.fulfill(requestId, [2n])).to.be.revertedWithCustomError(vrf, "AlreadyFulfilled");
  });

  it("reverts constructor on zero coordinator or zero governor", async () => {
    const [gov] = await ethers.getSigners();
    const VRF = await ethers.getContractFactory("SwarmSeedVRF");
    await expect(
      VRF.deploy(ethers.ZeroAddress, gov.address, ethers.ZeroHash, 1n, 3, 200_000)
    ).to.be.revertedWithCustomError(VRF, "NotCoordinator");
    const Mock = await ethers.getContractFactory("MockVRFCoordinator");
    const mock = await Mock.deploy();
    await expect(
      VRF.deploy(await mock.getAddress(), ethers.ZeroAddress, ethers.ZeroHash, 1n, 3, 200_000)
    ).to.be.revertedWithCustomError(VRF, "NotGovernor");
  });
});
