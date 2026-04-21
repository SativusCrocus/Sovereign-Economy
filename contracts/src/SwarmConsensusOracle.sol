// SPDX-License-Identifier: MIT
// contracts/src/SwarmConsensusOracle.sol
pragma solidity ^0.8.24;

import "../interfaces/ISwarmConsensusOracle.sol";

/// @notice Append-only registry of swarm consensus signals posted by the
///         off-chain agent-swarm-runtime. The posting key (`poster`) is
///         mutable, rotated only through DAESGovernor's 3-of-5 + 86400s
///         pipeline — the governor is set at construction and cannot be
///         reassigned. Addresses the single-key centralization risk
///         flagged in docs/audit-notes.md.
contract SwarmConsensusOracle is ISwarmConsensusOracle {
    address public immutable governor;
    address public poster;

    bytes32 private _latest;
    mapping(bytes32 => Signal) private _store;

    error NotPoster();
    error NotGovernor();
    error BadKind();
    error Duplicate();
    error ZeroPoster();

    constructor(address poster_, address governor_) {
        require(poster_ != address(0) && governor_ != address(0), "zero addr");
        poster = poster_;
        governor = governor_;
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

    function rotatePoster(address newPoster) external {
        if (msg.sender != governor) revert NotGovernor();
        if (newPoster == address(0)) revert ZeroPoster();
        address old = poster;
        poster = newPoster;
        emit PosterRotated(old, newPoster);
    }

    function getSignal(bytes32 signalHash) external view returns (Signal memory) {
        return _store[signalHash];
    }

    function latestSignalHash() external view returns (bytes32) {
        return _latest;
    }
}
