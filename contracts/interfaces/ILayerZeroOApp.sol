// SPDX-License-Identifier: MIT
// contracts/interfaces/ILayerZeroOApp.sol
pragma solidity ^0.8.24;

/// @title ILayerZeroOApp
/// @notice Thin event surface the DAES LayerZero V2 OApp exposes to off-chain
///         indexers. peers() / setPeer() / PeerSet come from the upstream
///         IOAppCore (LayerZero v2 OApp package) - duplicating them here
///         would force an override with no behavioural change, so we don't.
///
///         Endpoint IDs (eid):
///           Base mainnet  = 30184        OP mainnet  = 30111
///           Base Sepolia  = 40245        OP Sepolia  = 40232
interface ILayerZeroOApp {
    /// @notice Emitted by DAESOApp when `sendMessage` succeeds.
    event MessageSent(bytes32 indexed guid, uint32 indexed dstEid, uint64 nonce);

    /// @notice Emitted by DAESOApp on successful `_lzReceive` from a trusted peer.
    event MessageReceived(bytes32 indexed guid, uint32 indexed srcEid, bytes32 sender, uint64 nonce);
}
