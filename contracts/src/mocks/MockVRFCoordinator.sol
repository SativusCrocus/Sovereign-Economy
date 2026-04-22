// SPDX-License-Identifier: MIT
// contracts/src/mocks/MockVRFCoordinator.sol
pragma solidity ^0.8.24;

/// @notice Unit-test-only VRF coordinator stand-in. Captures requests and
///         lets the test harness trigger fulfillment on the consumer.
///         Do NOT deploy to any live network. Low-level-call + long selector
///         string are intrinsic to mimicking the VRF callback pattern, so the
///         gas-style rules are suppressed for this mock specifically.
/* solhint-disable avoid-low-level-calls, gas-small-strings */
contract MockVRFCoordinator {
    error UnknownRequest();

    address public consumer;
    uint256 public nextRequestId = 1;
    mapping(uint256 => bool) public seen;

    function setConsumer(address c) external {
        consumer = c;
    }

    // Match the real coordinator's selector via a struct param. The struct
    // field order must mirror IVRFCoordinatorV2Plus.RandomWordsRequest.
    struct RandomWordsRequest {
        bytes32 keyHash;
        uint256 subId;
        uint16  requestConfirmations;
        uint32  callbackGasLimit;
        uint32  numWords;
        bytes   extraArgs;
    }

    function requestRandomWords(RandomWordsRequest calldata /*req*/) external returns (uint256 requestId) {
        requestId = nextRequestId++;
        seen[requestId] = true;
    }

    /// Test-only: invoke the consumer's callback with arbitrary random words.
    function fulfill(uint256 requestId, uint256[] calldata randomWords) external {
        if (!seen[requestId]) revert UnknownRequest();
        (bool ok, bytes memory ret) =
            consumer.call(abi.encodeWithSignature("rawFulfillRandomWords(uint256,uint256[])", requestId, randomWords));
        if (!ok) {
            assembly { revert(add(ret, 0x20), mload(ret)) }
        }
    }
}
