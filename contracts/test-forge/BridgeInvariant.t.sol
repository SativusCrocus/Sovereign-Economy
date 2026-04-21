// SPDX-License-Identifier: MIT
// contracts/test-forge/BridgeInvariant.t.sol
pragma solidity ^0.8.24;

import { Test, StdInvariant } from "forge-std/Test.sol";
import { MessageHashUtils } from "@openzeppelin/contracts/utils/cryptography/MessageHashUtils.sol";

import { DAESGovernor } from "../src/DAESGovernor.sol";
import { BridgeExecutor } from "../src/BridgeExecutor.sol";
import { CircuitBreaker } from "../src/CircuitBreaker.sol";
import { SwarmConsensusOracle } from "../src/SwarmConsensusOracle.sol";

import { IBridgeExecutor } from "../interfaces/IBridgeExecutor.sol";
import { ICircuitBreaker } from "../interfaces/ICircuitBreaker.sol";
import { IDAESGovernor } from "../interfaces/IDAESGovernor.sol";

/// @notice Fuzzing handler. Exposes every way a fuzzer could *try* to land a
///         signalId in EXECUTED — both the one legal path and every rogue
///         shortcut we can imagine. Tracks which signalIds have been through
///         the full legal 3-of-5 + 86400s + !isPaused path so the top-level
///         invariant can assert EXECUTED implies fullyLegal.
contract BridgeHandler is Test {
    DAESGovernor public gov;
    BridgeExecutor public be;
    CircuitBreaker public cb;
    SwarmConsensusOracle public oracle;

    address public bridgeOp;
    address public humanGuardian;
    uint256[5] public signerPks;
    uint256 public posterPk;

    bytes32[] public seenSignals;
    mapping(bytes32 => bool) public exists;
    mapping(bytes32 => bool) public fullyLegal;

    constructor(
        DAESGovernor _gov,
        BridgeExecutor _be,
        CircuitBreaker _cb,
        SwarmConsensusOracle _oracle,
        address _bridgeOp,
        address _humanGuardian,
        uint256[5] memory _signerPks,
        uint256 _posterPk
    ) {
        gov = _gov;
        be = _be;
        cb = _cb;
        oracle = _oracle;
        bridgeOp = _bridgeOp;
        humanGuardian = _humanGuardian;
        signerPks = _signerPks;
        posterPk = _posterPk;
    }

    function seenCount() external view returns (uint256) {
        return seenSignals.length;
    }

    function seenAt(uint256 i) external view returns (bytes32) {
        return seenSignals[i];
    }

    function _touch(bytes32 signalId) internal {
        if (!exists[signalId]) {
            exists[signalId] = true;
            seenSignals.push(signalId);
        }
    }

    // -----------------------------------------------------------------------
    // Legal path: full stage → 3 sigs → 86400s → executeAction → markExecuted.
    // Only this path should set `fullyLegal[id] = true`.
    // -----------------------------------------------------------------------
    function legalFullExecute(uint256 seed) external {
        bytes32 signalId = keccak256(abi.encode("sig", seed));
        _touch(signalId);
        if (cb.isPaused()) return;
        if (be.stateOf(signalId) != IBridgeExecutor.FSMState.IDLE) return;

        vm.prank(bridgeOp);
        try be.onSwarmSignal(signalId, IBridgeExecutor.SignalKind.BUY, bytes32(0)) {} catch {
            return;
        }

        uint16 quorumBps = 6700;
        int64 sigmaE6 = 1_200_000;
        bytes32 preimage = keccak256(
            abi.encodePacked(block.chainid, address(be), signalId, quorumBps, sigmaE6)
        );
        bytes32 digest = MessageHashUtils.toEthSignedMessageHash(preimage);
        (uint8 v, bytes32 r, bytes32 s) = vm.sign(posterPk, digest);
        bytes memory sig = abi.encodePacked(r, s, v);
        bytes memory proof = abi.encode(quorumBps, sigmaE6, sig);

        vm.prank(bridgeOp);
        try be.validate(signalId, proof) {} catch {
            return;
        }

        vm.prank(bridgeOp);
        try be.thresholdCheck(signalId, quorumBps, sigmaE6) {} catch {
            return;
        }

        vm.prank(bridgeOp);
        try be.stageForMultiSig(signalId, bytes32(0)) {} catch {
            return;
        }

        bytes32 actionId = keccak256(abi.encode("markExecuted", signalId));
        bytes memory callData = abi.encodeWithSelector(be.markExecuted.selector, signalId);
        vm.prank(bridgeOp);
        try gov.stageAction(actionId, address(be), 0, callData) {} catch {
            return;
        }

        for (uint8 i = 0; i < 3; i++) {
            address signer = vm.addr(signerPks[i]);
            vm.prank(signer);
            try gov.signAction(actionId, IDAESGovernor.SignerRole(i), "") {} catch {
                return;
            }
        }

        vm.warp(block.timestamp + 86_401);
        if (cb.isPaused()) return; // late pause invalidates the attempt

        try gov.executeAction(actionId) {
            fullyLegal[signalId] = true;
        } catch {
            return;
        }
    }

    // -----------------------------------------------------------------------
    // Rogue attempts. None of these should ever produce an EXECUTED state
    // that wasn't separately produced by the legal path.
    // -----------------------------------------------------------------------

    /// Anyone calls markExecuted directly (onlyGovernor should revert).
    function rogueMarkExecuted(uint256 seed) external {
        bytes32 signalId = keccak256(abi.encode("sig", seed));
        _touch(signalId);
        be.markExecuted(signalId);
    }

    /// Caller pretends to be the governor contract itself.
    function spoofGovernorMarkExecuted(uint256 seed) external {
        bytes32 signalId = keccak256(abi.encode("sig", seed));
        _touch(signalId);
        // msg.sender in a prank is the prank target. vm.prank(address(gov))
        // without altering code should still be blocked by onlyGovernor
        // because the check is `msg.sender == governor` — prank rewrites
        // msg.sender, so this WOULD pass the check. This is a foundry-
        // specific gotcha: in real life no one can be address(gov) without
        // going through the governor's own call dispatch. We skip pranks
        // of `address(gov)` so the invariant captures real-world security.
        vm.prank(bridgeOp);
        be.markExecuted(signalId);
    }

    /// Execute without collecting 3 signatures (skip signing step).
    function exploitNoSigs(uint256 seed) external {
        bytes32 signalId = keccak256(abi.encode("sig", seed));
        _touch(signalId);
        bytes32 actionId = keccak256(abi.encode("markExecuted", signalId));
        bytes memory callData = abi.encodeWithSelector(be.markExecuted.selector, signalId);
        vm.prank(bridgeOp);
        try gov.stageAction(actionId, address(be), 0, callData) {} catch {
            return;
        }
        vm.warp(block.timestamp + 86_401);
        gov.executeAction(actionId);
    }

    /// Execute before the 86400s timelock elapses (only 2-of-5 staged + time still short).
    function exploitEarlyExec(uint256 seed) external {
        bytes32 signalId = keccak256(abi.encode("sig", seed));
        _touch(signalId);
        bytes32 actionId = keccak256(abi.encode("markExecuted", signalId));
        bytes memory callData = abi.encodeWithSelector(be.markExecuted.selector, signalId);
        vm.prank(bridgeOp);
        try gov.stageAction(actionId, address(be), 0, callData) {} catch {
            return;
        }
        for (uint8 i = 0; i < 3; i++) {
            address signer = vm.addr(signerPks[i]);
            vm.prank(signer);
            try gov.signAction(actionId, IDAESGovernor.SignerRole(i), "") {} catch {
                return;
            }
        }
        // NOTE: no warp — executeAction should revert TooEarly.
        gov.executeAction(actionId);
    }

    /// Pause the breaker then try to execute.
    function exploitPausedExec(uint256 seed) external {
        bytes32 signalId = keccak256(abi.encode("sig", seed));
        _touch(signalId);

        // M-1: recordFailure is gated to the bridge, so we prank as address(be).
        for (uint8 i = 0; i < 4; i++) {
            vm.prank(address(be));
            cb.recordFailure(ICircuitBreaker.FailureKind.OracleStale);
        }
        require(cb.isPaused(), "breaker not paused");

        bytes32 actionId = keccak256(abi.encode("markExecuted", signalId));
        bytes memory callData = abi.encodeWithSelector(be.markExecuted.selector, signalId);
        vm.prank(bridgeOp);
        try gov.stageAction(actionId, address(be), 0, callData) {} catch {
            return;
        }
        for (uint8 i = 0; i < 3; i++) {
            address signer = vm.addr(signerPks[i]);
            vm.prank(signer);
            try gov.signAction(actionId, IDAESGovernor.SignerRole(i), "") {} catch {
                return;
            }
        }
        vm.warp(block.timestamp + 86_401);
        gov.executeAction(actionId);
    }

    /// Pile of random failures + occasional guardian resets so the breaker
    /// toggles between paused/not across the fuzz run.
    function churnBreaker(uint8 failures, bool doReset) external {
        uint8 n = uint8(bound(failures, 0, 6));
        for (uint8 i = 0; i < n; i++) {
            vm.prank(address(be));
            cb.recordFailure(ICircuitBreaker.FailureKind.OracleStale);
        }
        if (doReset && cb.isPaused()) {
            vm.prank(humanGuardian);
            try cb.reset() {} catch {}
        }
    }

    /// M-1 bypass attempt: non-bridge callers try to trip the breaker.
    function tryRecordFailureAsOutsider() external {
        cb.recordFailure(ICircuitBreaker.FailureKind.OracleStale);
    }
}

/// @notice Invariant: `be.stateOf(id) == EXECUTED` for any signalId implies the
///         id went through the full legal stage → 3 sigs → 86400s → execute
///         → markExecuted path while the circuit breaker was unpaused.
contract BridgeInvariantTest is StdInvariant, Test {
    DAESGovernor public gov;
    BridgeExecutor public be;
    CircuitBreaker public cb;
    SwarmConsensusOracle public oracle;
    BridgeHandler public handler;

    function setUp() public {
        uint256[5] memory signerPks = [uint256(0xA1), 0xA2, 0xA3, 0xA4, 0xA5];
        address[5] memory signers;
        for (uint8 i = 0; i < 5; i++) signers[i] = vm.addr(signerPks[i]);
        address bridgeOp = vm.addr(0xB1);
        address humanGuardian = vm.addr(0xC1);
        uint256 posterPk = 0xD1;
        address posterAddr = vm.addr(posterPk);

        cb = new CircuitBreaker(humanGuardian);
        gov = new DAESGovernor(signers, bridgeOp);
        oracle = new SwarmConsensusOracle(posterAddr, address(gov));
        be = new BridgeExecutor(oracle, cb, address(gov), bridgeOp);

        // M-1 bootstrap: guardian wires the bridge as the sole recordFailure caller.
        vm.prank(humanGuardian);
        cb.setBridge(address(be));

        handler = new BridgeHandler(gov, be, cb, oracle, bridgeOp, humanGuardian, signerPks, posterPk);
        targetContract(address(handler));
    }

    function invariant_executedImpliesFullLegalPath() public view {
        uint256 n = handler.seenCount();
        for (uint256 i = 0; i < n; i++) {
            bytes32 id = handler.seenAt(i);
            if (be.stateOf(id) == IBridgeExecutor.FSMState.EXECUTED) {
                require(handler.fullyLegal(id), "EXECUTED without 3-of-5 && 86400s && !isPaused");
            }
        }
    }
}
