// SPDX-License-Identifier: MIT
// contracts/src/SwarmConsensusOracle.sol
pragma solidity ^0.8.24;

import "../interfaces/ISwarmConsensusOracle.sol";

/// @notice Append-only registry of swarm consensus signals posted by the
///         off-chain agent-swarm-runtime. `poster` (the runtime address)
///         is set at construction; only it can post.
contract SwarmConsensusOracle is ISwarmConsensusOracle {
    address public immutable poster;
    bytes32 private _latest;
    mapping(bytes32 => Signal) private _store;

    error NotPoster();
    error BadKind();
    error Duplicate();

    constructor(address poster_) {
        poster = poster_;
    }

    function postSignal(
        bytes32 signalHash,
        uint8 kind,
        uint16 quorumBps,
        int64 sigmaBandE6
    ) external {
        if (msg.sender != poster) revert NotPoster();
        if (kind > 3) revert BadKind();
        if (_store[signalHash].postedAt != 0) revert Duplicate();

        _store[signalHash] = Signal({
            signalHash: signalHash,
            kind: kind,
            quorumBps: quorumBps,
            sigmaBandE6: sigmaBandE6,
            postedAt: uint64(block.timestamp),
            posterAgentRuntime: msg.sender
        });
        _latest = signalHash;
        emit SwarmSignalPosted(signalHash, kind, quorumBps, sigmaBandE6);
    }

    function getSignal(bytes32 signalHash) external view returns (Signal memory) {
        return _store[signalHash];
    }

    function latestSignalHash() external view returns (bytes32) {
        return _latest;
    }
}
