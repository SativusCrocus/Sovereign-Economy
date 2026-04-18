// SPDX-License-Identifier: MIT
// contracts/interfaces/IBridgeExecutor.sol
pragma solidity ^0.8.24;

// File-level constants (interfaces cannot declare state variables).
uint32 constant BRIDGE_GUARDIAN_TIMEOUT_S   = 3600;
uint32 constant BRIDGE_EXECUTION_TIMELOCK_S = 86400;
uint16 constant BRIDGE_QUORUM_BPS           = 6700;       // 67%
int64  constant BRIDGE_SIGMA_BAND_E6        = 1_500_000;  // 1.5 in 1e6 fixed-point

/// @title IBridgeExecutor
/// @notice On-chain mirror of the Decision-to-Action Bridge FSM from
///         spec/components.yaml::bridge_fsm. Off-chain runtime advances
///         states by calling the transition functions; contract enforces
///         legality of every transition.
interface IBridgeExecutor {
    enum FSMState {
        IDLE,
        SWARM_SIGNAL_RECEIVED,
        SIGNAL_VALIDATED,
        THRESHOLD_CHECK,
        MULTI_SIG_STAGED,
        GUARDIAN_TIMEOUT,
        EXECUTED,
        REJECTED
    }

    enum SignalKind { BUY, SELL, HOLD, ESCALATE_TO_GUARDIAN }

    event SignalReceived(bytes32 indexed signalId, SignalKind kind, bytes32 proofHash);
    event StateTransitioned(bytes32 indexed signalId, FSMState from, FSMState to);
    event TimeoutTriggered(bytes32 indexed signalId, uint64 elapsed);

    function onSwarmSignal(bytes32 signalId, SignalKind kind, bytes32 proofHash) external;
    function validate(bytes32 signalId, bytes calldata quorumProof) external;
    function thresholdCheck(bytes32 signalId, uint16 quorumBps, int64 sigmaE6) external;
    function stageForMultiSig(bytes32 signalId, bytes32 actionId) external;
    function timeout(bytes32 signalId) external;
    function markExecuted(bytes32 signalId) external;
    function markRejected(bytes32 signalId, string calldata reason) external;

    function stateOf(bytes32 signalId) external view returns (FSMState);
}
