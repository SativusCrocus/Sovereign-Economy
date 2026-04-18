// SPDX-License-Identifier: MIT
// contracts/src/GuardianTimelock.sol
pragma solidity ^0.8.24;

import "@openzeppelin/contracts/governance/TimelockController.sol";
import "../interfaces/IGuardianTimelock.sol";

/// @notice Thin wrapper around OpenZeppelin's TimelockController with a
///         fixed 86400s minimum delay. The OZ constructor enforces this
///         by requiring `minDelay >= TIMELOCK_MIN_DELAY_S`.
///         Interface-conformance: we re-declare the same event/function
///         surface; OZ's signatures match.
contract GuardianTimelock is TimelockController {
    error BadMinDelay();

    constructor(
        address[] memory proposers,
        address[] memory executors,
        address admin
    ) TimelockController(TIMELOCK_MIN_DELAY_S, proposers, executors, admin) {
        if (getMinDelay() < TIMELOCK_MIN_DELAY_S) revert BadMinDelay();
    }
}
