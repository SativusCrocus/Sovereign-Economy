# DAES Audit Package

Scope document for a third-party security audit of the DAES Solidity layer. Hand this doc plus the commit SHA to the engagement lead before kickoff; everything referenced here is either a file in-tree or a resolved finding callable out of [audit-notes.md](audit-notes.md).

## Recommended auditors (pick one)

- **Trail of Bits** — strong on FSM / state-machine invariants, Foundry + formal.
- **Spearbit** — fast turnaround, deep EIP-4337 + LayerZero experience.
- **Code4rena** — contest format; good when you want broad adversarial coverage rather than a deep dive.

For a 1-of-3 bridge with off-chain economic logic, Trail of Bits or Spearbit is the right fit. Code4rena underprices invariants work.

## In-scope contracts (commit SHA = `git rev-parse HEAD`)

```
contracts/src/DAESGovernor.sol            3-of-5 multi-sig, self-gated rotateSigner
contracts/src/BridgeExecutor.sol          FSM: IDLE → ... → EXECUTED / REJECTED
contracts/src/SwarmConsensusOracle.sol    Signal registry + governor-gated rotatePoster
contracts/src/CircuitBreaker.sol          Ring-buffer failure detector, guardian reset
contracts/src/GuardianTimelock.sol        OZ TimelockController (thin wrapper, min 86400s)
contracts/src/DAESOApp.sol                LayerZero V2 OApp, owner = governor
contracts/src/AgentAccount.sol            EIP-4337 v0.7 smart account
contracts/src/AgentAccountFactory.sol     CREATE2 factory, archetype-tagged
contracts/src/SwarmSeedVRF.sol            Chainlink VRF v2.5 seed source, governor-gated requestSeed
contracts/src/mocks/MockLZEndpoint.sol    Test-only; do not deploy to any live chain
contracts/src/mocks/MockVRFCoordinator.sol Test-only; do not deploy to any live chain
```

Interfaces live in `contracts/interfaces/` and mirror the implementations. Out of scope: off-chain Python / TypeScript services, frontend, Docker Compose stack.

## Resolution status of the self-audit findings

The full list (with file/line references) is in [audit-notes.md](audit-notes.md). Summary:

| Finding | Title | Status |
|---|---|---|
| H-1 | `executeAction` reentrancy | RESOLVED (OZ ReentrancyGuard; `nonReentrant` on execute + reject) |
| H-2 | `AgentAccount` malleability | RESOLVED (OZ ECDSA + MessageHashUtils; tryRecover with error-surface) |
| H-3 | `validate` accepted any non-empty blob | RESOLVED (ECDSA attestation vs `oracle.poster()`; chainid + address(this) domain sep) |
| M-1 | CircuitBreaker ring saturation | RESOLVED (`recordFailure` gated to bridge; guardian one-time `setBridge`) |
| M-2 | Governor signers immutable | RESOLVED (`rotateSigner`, self-gated via 3-of-5 + 86400s) |
| M-3 | Factory salt divergence from spec YAML | RESOLVED (spec updated to document `keccak256(archetype‖owner)`) |
| M-4 | OApp shim | RESOLVED (real LayerZero V2 OApp inheritance) |
| M-5 | `failuresInWindow` `>` vs `>=` on reset second | RESOLVED (boundary test pins `t == lastReset` semantics) |
| L-1 | Events missing chainid for cross-chain indexing | indexer concern; no contract change |
| L-2 | Upgrade path | intentional (non-upgradeable) |
| L-3 | `executeBatch` uses `require(string)` | cosmetic |
| L-4 | `posterAgentRuntime` always equals `poster` | cosmetic — may become useful if poster becomes a set |
| L-5 | `DAESOApp` missing `PeerSet` event | RESOLVED implicitly — real OAppCore emits `PeerSet` |

Tier 4 hardening beyond the self-audit:

- **Cross-chain replay protection** — attestation preimage now includes `block.chainid` and `address(this)`. Tests assert rejection of both a cross-chain-signed proof and a proof bound to a different BridgeExecutor address.
- **Poster rotation** — `SwarmConsensusOracle.rotatePoster(address)` gated on `msg.sender == governor`, reached via the same 3-of-5 + 86400s pipeline. Full k-of-n threshold posting is deferred to a follow-up scoped as its own audit item.

## Test coverage handed to the auditor

Hardhat suite — 36 tests in [contracts/test/](../contracts/test/).

```
AgentAccount + Factory
  ✔ deterministic address, redeploy returns same, archetype tag preserved
  ✔ validateUserOp returns 0 for owner-signed hash, 1 otherwise
  ✔ H-2: rejects malleable high-s signature variant

BridgeExecutor
  ✔ walks happy path through FSM states with real attestation
  ✔ rejects attestation signed by wrong key (H-3)
  ✔ rejects attestation signed over a different chainId (Tier 4 replay)
  ✔ rejects attestation signed for a different BridgeExecutor (Tier 4 replay)
  ✔ rejects empty proof (H-3 old bypass)
  ✔ rejects when quorum insufficient
  ✔ only permits timeout after 3600s
  ✔ blocks transitions when circuit breaker paused

DAESGovernor
  ✔ stages, collects 3 sigs, executes only after 86400s
  ✔ rejects unknown signers and wrong role
  ✔ M-2: rotateSigner is self-gated and requires 3-of-5 + 86400s
  ✔ M-2: rotateSigner rejects the zero address

DAESOApp (LayerZero V2)
  ✔ wires delegate with the endpoint on deploy and sets owner to governor
  ✔ only owner (governor) can setPeer
  ✔ sendMessage reverts without a peer (NoPeer)
  ✔ sendMessage delivers a MessageSent event once peer is set
  ✔ sendMessage rejects non-owner callers
  ✔ quoteSend returns the endpoint's quote

SwarmConsensusOracle
  ✔ stores signals and updates latestSignalHash
  ✔ rejects non-poster, duplicates, bad kind
  ✔ Tier 4: rotatePoster is governor-only and emits PosterRotated

CircuitBreaker
  ✔ trips after >2 failures in 600s window
  ✔ does not trip if failures fall out of the window
  ✔ reset works only for guardian and only when paused
  ✔ M-1: recordFailure rejects callers that aren't the bridge
  ✔ M-1: setBridge is one-time only and guardian-gated
  ✔ M-5: failuresInWindow excludes failures at exactly t == lastReset

SwarmSeedVRF
  ✔ rejects requestSeed from non-governor
  ✔ governor can requestSeed; state stays NoSeedYet until fulfillment
  ✔ only the coordinator can fulfill; seed persists after fulfillment
  ✔ rejects double-fulfillment of the same requestId
  ✔ reverts constructor on zero coordinator or zero governor

GuardianTimelock — 1 test
```

Foundry invariant suite — 2 invariants, 256 runs × 128 depth (config in [contracts/foundry.toml](../contracts/foundry.toml)):

```
contracts/test-forge/BridgeInvariant.t.sol
  invariant_executedImpliesFullLegalPath
    → property: for every signalId in be.stateOf == EXECUTED,
      the handler must have observed a full legal path:
        stage → 3-of-5 signAction → vm.warp 86400s → executeAction
        while breaker.isPaused() == false.
  invariant_executedHas3SigsAnd86400s
    → secondary check on the same property using sig-count + elapsed-time
      tracking; redundant by design so a buggy handler can't silently
      mask the primary invariant.
    → handler exposes explicit attack handlers (direct markExecuted,
      spoofed governor, no-signatures, early-exec, paused-exec).
      None reach EXECUTED; all reverts are counted (fail_on_revert=false).
```

Run instructions:

```bash
cd contracts
npm install --legacy-peer-deps
npm run build                         # hardhat compile + extract-abi
npx hardhat test                      # Hardhat
git clone --depth 1 https://github.com/foundry-rs/forge-std lib/forge-std
forge test --match-path "test-forge/**" -vv
```

## Deployment topology

- Testnets: Base Sepolia (chainId 84532, EID 40245) + OP Sepolia (chainId 11155420, EID 40232).
- Mainnets (gated behind `DAES_ALLOW_MAINNET=1`): Base (8453, EID 30184) + Optimism (10, EID 30111).
- LayerZero V2 endpoint: `0x1a44076050125825900e736c501f859c50fE728c` on mainnet, `0x6EDCE65403992e310A62460808c4b910D972f10f` on Sepolia testnets.
- EIP-4337 EntryPoint: `0x0000000071727De22E5E9d8BAf0edAc6f37da032` (canonical v0.7 singleton, same on all chains).
- Deploy order — **governor first** because `SwarmConsensusOracle` binds to `governor` at construction for `rotatePoster` gating.

See [contracts/scripts/chains.ts](../contracts/scripts/chains.ts) for per-chain config and [contracts/scripts/deploy.ts](../contracts/scripts/deploy.ts) for the full sequence.

## Out-of-scope but flagged

- Economic / game-theoretic resilience of the off-chain swarm (archetype incentives, BlackSwan 15% share). Not a Solidity concern but shapes the attestation's trust assumptions.
- Gas-griefing on the EIP-4337 validation path — bundler rules (EIP-7562 storage access rules) may restrict storage reads we currently do.
- Formal deductive proof (Certora / Halmos) of the FSM. Empirical invariant testing via Foundry only.
