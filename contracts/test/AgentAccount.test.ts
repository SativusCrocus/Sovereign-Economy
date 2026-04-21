// contracts/test/AgentAccount.test.ts
import { expect } from "chai";
import { ethers } from "hardhat";

describe("AgentAccount + Factory", () => {
  async function deploy() {
    const [entryPoint, owner, other] = await ethers.getSigners();
    const F = await ethers.getContractFactory("AgentAccountFactory");
    const factory = await F.deploy(entryPoint.address);
    return { factory, entryPoint, owner, other };
  }

  it("deterministic address, redeploy returns same, archetype tag preserved", async () => {
    const { factory, owner } = await deploy();
    const predicted = await factory.predictAddress(0 /*Speculator*/, owner.address);
    const tx1 = await factory.createAccount(0, owner.address);
    await tx1.wait();
    // Second call must be a no-op that returns the same address.
    const tx2 = await factory.createAccount(0, owner.address);
    await tx2.wait();
    const acct = await ethers.getContractAt("AgentAccount", predicted);
    expect(await acct.archetype()).to.equal(0);
    expect(await acct.owner()).to.equal(owner.address);
  });

  it("validateUserOp returns 0 for owner-signed hash, 1 otherwise", async () => {
    const { factory, entryPoint, owner, other } = await deploy();
    const predicted = await factory.predictAddress(1 /*Arbitrageur*/, owner.address);
    await factory.createAccount(1, owner.address);
    const acct = await ethers.getContractAt("AgentAccount", predicted);

    const hash = ethers.keccak256(ethers.toUtf8Bytes("userOpHash"));
    const sigOwner  = await owner.signMessage(ethers.getBytes(hash));
    const sigOther  = await other.signMessage(ethers.getBytes(hash));
    const op = {
      sender: predicted,
      nonce: 0,
      initCode: "0x",
      callData: "0x",
      accountGasLimits: ethers.ZeroHash,
      preVerificationGas: 0,
      gasFees: ethers.ZeroHash,
      paymasterAndData: "0x",
      signature: sigOwner,
    };
    const r1 = await acct.connect(entryPoint).validateUserOp.staticCall(op, hash, 0);
    expect(r1).to.equal(0n);
    op.signature = sigOther;
    const r2 = await acct.connect(entryPoint).validateUserOp.staticCall(op, hash, 0);
    expect(r2).to.equal(1n);
  });

  it("H-2: rejects malleable high-s signature variant", async () => {
    const { factory, entryPoint, owner } = await deploy();
    const predicted = await factory.predictAddress(0, owner.address);
    await factory.createAccount(0, owner.address);
    const acct = await ethers.getContractAt("AgentAccount", predicted);

    const hash = ethers.keccak256(ethers.toUtf8Bytes("userOpHash"));
    const sigLow = await owner.signMessage(ethers.getBytes(hash));

    // Malleable variant: (r, n - s, v ^ 1). Recovers the same pubkey but
    // MUST be rejected per EIP-2 / SEC1. OZ ECDSA enforces this.
    const SECP256K1_N =
      0xfffffffffffffffffffffffffffffffebaaedce6af48a03bbfd25e8cd0364141n;
    const sigBytes = ethers.getBytes(sigLow);
    expect(sigBytes.length).to.equal(65);
    const r = sigBytes.slice(0, 32);
    const sLow = BigInt(ethers.hexlify(sigBytes.slice(32, 64)));
    const v = sigBytes[64];
    const sHigh = SECP256K1_N - sLow;
    const sHighBytes = ethers.getBytes(ethers.zeroPadValue(ethers.toBeHex(sHigh), 32));
    const vFlipped = v === 27 ? 28 : 27;
    const sigMalleable = ethers.concat([r, sHighBytes, new Uint8Array([vFlipped])]);

    const op = {
      sender: predicted,
      nonce: 0,
      initCode: "0x",
      callData: "0x",
      accountGasLimits: ethers.ZeroHash,
      preVerificationGas: 0,
      gasFees: ethers.ZeroHash,
      paymasterAndData: "0x",
      signature: sigMalleable,
    };
    const r1 = await acct.connect(entryPoint).validateUserOp.staticCall(op, hash, 0);
    expect(r1).to.equal(1n); // SIG_VALIDATION_FAILED
  });
});
