// SPDX-License-Identifier: MIT
// contracts/interfaces/IDAESGovernor.sol
pragma solidity ^0.8.24;

/// @title IDAESGovernor
/// @notice 3-of-5 multi-sig governor that stages, signs, and executes actions
///         emitted by the Decision-to-Action Bridge. Signers are defined in
///         spec/components.yaml::multi_sig.signers.
interface IDAESGovernor {
    enum SignerRole { AgentClassA, AgentClassB, HumanGuardian, TimeLock86400, DAOSnapshot }

    struct StagedAction {
        address target;
        uint256 value;
        bytes   data;
        uint64  stagedAt;
        uint8   signatureBitmap; // bit i set ⇒ signer with SignerRole(i) signed
        bool    executed;
        bool    rejected;
    }

    event ActionStaged(bytes32 indexed actionId, address indexed target, bytes data, uint64 stagedAt);
    event ActionSigned(bytes32 indexed actionId, SignerRole indexed role, address indexed signer);
    event ActionExecuted(bytes32 indexed actionId, bytes returnData);
    event ActionRejected(bytes32 indexed actionId, string reason);
    event SignerRotated(SignerRole indexed role, address oldSigner, address newSigner);

    /// @notice Stage an action for signing. Callable only by the BridgeExecutor.
    function stageAction(bytes32 actionId, address target, uint256 value, bytes calldata data) external;

    /// @notice Attach a signature from one of the five roles.
    function signAction(bytes32 actionId, SignerRole role, bytes calldata sig) external;

    /// @notice Execute once 3 signatures present AND 86400s timelock elapsed.
    function executeAction(bytes32 actionId) external returns (bytes memory);

    /// @notice Reject an action explicitly. Requires HumanGuardian or DAOSnapshot role.
    function rejectAction(bytes32 actionId, string calldata reason) external;

    /// @notice Rotate the address in a signer slot. Callable only by the governor
    ///         itself — reach it through the stage/sign/execute path, which enforces
    ///         3-of-5 quorum and the 86400s timelock on rotation itself.
    function rotateSigner(SignerRole role, address newSigner) external;

    function getAction(bytes32 actionId) external view returns (StagedAction memory);
}
