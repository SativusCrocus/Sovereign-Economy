// SPDX-License-Identifier: MIT
// contracts/interfaces/ISwarmConsensusOracle.sol
pragma solidity ^0.8.24;

/// @title ISwarmConsensusOracle
/// @notice On-chain record of swarm consensus signals. Off-chain
///         agent-swarm-runtime computes quorum + sigma band, signs the
///         result (keccak256 of sorted agent state hashes), and posts it.
///         BridgeExecutor reads this oracle in the SIGNAL_VALIDATED step.
interface ISwarmConsensusOracle {
    struct Signal {
        bytes32 signalHash;    // keccak256 of canonical consensus payload
        uint8   kind;          // 0=BUY, 1=SELL, 2=HOLD, 3=ESCALATE
        uint16  quorumBps;     // e.g. 6700 for 67%
        int64   sigmaBandE6;   // 1.5e6 ⇒ ±1.5σ
        uint64  postedAt;
        address posterAgentRuntime;
    }

    event SwarmSignalPosted(bytes32 indexed signalHash, uint8 kind, uint16 quorumBps, int64 sigmaBandE6);
    event PosterRotated(address oldPoster, address newPoster);

    function postSignal(bytes32 signalHash, uint8 kind, uint16 quorumBps, int64 sigmaBandE6) external;
    function getSignal(bytes32 signalHash) external view returns (Signal memory);
    function latestSignalHash() external view returns (bytes32);

    /// @notice Expected ECDSA signer of off-chain attestations (the agent-swarm
    ///         runtime's EOA). BridgeExecutor.validate compares recovered
    ///         signers against this address.
    function poster() external view returns (address);

    /// @notice Rotate the poster EOA. Gated on `msg.sender == governor`, which
    ///         only reaches this method through DAESGovernor's 3-of-5 +
    ///         86400s staged-action pipeline. Addresses the single-key
    ///         centralization risk noted in docs/audit-notes.md.
    function rotatePoster(address newPoster) external;
}
