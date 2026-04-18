// SPDX-License-Identifier: MIT
// contracts/src/DAESGovernor.sol
pragma solidity ^0.8.24;

import "../interfaces/IDAESGovernor.sol";

/// @notice 3-of-5 multi-sig governor. Signer addresses are immutable and
///         set at construction; one address per SignerRole slot.
///         Execution requires:
///           - 3 distinct signer bits in the signatureBitmap
///           - 86400s elapsed since stageAction
///         Execution is self-calling: only the governor executes,
///         downstream contracts check `msg.sender == governor`.
contract DAESGovernor is IDAESGovernor {
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

    constructor(address[5] memory signers_, address bridgeOperator_) {
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

    function executeAction(bytes32 actionId) external returns (bytes memory) {
        StagedAction storage a = _actions[actionId];
        if (a.stagedAt == 0) revert NotStaged();
        if (a.executed || a.rejected) revert AlreadyTerminal();
        if (_popcount(a.signatureBitmap) < THRESHOLD) revert NotEnoughSigs();
        if (block.timestamp < a.stagedAt + MIN_DELAY_S) revert TooEarly();

        a.executed = true;
        (bool ok, bytes memory ret) = a.target.call{value: a.value}(a.data);
        require(ok, "call failed");
        emit ActionExecuted(actionId, ret);
        return ret;
    }

    function rejectAction(bytes32 actionId, string calldata reason) external {
        StagedAction storage a = _actions[actionId];
        if (a.stagedAt == 0) revert NotStaged();
        if (a.executed || a.rejected) revert AlreadyTerminal();
        // HumanGuardian or DAOSnapshot may reject.
        if (msg.sender != signerOf[uint8(SignerRole.HumanGuardian)]
            && msg.sender != signerOf[uint8(SignerRole.DAOSnapshot)]) revert NotSigner();
        a.rejected = true;
        emit ActionRejected(actionId, reason);
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
