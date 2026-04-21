// contracts/test/DAESOApp.test.ts
import { expect } from "chai";
import { ethers } from "hardhat";

describe("DAESOApp (LayerZero V2)", () => {
  async function deploy() {
    const [, governor, outsider] = await ethers.getSigners();
    const MockEndpoint = await ethers.getContractFactory("MockLZEndpoint");
    const endpoint = await MockEndpoint.deploy();
    const OApp = await ethers.getContractFactory("DAESOApp");
    const oapp = await OApp.deploy(await endpoint.getAddress(), governor.address);
    return { endpoint, oapp, governor, outsider };
  }

  it("wires delegate with the endpoint on deploy and sets owner to governor", async () => {
    const { endpoint, oapp, governor } = await deploy();
    expect(await oapp.owner()).to.equal(governor.address);
    expect(await endpoint.delegates(await oapp.getAddress())).to.equal(governor.address);
  });

  it("only owner (governor) can setPeer", async () => {
    const { oapp, governor, outsider } = await deploy();
    const peer = ethers.zeroPadValue(outsider.address, 32);
    await expect(oapp.connect(outsider).setPeer(40245, peer))
      .to.be.revertedWithCustomError(oapp, "OwnableUnauthorizedAccount");
    await oapp.connect(governor).setPeer(40245, peer);
    expect(await oapp.peers(40245)).to.equal(peer);
  });

  it("sendMessage reverts without a peer (NoPeer)", async () => {
    const { oapp, governor } = await deploy();
    await expect(
      oapp.connect(governor).sendMessage(40245, "0xdeadbeef", "0x", { value: 1 }),
    ).to.be.revertedWithCustomError(oapp, "NoPeer");
  });

  it("sendMessage delivers a MessageSent event once peer is set", async () => {
    const { oapp, governor, outsider } = await deploy();
    const peer = ethers.zeroPadValue(outsider.address, 32);
    await oapp.connect(governor).setPeer(40245, peer);
    await expect(
      oapp.connect(governor).sendMessage(40245, "0xdeadbeef", "0x", { value: 1 }),
    ).to.emit(oapp, "MessageSent");
  });

  it("sendMessage rejects non-owner callers", async () => {
    const { oapp, outsider } = await deploy();
    await expect(
      oapp.connect(outsider).sendMessage(40245, "0xdeadbeef", "0x", { value: 1 }),
    ).to.be.revertedWithCustomError(oapp, "OwnableUnauthorizedAccount");
  });

  it("quoteSend returns the endpoint's quote", async () => {
    const { oapp, governor, outsider } = await deploy();
    const peer = ethers.zeroPadValue(outsider.address, 32);
    await oapp.connect(governor).setPeer(40245, peer);
    const fee = await oapp.quoteSend(40245, "0xdeadbeef", "0x", false);
    expect(fee.nativeFee).to.equal(1n);
    expect(fee.lzTokenFee).to.equal(0n);
  });
});
