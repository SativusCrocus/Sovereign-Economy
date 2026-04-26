# DAES Audit Notes

Self-review of the Solidity interfaces and reference implementations. **This is NOT a substitute for a professional audit.** See [audit-package.md](audit-package.md) for the scope document and resolution status handed to the external auditor.

Findings are ordered by severity. Items marked **[RESOLVED]** are code-fixed + covered by tests in the Hardhat suite and the Foundry invariant runner.

## High — must fix before mainnet

**H-1. [RESOLVED] `DAESGovernor.executeAction` uses low-level `call` without re-entrancy protection.**
[src/DAESGovernor.sol](../contracts/src/DAESGovernor.sol) now inherits OpenZeppelin's `ReentrancyGuard`; `executeAction` and `rejectAction` are `nonReentrant`. Checks-effects-interactions (`a.executed = true` before the call) is preserved.

**H-2. [RESOLVED] `AgentAccount._recover` did not check for signature malleability.**
[src/AgentAccount.sol](../contracts/src/AgentAccount.sol) now uses `ECDSA.tryRecover` + `MessageHashUtils.toEthSignedMessageHash` from OpenZeppelin 5.x, which rejects `s > secp256k1n/2` and malformed signatures. Test `H-2: rejects malleable high-s signature variant` asserts the expected `SIG_VALIDATION_FAILED` return.

**H-3. [RESOLVED] `BridgeExecutor.validate` accepted any non-empty `quorumProof`.**
[src/BridgeExecutor.sol](../contracts/src/BridgeExecutor.sol) now decodes `quorumProof` as `(uint16 quorumBps, int64 sigmaBandE6, bytes signature)`, recovers the signer against `keccak256(block.chainid ‖ address(this) ‖ signalId ‖ quorumBps ‖ sigmaBandE6)` (EIP-191 prefixed), and rejects unless the signer equals `oracle.poster()`. Failure records an `OracleStale` failure with the circuit breaker and transitions the signal to REJECTED. The preimage already includes the `block.chainid`/`address(this)` domain separators that L-1 called out (addressed as part of Tier 4 cross-chain replay hardening).

## Medium — fix before prod

**M-1. [RESOLVED] `CircuitBreaker.recordFailure` was permissionless, letting an attacker spam failures and displace real ones from the ring.**
[src/CircuitBreaker.sol](../contracts/src/CircuitBreaker.sol) now gates `recordFailure` to `msg.sender == bridge`. The guardian wires the BridgeExecutor address once via `setBridge(address)` (reverts with `BridgeAlreadySet` on any second attempt; zero-address rejected). Deploy scripts call `setBridge` as a bootstrap step right after `BridgeExecutor` is deployed. The ring-displacement attack is no longer reachable because only the bridge itself records legitimate protocol-level failures. Tests `M-1: recordFailure rejects callers that aren't the bridge` and `M-1: setBridge is one-time only and guardian-gated` cover the new surface.

**M-2. [RESOLVED] `DAESGovernor` signer addresses are immutable.**
[src/DAESGovernor.sol](../contracts/src/DAESGovernor.sol) exposes `rotateSigner(SignerRole role, address newSigner)` gated on `msg.sender == address(this)`, only reachable through its own 3-of-5 stage/sign/execute pipeline. Zero-address rotations revert (`ZeroSigner`). Emits `SignerRotated(role, old, new)`.

**M-3. [RESOLVED] `AgentAccountFactory` salt formula diverged from the spec YAML.**
Resolved by picking option (b): the factory is the source of truth. `_salt = keccak256(abi.encodePacked(uint8(archetype), owner))` — one deterministic account per (archetype, owner) pair, matching the standard EIP-4337 smart-wallet pattern. `spec/components.yaml::account_abstraction.archetype_to_smart_account` now documents the exact formula and the archetype enum ordering instead of the outdated hex prefixes.

**M-4. [RESOLVED] `DAESOApp.send` was a shim that did not call the LZ endpoint.**
[src/DAESOApp.sol](../contracts/src/DAESOApp.sol) now inherits from the real `@layerzerolabs/lz-evm-oapp-v2/contracts/oapp/OApp.sol` (OAppSender + OAppReceiver). Owner-gated `sendMessage` delegates to `_lzSend`; `_lzReceive` handles inbound. `setPeer`/`setDelegate` flow through the governor because the governor is the OApp owner. Unit tests use `MockLZEndpoint` under `contracts/src/mocks/`.

**M-5. [RESOLVED] `CircuitBreaker.failuresInWindow` boundary at `t == lastReset` was untested.**
The `>` comparator is correct (failures at exactly `lastReset` are treated as pre-reset and excluded). Test `M-5: failuresInWindow excludes failures at exactly t == lastReset` now pins the semantics: it packs `reset()` + `recordFailure()` into the same block so they share `block.timestamp`, then asserts the failure is not counted. A sanity check on the next second confirms strictly-later failures still count.

## Low — polish

**L-1. Events don't include chain ID.**
Multi-chain deployments (Base + Optimism) emit identical event signatures. Indexers should include `chainId` or `block.chainid` when aggregating — not a contract bug, but a deployment readme item.

**L-2. No explicit upgrade path.**
Interfaces don't require upgradeability. If you later want to move to UUPS or Transparent Proxy, the current implementations are not storage-compatible. Decide up front whether upgradeability is in-scope; if not, that's a deliberate choice to document.

**L-3. [RESOLVED] `AgentAccount.executeBatch` uses `require` with a string reason.**
Replaced with `error LengthMismatch()` on the length check, and inner-target failures now bubble up via `_bubbleRevert` (assembly revert preserving the callee's revert data) instead of re-wrapping in `require(ok, _revertReason(ret))`. `execute` was converted in the same pass for consistency.

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
- **[RESOLVED]** Cross-chain replay between Base and Optimism. All current signed preimages in the repo include `block.chainid`:
  - `BridgeExecutor._verifyAttestation` — `keccak256(block.chainid ‖ address(this) ‖ signalId ‖ quorumBps ‖ sigmaBandE6)`, tested by `rejects attestation signed over a different chainId`.
  - `AgentAccount.validateUserOp` — consumes the EntryPoint v0.7 `userOpHash`, which is defined as `keccak256(keccak256(packedUserOp) ‖ entryPoint ‖ chainid)`.
  - `services/mcp-gateway/app/handlers/wallet_sign.py::user_op_hash` — mirrors the on-chain definition, packing `chain_id.to_bytes(32, "big")` into the outer hash.
  - `DAESOApp` does **not** sign or verify application-level payloads today; it is a pure `_lzSend` / `_lzReceive` relay. **Forward guardrail:** any future payload-level signing over OApp `message` bytes must include `block.chainid` in the preimage.
- **[DECISION — accepted risk, M1]** Centralization risk around `SwarmConsensusOracle.poster`. One key posts all signals and signs all BridgeExecutor attestations. Three options were considered:
  - **A. Multi-poster allowlist (any-of-N).** *Rejected.* This is a security regression: the weakest key in the set determines the security of the whole attestation surface, because each allowlisted key is independently sufficient.
  - **B. Single poster + documented risk acceptance + governor-gated rotation.** *Chosen for M1.* Rotation flows through `DAESGovernor.rotatePoster` (3-of-5 + 86400s). Compromise response: `rejectAction` blocks the staged signal, `rotatePoster` swaps the key, `CircuitBreaker.setBridge` is one-time only so the attacker can't rewire the failure path.
  - **C. Threshold ECDSA or BLS k-of-N signing.** *Correct long-term answer, out of scope for M1.* Needs a threshold-sig library and coordinated off-chain signer software; tracked for a later milestone.
  - **Residual risk under option B:** a compromised poster can inject false signals and sign matching attestations, driving them to `MULTI_SIG_STAGED`. The 3-of-5 + 86400s governor gate is the primary defense — human signers are expected to `rejectAction` bogus stages during the timelock window.
- Economic attacks: an attacker who controls 33% of the swarm agents could push quorum to exactly 67% and attempt adversarial signals. See the `BlackSwan` archetype share (15%) and budget for this in the staking/slashing layer that is out of current scope.
- Formal verification of the Bridge FSM: the empirical property `never EXECUTED without 3-of-5 && 86400s elapsed && !isPaused` is now fuzzed by [contracts/test-forge/BridgeInvariant.t.sol](../contracts/test-forge/BridgeInvariant.t.sol) (64 × 64 Foundry invariant runs). A deductive proof (Certora or Halmos) is still out of scope.

## Swarm seed

- **[RESOLVED path, wiring pending]** Swarm seed source moved from `SEED` env var to on-chain `SwarmSeedVRF.latestSeed()`. The contract draws randomness from Chainlink VRF v2.5; rotation is `onlyGovernor`, so a fresh seed requires the 3-of-5 + 86400s pipeline. The runtime (`services/agent-swarm-runtime/src/seed_source.py`) resolves the seed by calling `latestSeed()` via `eth_call` when `SEED_VRF_RPC` + `SEED_VRF_CONTRACT` are set, and falls back to the `SEED` env var otherwise. Production bring-up: deploy the contract, seed a VRF subscription, run one `requestSeed` flow through the governor, wait for fulfilment, then set the two env vars and restart the swarm. Unit tests live in [contracts/test/SwarmSeedVRF.test.ts](../contracts/test/SwarmSeedVRF.test.ts).

## IPFS audit log

- **[RESOLVED]** The audit-log pin store must not leak to the public IPFS DHT. Two independent gates now enforce that:
  1. **Private libp2p swarm.** `deploy/docker-compose.yaml` runs kubo with `LIBP2P_FORCE_PNET=1` and mounts `deploy/ipfs/swarm.key` (gitignored) into `/data/ipfs/swarm.key`. libp2p rejects any peer that doesn't present the same pre-shared key, so bootstrap peers, DHT clients, and public gateways cannot connect. Key generation: `bash deploy/ipfs/generate-swarm-key.sh`; rotation is non-graceful — every private-swarm peer must be updated at the same time.
  2. **Authenticated public HTTP gateway.** The kubo API (`:5001`, pin/add privileges) stays on the internal `daes-net` and is never routed through Caddy. The read-only HTTP gateway (`:8080`) is fronted by `{env.DAES_IPFS_DOMAIN}` in [deploy/Caddyfile](../deploy/Caddyfile) with `basic_auth` — only operators who hold `DAES_IPFS_USER` + `DAES_IPFS_PASS_HASH` can resolve CIDs from outside the swarm. Hash is generated with `caddy hash-password` and stored in `deploy/.env` (gitignored), not committed.
- **Residual risk.** A compromised private-swarm peer can exfiltrate any pinned CID. Mitigate by: (a) treating peer hosts as Tier 1 secrets (same handling as the signer HSMs — see [secrets-hardening.md](secrets-hardening.md)), and (b) rotating the swarm key after any peer decommission. Content-level encryption of audit-log payloads before pinning is tracked as forward work; today the private swarm + basic-auth combination is the line of defense.

## Tooling checklist before commissioning an audit

- [x] `slither .` — static analysis (zero findings expected; gated in
      [`.github/workflows/ci.yml::slither`](../.github/workflows/ci.yml))
- [x] `solhint "src/**/*.sol"` — style + security lints, `--max-warnings 0`
      (gated in [`.github/workflows/ci.yml::solhint`](../.github/workflows/ci.yml))
- [ ] `forge coverage` or `npx hardhat coverage` ≥ 90% — not yet measured;
      track as an audit-package precondition
- [x] Invariant / fuzz tests (Foundry) on `BridgeExecutor` FSM transitions —
      [contracts/test-forge/BridgeInvariant.t.sol](../contracts/test-forge/BridgeInvariant.t.sol),
      256 runs × 128 depth, gated in
      [`.github/workflows/ci.yml::foundry-invariants`](../.github/workflows/ci.yml)
- [x] Run against Echidna — nightly multi-hour campaign in
      [`.github/workflows/nightly.yml::echidna-bridge`](../.github/workflows/nightly.yml).
      Hosted-runner cap is ~5h50m; the workflow_dispatch input
      `echidna_timeout_s` accepts 86400 (24h) on a self-hosted runner.
      Smoke budget for PR CI lives in [contracts/echidna.yaml](../contracts/echidna.yaml).
- [n/a] Storage layout comparison — non-upgradeable by design (see L-2);
      contracts are not deployed behind a proxy.
