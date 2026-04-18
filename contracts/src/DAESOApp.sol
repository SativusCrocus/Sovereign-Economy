// SPDX-License-Identifier: MIT
// contracts/src/DAESOApp.sol
pragma solidity ^0.8.24;

import "../interfaces/ILayerZeroOApp.sol";

/// @notice Minimal LayerZero V2 OApp reference. Delegates all messaging
///         to the real LZ endpoint at `endpointAddr` (Base/OP mainnet:
///         0x1a44076050125825900e736c501f859c50fE728c).
///         Peers are managed by the governor; only the configured
///         governor can setPeer / send.
///
/// @dev Lightweight shim so the bridge FSM compiles and can be tested
///      locally. In production, import the layerzero-labs oapp package
///      and inherit from OAppSender/OAppReceiver.
contract DAESOApp is ILayerZeroOApp {
    address public immutable endpointAddr;
    address public immutable governor;

    mapping(uint32 => bytes32) private _peers;

    error NotGovernor();
    error NotEndpoint();
    error NoPeer(uint32 eid);

    constructor(address endpoint_, address governor_) {
        endpointAddr = endpoint_;
        governor     = governor_;
    }

    modifier onlyGovernor() {
        if (msg.sender != governor) revert NotGovernor();
        _;
    }

    function endpoint() external view returns (address) {
        return endpointAddr;
    }

    function peers(uint32 eid) external view returns (bytes32) {
        return _peers[eid];
    }

    function setPeer(uint32 eid, bytes32 peer) external onlyGovernor {
        _peers[eid] = peer;
    }

    /// @dev In production this calls IEndpointV2(endpointAddr).quote(...).
    ///      For a local-compilable reference we return 1 wei native, 0 lz.
    function quote(MessagingParams calldata, address) external pure returns (MessagingFee memory) {
        return MessagingFee({ nativeFee: 1, lzTokenFee: 0 });
    }

    function send(MessagingParams calldata params, address /*refundAddress*/)
        external payable onlyGovernor returns (MessagingReceipt memory)
    {
        if (_peers[params.dstEid] == bytes32(0)) revert NoPeer(params.dstEid);
        bytes32 guid = keccak256(
            abi.encodePacked(block.chainid, params.dstEid, _peers[params.dstEid], params.message, block.number)
        );
        MessagingReceipt memory r = MessagingReceipt({
            guid: guid,
            nonce: uint64(block.number),
            fee: MessagingFee({ nativeFee: msg.value, lzTokenFee: 0 })
        });
        emit MessageSent(guid, params.dstEid, r.nonce);
        return r;
    }

    function lzReceive(Origin calldata origin, bytes32 guid, bytes calldata, address, bytes calldata)
        external payable
    {
        if (msg.sender != endpointAddr) revert NotEndpoint();
        emit MessageReceived(guid, origin.srcEid, origin.sender, origin.nonce);
    }
}
