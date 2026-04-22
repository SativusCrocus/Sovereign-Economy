// SPDX-License-Identifier: MIT
// contracts/interfaces/ISwarmSeedVRF.sol
pragma solidity ^0.8.24;

/// @title ISwarmSeedVRF
/// @notice On-chain source of the swarm runtime's deterministic seed.
///         Replaces the `DAES_SEED` env var once a VRF subscription is wired.
///         The off-chain runtime reads `latestSeed()` at boot; signals produced
///         by a swarm seeded from VRF are reproducible by anyone with the same
///         block view, so the dealer (agent-swarm-runtime) cannot quietly swap
///         its population without a visible on-chain update.
interface ISwarmSeedVRF {
    event SeedRequested(uint256 indexed requestId, uint256 requestedAtBlock);
    event SeedFulfilled(uint256 indexed requestId, uint256 seed, uint256 fulfilledAtBlock);

    error NotGovernor();
    error NotCoordinator();
    error AlreadyFulfilled(uint256 requestId);
    error NoSeedYet();

    /// @notice Request a fresh seed from the VRF coordinator. Governor-gated,
    ///         so rotation flows through 3-of-5 + 86400s.
    function requestSeed() external returns (uint256 requestId);

    /// @notice Current seed. Reverts with `NoSeedYet` until the first request
    ///         has been fulfilled — production deployments must request once
    ///         and wait for fulfillment before booting the swarm runtime.
    function latestSeed() external view returns (uint256 seed, uint256 fulfilledAtBlock);

    /// @notice Returns true once at least one request has been fulfilled.
    function isReady() external view returns (bool);
}
