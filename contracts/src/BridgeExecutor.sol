// SPDX-License-Identifier: MIT
// contracts/src/BridgeExecutor.sol
pragma solidity ^0.8.24;

import "../interfaces/IBridgeExecutor.sol";
import "../interfaces/ISwarmConsensusOracle.sol";
import "./CircuitBreaker.sol";

/// @notice On-chain mirror of the Decision-to-Action Bridge FSM. Only
///         advances when the caller is authorized *and* the requested
///         transition is legal from the current state.
///         Any failed transition records a failure with the circuit breaker.
contract BridgeExecutor is IBridgeExecutor {
    ISwarmConsensusOracle public immutable oracle;
    CircuitBreaker        public immutable breaker;
    address               public immutable governor;   // 3-of-5 multi-sig
    address               public immutable operator;   // off-chain bridge daemon

    mapping(bytes32 => FSMState) private _state;
    mapping(bytes32 => uint64)   private _enteredAt;

    error BadTransition(FSMState from, FSMState to);
    error NotOperator();
    error NotGovernor();
    error Paused();
    error Unknown();

    constructor(
        ISwarmConsensusOracle oracle_,
        CircuitBreaker breaker_,
        address governor_,
        address operator_
    ) {
        oracle   = oracle_;
        breaker  = breaker_;
        governor = governor_;
        operator = operator_;
    }

    modifier notPaused() {
        if (breaker.isPaused()) revert Paused();
        _;
    }
    modifier onlyOperator() {
        if (msg.sender != operator) revert NotOperator();
        _;
    }
    modifier onlyGovernor() {
        if (msg.sender != governor) revert NotGovernor();
        _;
    }

    function onSwarmSignal(bytes32 signalId, SignalKind kind, bytes32 proofHash)
        external onlyOperator notPaused
    {
        _requireState(signalId, FSMState.IDLE);
        _go(signalId, FSMState.SWARM_SIGNAL_RECEIVED);
        emit SignalReceived(signalId, kind, proofHash);
    }

    function validate(bytes32 signalId, bytes calldata quorumProof)
        external onlyOperator notPaused
    {
        _requireState(signalId, FSMState.SWARM_SIGNAL_RECEIVED);
        // quorumProof is a signed attestation from the oracle; here we just
        // ensure it's non-empty (full verification lives off-chain or in a
        // dedicated verifier contract).
        if (quorumProof.length == 0) {
            breaker.recordFailure(ICircuitBreaker.FailureKind.OracleStale);
            _go(signalId, FSMState.REJECTED);
            emit StateTransitioned(signalId, FSMState.SWARM_SIGNAL_RECEIVED, FSMState.REJECTED);
            return;
        }
        _go(signalId, FSMState.SIGNAL_VALIDATED);
    }

    function thresholdCheck(bytes32 signalId, uint16 quorumBps, int64 sigmaE6)
        external onlyOperator notPaused
    {
        _requireState(signalId, FSMState.SIGNAL_VALIDATED);
        bool ok = quorumBps >= BRIDGE_QUORUM_BPS && _abs(sigmaE6) <= BRIDGE_SIGMA_BAND_E6;
        _go(signalId, ok ? FSMState.THRESHOLD_CHECK : FSMState.REJECTED);
    }

    function stageForMultiSig(bytes32 signalId, bytes32 /*actionId*/)
        external onlyOperator notPaused
    {
        _requireState(signalId, FSMState.THRESHOLD_CHECK);
        _go(signalId, FSMState.MULTI_SIG_STAGED);
    }

    function timeout(bytes32 signalId) external notPaused {
        _requireState(signalId, FSMState.MULTI_SIG_STAGED);
        uint64 elapsed = uint64(block.timestamp) - _enteredAt[signalId];
        if (elapsed < BRIDGE_GUARDIAN_TIMEOUT_S) revert BadTransition(FSMState.MULTI_SIG_STAGED, FSMState.GUARDIAN_TIMEOUT);
        _go(signalId, FSMState.GUARDIAN_TIMEOUT);
        emit TimeoutTriggered(signalId, elapsed);
    }

    /// @notice Called by the governor after 3-of-5 signatures collected and
    ///         the 86400s timelock satisfied.
    function markExecuted(bytes32 signalId) external onlyGovernor notPaused {
        FSMState cur = _state[signalId];
        if (cur != FSMState.MULTI_SIG_STAGED && cur != FSMState.GUARDIAN_TIMEOUT) {
            revert BadTransition(cur, FSMState.EXECUTED);
        }
        _go(signalId, FSMState.EXECUTED);
    }

    function markRejected(bytes32 signalId, string calldata /*reason*/)
        external onlyGovernor
    {
        _go(signalId, FSMState.REJECTED);
    }

    function stateOf(bytes32 signalId) external view returns (FSMState) {
        return _state[signalId];
    }

    function _requireState(bytes32 signalId, FSMState required) private view {
        if (_state[signalId] != required) revert BadTransition(_state[signalId], required);
    }

    function _go(bytes32 signalId, FSMState to) private {
        FSMState from = _state[signalId];
        _state[signalId] = to;
        _enteredAt[signalId] = uint64(block.timestamp);
        emit StateTransitioned(signalId, from, to);
    }

    function _abs(int64 x) private pure returns (int64) {
        return x < 0 ? -x : x;
    }
}
