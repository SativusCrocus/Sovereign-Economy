// SPDX-License-Identifier: MIT
// contracts/src/SwarmSeedVRF.sol
pragma solidity ^0.8.24;

import "../interfaces/ISwarmSeedVRF.sol";

/// @dev Minimal subset of the Chainlink VRF v2.5 coordinator interface,
///      vendored inline so we don't pull in the whole Chainlink npm package
///      for one function. The layout matches
///      VRFCoordinatorV2PlusInterface.requestRandomWords as of 2025-Q4.
///      If you upgrade the coordinator, re-check the field order.
interface IVRFCoordinatorV2Plus {
    struct RandomWordsRequest {
        bytes32 keyHash;
        uint256 subId;
        uint16  requestConfirmations;
        uint32  callbackGasLimit;
        uint32  numWords;
        bytes   extraArgs;
    }

    function requestRandomWords(RandomWordsRequest calldata req) external returns (uint256 requestId);
}

/// @notice Stores the current swarm seed, drawn from Chainlink VRF v2.5.
///         The off-chain `agent-swarm-runtime` reads `latestSeed()` at boot.
///
///         Rotation is governor-gated — any request for a fresh seed must
///         clear the DAESGovernor 3-of-5 + 86400s pipeline, so an attacker
///         who seizes the off-chain RPC endpoint cannot swap the population
///         underneath running signers.
///
///         The contract only remembers the *latest* fulfilled seed; history
///         is in event logs. Re-fulfilling a previously-seen `requestId` is
///         rejected with `AlreadyFulfilled`.
contract SwarmSeedVRF is ISwarmSeedVRF {
    IVRFCoordinatorV2Plus public immutable coordinator;
    address public immutable governor;

    // VRF subscription parameters. Immutable after deploy — change by
    // redeploying; this is simpler than adding admin surface for config.
    bytes32 public immutable keyHash;
    uint256 public immutable subId;
    uint16  public immutable requestConfirmations;
    uint32  public immutable callbackGasLimit;

    // Per-request state. `fulfilled` is a bitmap-ish mapping for dedup.
    mapping(uint256 => bool) public fulfilled;
    mapping(uint256 => bool) public outstanding;

    uint256 private _latestSeed;
    uint256 private _latestFulfilledAtBlock;
    bool    private _ready;

    constructor(
        IVRFCoordinatorV2Plus coordinator_,
        address governor_,
        bytes32 keyHash_,
        uint256 subId_,
        uint16  requestConfirmations_,
        uint32  callbackGasLimit_
    ) {
        if (address(coordinator_) == address(0)) revert NotCoordinator();
        if (governor_ == address(0)) revert NotGovernor();
        coordinator          = coordinator_;
        governor             = governor_;
        keyHash              = keyHash_;
        subId                = subId_;
        requestConfirmations = requestConfirmations_;
        callbackGasLimit     = callbackGasLimit_;
    }

    modifier onlyGovernor() {
        if (msg.sender != governor) revert NotGovernor();
        _;
    }

    /// @inheritdoc ISwarmSeedVRF
    /// @dev The state write (`outstanding[requestId] = true`) and event emit
    ///      necessarily follow the external call because `requestId` is the
    ///      coordinator's return value. The coordinator is Chainlink's
    ///      canonical VRF v2.5 contract; reentrancy from it is not a threat.
    // slither-disable-next-line reentrancy-benign,reentrancy-events
    function requestSeed() external onlyGovernor returns (uint256 requestId) {
        requestId = coordinator.requestRandomWords(
            IVRFCoordinatorV2Plus.RandomWordsRequest({
                keyHash:              keyHash,
                subId:                subId,
                requestConfirmations: requestConfirmations,
                callbackGasLimit:     callbackGasLimit,
                numWords:             1,
                // nativePayment: true encoded per VRF v2.5 docs. The coordinator
                // interprets `extraArgs` as `abi.encode(VRFV2PlusClient.ExtraArgsV1)`.
                extraArgs:            abi.encode(uint8(1), true)
            })
        );
        outstanding[requestId] = true;
        emit SeedRequested(requestId, block.number);
    }

    /// @notice VRF coordinator callback. Only the coordinator may call.
    ///         The v2.5 coordinator calls `rawFulfillRandomWords` on consumer
    ///         contracts; we expose the same selector to match the spec.
    function rawFulfillRandomWords(uint256 requestId, uint256[] calldata randomWords) external {
        if (msg.sender != address(coordinator)) revert NotCoordinator();
        if (fulfilled[requestId]) revert AlreadyFulfilled(requestId);
        fulfilled[requestId] = true;
        outstanding[requestId] = false;

        uint256 seed = randomWords[0];
        _latestSeed = seed;
        _latestFulfilledAtBlock = block.number;
        _ready = true;
        emit SeedFulfilled(requestId, seed, block.number);
    }

    /// @inheritdoc ISwarmSeedVRF
    function latestSeed() external view returns (uint256 seed, uint256 fulfilledAtBlock) {
        if (!_ready) revert NoSeedYet();
        return (_latestSeed, _latestFulfilledAtBlock);
    }

    /// @inheritdoc ISwarmSeedVRF
    function isReady() external view returns (bool) {
        return _ready;
    }
}
