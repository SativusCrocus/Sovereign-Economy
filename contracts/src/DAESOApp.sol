// SPDX-License-Identifier: MIT
// contracts/src/DAESOApp.sol
pragma solidity ^0.8.24;

import { Ownable } from "@openzeppelin/contracts/access/Ownable.sol";
import {
    OApp,
    Origin,
    MessagingFee,
    MessagingReceipt
} from "@layerzerolabs/lz-evm-oapp-v2/contracts/oapp/OApp.sol";

import "../interfaces/ILayerZeroOApp.sol";

/// @notice DAES cross-chain OApp on LayerZero V2. Owner (= DAESGovernor) holds
///         `setPeer` / `sendMessage` authority; the governor reaches these via
///         its 3-of-5 + 86400s staged-action pipeline.
///
///         Deployed once per chain. Mainnet endpoint is shared across Base
///         and Optimism (0x1a44076050125825900e736c501f859c50fE728c); Sepolia
///         testnet endpoint is also shared (0x6EDCE65403992e310A62460808c4b910D972f10f).
contract DAESOApp is OApp, ILayerZeroOApp {
    constructor(address endpoint_, address governor_)
        OApp(endpoint_, governor_)
        Ownable(governor_)
    {}

    /// @notice Send an arbitrary payload to the peer OApp on `dstEid`.
    ///         msg.value must cover the quoted native fee; excess is refunded
    ///         to msg.sender by the endpoint.
    function sendMessage(
        uint32 dstEid,
        bytes calldata message,
        bytes calldata options
    ) external payable onlyOwner returns (MessagingReceipt memory receipt) {
        receipt = _lzSend(
            dstEid,
            message,
            options,
            MessagingFee({ nativeFee: msg.value, lzTokenFee: 0 }),
            payable(msg.sender)
        );
        emit MessageSent(receipt.guid, dstEid, receipt.nonce);
    }

    /// @notice Quote the cost of delivering `message` to `dstEid` with the
    ///         given executor `options`.
    function quoteSend(
        uint32 dstEid,
        bytes calldata message,
        bytes calldata options,
        bool payInLzToken
    ) external view returns (MessagingFee memory fee) {
        return _quote(dstEid, message, options, payInLzToken);
    }

    /// @dev Handle inbound messages. The LayerZero endpoint has already
    ///      verified the sender is the peer registered for `origin.srcEid`
    ///      via `OAppReceiver`'s `_assertPeer` check — the override body can
    ///      trust `origin` and focus on application-level decoding. For now
    ///      we only emit the receipt event; the bridge daemon consumes it.
    function _lzReceive(
        Origin calldata origin,
        bytes32 guid,
        bytes calldata /*message*/,
        address /*executor*/,
        bytes calldata /*extraData*/
    ) internal override {
        emit MessageReceived(guid, origin.srcEid, origin.sender, origin.nonce);
    }
}
