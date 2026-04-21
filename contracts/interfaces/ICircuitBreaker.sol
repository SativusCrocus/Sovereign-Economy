// SPDX-License-Identifier: MIT
// contracts/interfaces/ICircuitBreaker.sol
pragma solidity ^0.8.24;

// File-level constants.
uint8  constant CB_FAILURE_THRESHOLD = 2;
uint32 constant CB_WINDOW_SECONDS    = 600;

/// @title ICircuitBreaker
/// @notice Auto-pause switch: more than 2 recorded failures within a 10-min
///         window locks the system. Reset requires Guardian or DAO vote.
interface ICircuitBreaker {
    enum FailureKind { TxRevert, BridgeTimeout, OracleStale }

    event FailureRecorded(FailureKind indexed kind, uint64 at);
    event Tripped(uint64 at, uint32 failuresInWindow);
    event Reset(address indexed by);
    event BridgeSet(address bridge);

    function recordFailure(FailureKind kind) external;
    function isPaused() external view returns (bool);
    function reset() external;
    function failuresInWindow() external view returns (uint32);

    /// @notice One-time bootstrap. Guardian binds the BridgeExecutor address
    ///         that is allowed to call `recordFailure`. Callable exactly once;
    ///         addresses the M-1 ring-displacement finding by making failure
    ///         writes permissioned.
    function setBridge(address bridge_) external;
}
