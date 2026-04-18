// SPDX-License-Identifier: MIT
// contracts/src/CircuitBreaker.sol
pragma solidity ^0.8.24;

import "../interfaces/ICircuitBreaker.sol";

/// @notice Reference implementation for ICircuitBreaker.
///         Ring buffer of failure timestamps; tripped when ≥3 failures
///         fall inside the trailing 600s window.
///         Reset gated to `guardian` (set at construction).
contract CircuitBreaker is ICircuitBreaker {
    address public guardian;

    uint64[CB_FAILURE_THRESHOLD + 1] private _ring;
    uint8  private _ringIdx;
    uint64 public lastReset;

    error NotGuardian();
    error NotPaused();

    constructor(address guardian_) {
        guardian = guardian_;
    }

    modifier onlyGuardian() {
        if (msg.sender != guardian) revert NotGuardian();
        _;
    }

    function recordFailure(FailureKind kind) external {
        uint64 ts = uint64(block.timestamp);
        _ring[_ringIdx] = ts;
        _ringIdx = uint8((_ringIdx + 1) % _ring.length);
        emit FailureRecorded(kind, ts);
        if (isPaused()) emit Tripped(ts, failuresInWindow());
    }

    function failuresInWindow() public view returns (uint32) {
        uint64 threshold = uint64(block.timestamp) - CB_WINDOW_SECONDS;
        uint32 n;
        for (uint256 i = 0; i < _ring.length; i++) {
            uint64 t = _ring[i];
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
