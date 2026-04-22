// SPDX-License-Identifier: MIT
// contracts/src/DAESGovernor.sol
pragma solidity ^0.8.24;

import "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import "../interfaces/IDAESGovernor.sol";

/// @notice 3-of-5 multi-sig governor. Signers are mutable only via the
///         self-gated `rotateSigner` path (stage → 3-of-5 sign → 86400s
///         timelock → execute). Execution is self-calling: only the
///         governor invokes; downstream contracts check `msg.sender == governor`.
contract DAESGovernor is IDAESGovernor, ReentrancyGuard {
    uint8  public constant THRESHOLD = 3;
    uint32 public constant MIN_DELAY_S = 86400;

    address[5] public signerOf;         // index by uint8(SignerRole)
    mapping(bytes32 => StagedAction) private _actions;

    address public immutable bridgeOperator; // only the operator can stage

    error NotBridgeOperator();
    error NotSigner();
    error AlreadyStaged();
    error NotStaged();
    error AlreadySigned();
    error NotEnoughSigs();
    error TooEarly();
    error AlreadyTerminal();
    error NotSelf();
    error ZeroSigner();
    error ZeroBridgeOperator();

    constructor(address[5] memory signers_, address bridgeOperator_) {
        if (bridgeOperator_ == address(0)) revert ZeroBridgeOperator();
        for (uint256 i = 0; i < 5; i++) {
            if (signers_[i] == address(0)) revert ZeroSigner();
        }
        signerOf = signers_;
        bridgeOperator = bridgeOperator_;
    }

    function stageAction(
        bytes32 actionId,
        address target,
        uint256 value,
        bytes calldata data
    ) external {
        if (msg.sender != bridgeOperator) revert NotBridgeOperator();
        // slither-disable-next-line timestamp
        if (_actions[actionId].stagedAt != 0) revert AlreadyStaged();
        _actions[actionId] = StagedAction({
            target: target,
            value: value,
            data: data,
            stagedAt: uint64(block.timestamp),
            signatureBitmap: 0,
            executed: false,
            rejected: false
        });
        emit ActionStaged(actionId, target, data, uint64(block.timestamp));
    }

    function signAction(bytes32 actionId, SignerRole role, bytes calldata /*sig*/) external {
        StagedAction storage a = _actions[actionId];
        if (a.stagedAt == 0) revert NotStaged();
        if (a.executed || a.rejected) revert AlreadyTerminal();

        uint8 bit = uint8(1) << uint8(role);
        if ((a.signatureBitmap & bit) != 0) revert AlreadySigned();
        if (msg.sender != signerOf[uint8(role)]) revert NotSigner();

        a.signatureBitmap |= bit;
        emit ActionSigned(actionId, role, msg.sender);
    }

    function executeAction(bytes32 actionId) external nonReentrant returns (bytes memory) {
        StagedAction storage a = _actions[actionId];
        if (a.stagedAt == 0) revert NotStaged();
        if (a.executed || a.rejected) revert AlreadyTerminal();
        if (_popcount(a.signatureBitmap) < THRESHOLD) revert NotEnoughSigs();
        // slither-disable-next-line timestamp
        if (block.timestamp < a.stagedAt + MIN_DELAY_S) revert TooEarly();

        a.executed = true;
        (bool ok, bytes memory ret) = a.target.call{value: a.value}(a.data);
        if (!ok) {
            // Bubble up the inner revert so callers see the actual reason
            // (e.g. ZeroSigner from rotateSigner) instead of a generic wrapper.
            assembly {
                revert(add(ret, 0x20), mload(ret))
            }
        }
        emit ActionExecuted(actionId, ret);
        return ret;
    }

    function rejectAction(bytes32 actionId, string calldata reason) external nonReentrant {
        StagedAction storage a = _actions[actionId];
        if (a.stagedAt == 0) revert NotStaged();
        if (a.executed || a.rejected) revert AlreadyTerminal();
        // HumanGuardian or DAOSnapshot may reject.
        if (msg.sender != signerOf[uint8(SignerRole.HumanGuardian)]
            && msg.sender != signerOf[uint8(SignerRole.DAOSnapshot)]) revert NotSigner();
        a.rejected = true;
        emit ActionRejected(actionId, reason);
    }

    /// @notice Rotate a signer slot. Must be reached via the governor's own
    ///         stage/sign/execute pipeline — i.e. target = address(this) and
    ///         data = rotateSigner(role, newSigner). That pipeline enforces
    ///         3-of-5 quorum and the 86400s timelock on the rotation itself.
    function rotateSigner(SignerRole role, address newSigner) external {
        if (msg.sender != address(this)) revert NotSelf();
        if (newSigner == address(0)) revert ZeroSigner();
        address old = signerOf[uint8(role)];
        signerOf[uint8(role)] = newSigner;
        emit SignerRotated(role, old, newSigner);
    }

    function getAction(bytes32 actionId) external view returns (StagedAction memory) {
        return _actions[actionId];
    }

    function _popcount(uint8 x) private pure returns (uint8 c) {
        unchecked {
            for (; x != 0; x >>= 1) c += x & 1;
        }
    }

    receive() external payable {}
}
