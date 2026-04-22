// SPDX-License-Identifier: MIT
// contracts/src/CircuitBreaker.sol
pragma solidity ^0.8.24;

import "../interfaces/ICircuitBreaker.sol";

/// @notice Reference implementation for ICircuitBreaker.
///         Ring buffer of failure timestamps; tripped when ≥3 failures
///         fall inside the trailing 600s window.
///         Reset gated to `guardian` (set at construction).
///         `recordFailure` is gated to the BridgeExecutor — addresses
///         M-1 (ring-displacement attack by spamming failures).
contract CircuitBreaker is ICircuitBreaker {
    address public immutable guardian;
    address public bridge;

    uint64[CB_FAILURE_THRESHOLD + 1] private _ring;
    uint8  private _ringIdx;
    uint64 public lastReset;

    error NotGuardian();
    error NotPaused();
    error NotBridge();
    error BridgeAlreadySet();
    error ZeroBridge();
    error ZeroGuardian();

    constructor(address guardian_) {
        if (guardian_ == address(0)) revert ZeroGuardian();
        guardian = guardian_;
    }

    modifier onlyGuardian() {
        if (msg.sender != guardian) revert NotGuardian();
        _;
    }
    modifier onlyBridge() {
        if (msg.sender != bridge) revert NotBridge();
        _;
    }

    /// @notice One-time bootstrap. Guardian binds the BridgeExecutor after
    ///         the bridge is deployed. After this returns, `recordFailure`
    ///         only accepts calls from that address; no subsequent rotation
    ///         is possible (circular authority across contracts is too
    ///         brittle to expose to live governance flows).
    function setBridge(address bridge_) external onlyGuardian {
        if (bridge != address(0)) revert BridgeAlreadySet();
        if (bridge_ == address(0)) revert ZeroBridge();
        bridge = bridge_;
        emit BridgeSet(bridge_);
    }

    function recordFailure(FailureKind kind) external onlyBridge {
        uint64 ts = uint64(block.timestamp);
        _ring[_ringIdx] = ts;
        _ringIdx = uint8((_ringIdx + 1) % _ring.length);
        emit FailureRecorded(kind, ts);
        if (isPaused()) emit Tripped(ts, failuresInWindow());
    }

    function failuresInWindow() public view returns (uint32) {
        uint64 threshold = uint64(block.timestamp) - CB_WINDOW_SECONDS;
        uint32 n = 0;
        uint256 ringLen = _ring.length;
        for (uint256 i = 0; i < ringLen; i++) {
            uint64 t = _ring[i];
            // slither-disable-next-line timestamp
            if (t > threshold && t > lastReset) n++;
        }
        return n;
    }

    function isPaused() public view returns (bool) {
        return failuresInWindow() > CB_FAILURE_THRESHOLD;
    }

    function reset() external onlyGuardian {
        if (!isPaused()) revert NotPaused();
        lastReset = uint64(block.timestamp);
        emit Reset(msg.sender);
    }
}
