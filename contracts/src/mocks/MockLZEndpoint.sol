// SPDX-License-Identifier: MIT
// contracts/src/mocks/MockLZEndpoint.sol
pragma solidity ^0.8.24;

import {
    ILayerZeroEndpointV2,
    MessagingParams,
    MessagingFee,
    MessagingReceipt,
    Origin
} from "@layerzerolabs/lz-evm-protocol-v2/contracts/interfaces/ILayerZeroEndpointV2.sol";

/// @notice Unit-test-only stand-in for `ILayerZeroEndpointV2`.
///
///         Provides only the surface an OApp deployment / send / quote
///         unit test touches. Any method not needed by those tests reverts
///         with `NotImplemented` so accidental reliance in production is
///         loud and obvious. DO NOT deploy to any live network.
contract MockLZEndpoint {
    error NotImplemented();

    mapping(address => address) public delegates;
    uint64 public nonceCursor;

    event DelegateSet(address indexed oapp, address delegate);
    event Sent(address indexed sender, uint32 dstEid, bytes32 receiver, uint256 nativeFee, uint64 nonce, bytes message);

    function setDelegate(address _delegate) external {
        delegates[msg.sender] = _delegate;
        emit DelegateSet(msg.sender, _delegate);
    }

    function lzToken() external pure returns (address) {
        return address(0);
    }

    function quote(MessagingParams calldata /*params*/, address /*sender*/)
        external pure returns (MessagingFee memory)
    {
        return MessagingFee({ nativeFee: 1, lzTokenFee: 0 });
    }

    function send(MessagingParams calldata params, address /*refundAddress*/)
        external payable returns (MessagingReceipt memory r)
    {
        unchecked { nonceCursor += 1; }
        r.guid = keccak256(
            abi.encode(block.chainid, params.dstEid, params.receiver, params.message, nonceCursor)
        );
        r.nonce = nonceCursor;
        r.fee = MessagingFee({ nativeFee: msg.value, lzTokenFee: 0 });
        emit Sent(msg.sender, params.dstEid, params.receiver, msg.value, nonceCursor, params.message);
    }
}
