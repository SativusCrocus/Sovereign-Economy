// SPDX-License-Identifier: MIT
// contracts/interfaces/ILayerZeroOApp.sol
pragma solidity ^0.8.24;

/// @title ILayerZeroOApp
/// @notice Minimal LayerZero V2 OApp surface. Endpoint IDs (eid) for
///         target chains come from spec/components.yaml::chains:
///         Base=30184, Optimism=30111.
interface ILayerZeroOApp {
    struct MessagingParams {
        uint32  dstEid;
        bytes32 receiver;
        bytes   message;
        bytes   options;
        bool    payInLzToken;
    }

    struct MessagingReceipt {
        bytes32 guid;
        uint64  nonce;
        MessagingFee fee;
    }

    struct MessagingFee {
        uint256 nativeFee;
        uint256 lzTokenFee;
    }

    struct Origin {
        uint32  srcEid;
        bytes32 sender;
        uint64  nonce;
    }

    event MessageSent(bytes32 indexed guid, uint32 indexed dstEid, uint64 nonce);
    event MessageReceived(bytes32 indexed guid, uint32 indexed srcEid, bytes32 sender, uint64 nonce);

    function endpoint() external view returns (address);
    function peers(uint32 eid) external view returns (bytes32);
    function setPeer(uint32 eid, bytes32 peer) external;

    function quote(MessagingParams calldata params, address sender) external view returns (MessagingFee memory);
    function send(MessagingParams calldata params, address refundAddress) external payable returns (MessagingReceipt memory);

    function lzReceive(Origin calldata origin, bytes32 guid, bytes calldata message, address executor, bytes calldata extraData) external payable;
}
