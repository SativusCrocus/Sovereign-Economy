// SPDX-License-Identifier: MIT
// contracts/interfaces/IGuardianTimelock.sol
pragma solidity ^0.8.24;

// File-level constant.
uint32 constant TIMELOCK_MIN_DELAY_S = 86400;

/// @title IGuardianTimelock
/// @notice OpenZeppelin-shaped timelock with a fixed 86400s minimum delay.
///         One of the five signer slots on IDAESGovernor — delegating a
///         signature to this contract means "no execution sooner than 24h".
interface IGuardianTimelock {
    event CallScheduled(bytes32 indexed id, uint256 indexed index, address target, uint256 value, bytes data, bytes32 predecessor, uint256 delay);
    event CallExecuted(bytes32 indexed id, uint256 indexed index, address target, uint256 value, bytes data);
    event Cancelled(bytes32 indexed id);

    function schedule(address target, uint256 value, bytes calldata data, bytes32 predecessor, bytes32 salt, uint256 delay) external;
    function execute(address target, uint256 value, bytes calldata data, bytes32 predecessor, bytes32 salt) external payable;
    function cancel(bytes32 id) external;

    function hashOperation(address target, uint256 value, bytes calldata data, bytes32 predecessor, bytes32 salt) external pure returns (bytes32);
    function isOperationReady(bytes32 id) external view returns (bool);
    function isOperationDone(bytes32 id) external view returns (bool);
    function getTimestamp(bytes32 id) external view returns (uint256);
}
