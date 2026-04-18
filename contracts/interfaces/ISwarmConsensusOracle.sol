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

    function postSignal(bytes32 signalHash, uint8 kind, uint16 quorumBps, int64 sigmaBandE6) external;
    function getSignal(bytes32 signalHash) external view returns (Signal memory);
    function latestSignalHash() external view returns (bytes32);
}
