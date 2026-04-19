# DAES Audit Notes

Self-review of the Solidity interfaces and reference implementations. **This is NOT a substitute for a professional audit.** Any production deployment should commission a third-party audit (Trail of Bits, OpenZeppelin, Spearbit, Code4rena) before touching real funds.

The notes below are the kind of findings a first-pass review from a senior Solidity engineer would flag. Ordered by severity.

## High — must fix before mainnet

**H-1. `DAESGovernor.executeAction` uses low-level `call` without re-entrancy protection.**
[src/DAESGovernor.sol:76](../contracts/src/DAESGovernor.sol) sets `a.executed = true` *before* the external call, which mitigates the classic reentrancy draining pattern. However, an attacker-controlled target can still re-enter `stageAction` (different `actionId`) to queue additional actions while the caller has unlimited gas. Add `ReentrancyGuard` (OZ) to `executeAction` and `rejectAction`, or document the checks-effects-interactions invariant explicitly.

**H-2. `AgentAccount._recover` does not check for signature malleability.**
[src/AgentAccount.sol:94-98](../contracts/src/AgentAccount.sol) accepts any `s` value. Per EIP-2 / SEC1, the upper half of the curve (`s > secp256k1n/2`) should be rejected to prevent tx-hash malleability. Swap for OZ's `ECDSA.recover` which enforces this.

**H-3. `BridgeExecutor.validate` accepts any non-empty `quorumProof`.**
The current check is `quorumProof.length == 0`. [src/BridgeExecutor.sol:64](../contracts/src/BridgeExecutor.sol). Any operator-supplied non-empty blob passes. A real implementation must verify the proof is a signed attestation from `SwarmConsensusOracle` (or the runtime's EOA), e.g. recover an ECDSA signature over `keccak256(signalId || quorumBps || sigmaE6)` and compare against `oracle.poster()`.

## Medium — fix before prod

**M-1. `CircuitBreaker` uses a fixed-size ring of length `FAILURE_THRESHOLD+1`.**
If attackers spam `recordFailure` faster than the 600s window, legitimate failures outside the window still displace real failures inside the window. [src/CircuitBreaker.sol:12](../contracts/src/CircuitBreaker.sol). Either gate `recordFailure` to the bridge/oracle, or upgrade the ring to a bounded-window count that truly reflects the last 600s.

**M-2. `DAESGovernor` signer addresses are immutable.**
Setting `address[5] signerOf` in the constructor is fine for the first epoch, but there is no rotation path. Add a `rotateSigner(uint8 role, address newSigner)` gated on a 3-of-5 quorum + timelock execution of `rotateSigner` itself. Without this, a single compromised key is unrecoverable without a contract redeploy.

**M-3. `AgentAccountFactory.predictAddress` diverges from the factory's own salt logic when `owner` changes.**
By design (`_salt = keccak(archetype || owner)`), but the off-chain YAML spec declares archetype-only salts. Decide: either (a) the off-chain spec is the source of truth and the factory should derive salt from archetype only, or (b) the factory is the source of truth and the YAML doc is stale. Current code is (b) — tighten or align the docs.

**M-4. `DAESOApp.send` is a shim that does not call the LZ endpoint.**
[src/DAESOApp.sol:55-71](../contracts/src/DAESOApp.sol). Real production must inherit from `@layerzerolabs/lz-evm-oapp-v2`'s `OAppSender` and delegate to `IEndpointV2.send`. The shim is adequate for unit tests only. Do not deploy the shim to mainnet.

**M-5. `CircuitBreaker.failuresInWindow` compares `t > lastReset` as `>`.**
A failure recorded at the exact second of reset is counted. Trivial edge case, but worth tightening to `t > lastReset` semantics matching real-world "after reset" intent (which it does) — just be sure the test covers `t == lastReset` explicitly.

## Low — polish

**L-1. Events don't include chain ID.**
Multi-chain deployments (Base + Optimism) emit identical event signatures. Indexers should include `chainId` or `block.chainid` when aggregating — not a contract bug, but a deployment readme item.

**L-2. No explicit upgrade path.**
Interfaces don't require upgradeability. If you later want to move to UUPS or Transparent Proxy, the current implementations are not storage-compatible. Decide up front whether upgradeability is in-scope; if not, that's a deliberate choice to document.

**L-3. `AgentAccount.executeBatch` uses `require` with a string reason.**
Gas-wise, convert to a custom error (`error LengthMismatch();`). Minor.

**L-4. `SwarmConsensusOracle` stores `posterAgentRuntime = msg.sender`, but only a single `poster` can ever call.**
Field is always equal to `poster`. Either drop it or allow a set of runtime addresses (and record which one posted).

**L-5. No events for `setPeer` in `DAESOApp`.**
[src/DAESOApp.sol:43-45](../contracts/src/DAESOApp.sol). Add `event PeerSet(uint32 indexed eid, bytes32 peer)` so off-chain tooling can trace peer changes.

## Interface conformance

- **IAgentAccount.PackedUserOperation** matches EIP-4337 v0.7's `PackedUserOperation` struct field-for-field, including the packed `accountGasLimits` (verificationGasLimit || callGasLimit) and `gasFees` (maxPriorityFeePerGas || maxFeePerGas) bytes32 encodings. ✓
- **ILayerZeroOApp.MessagingParams / MessagingReceipt / Origin** match LayerZero V2's `IEndpointV2` types. ✓
- **IGuardianTimelock** re-declares OZ `TimelockController`'s event/function surface; our implementation inherits from the real OZ contract, so conformance is automatic.
- **IDAESGovernor.SignerRole** enum ordering matches `spec/components.yaml::multi_sig.signers`. Any reorder is a breaking change — document and test.

## What a full audit would additionally look at

Beyond this self-review:

- Gas-griefing surface on the bundler path (EntryPoint v0.7 `validateUserOp` rules).
- Cross-chain replay between Base and Optimism — any signed message must include `block.chainid` in the preimage.
- Centralization risk around `SwarmConsensusOracle.poster` — one key posts all signals; compromise = full hijack of the bridge.
- Economic attacks: an attacker who controls 33% of the swarm agents could push quorum to exactly 67% and attempt adversarial signals. See the `BlackSwan` archetype share (15%) and budget for this in the staking/slashing layer that is out of current scope.
- Formal verification of the Bridge FSM: `never EXECUTED without 3-of-5 && 86400s elapsed && !isPaused`. Use Certora or Halmos.

## Tooling checklist before commissioning an audit

- [ ] `slither .` — static analysis (detects many H/M findings automatically)
- [ ] `solhint "src/**/*.sol"` — style + security lints
- [ ] `forge coverage` or `npx hardhat coverage` ≥ 90%
- [ ] Invariant / fuzz tests (Foundry) on `BridgeExecutor` FSM transitions
- [ ] Run against Echidna for 24h
- [ ] Storage layout comparison between versions if you ever add proxies
