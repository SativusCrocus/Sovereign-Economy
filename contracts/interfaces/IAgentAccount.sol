// SPDX-License-Identifier: MIT
// contracts/interfaces/IAgentAccount.sol
pragma solidity ^0.8.24;

/// @title IAgentAccount
/// @notice EIP-4337 smart account bound to a swarm archetype. One account
///         factory salt per archetype produces deterministic addresses
///         across Base and Optimism.
///         EntryPoint v0.7 at 0x0000000071727De22E5E9d8BAf0edAc6f37da032.
interface IAgentAccount {
    struct PackedUserOperation {
        address sender;
        uint256 nonce;
        bytes   initCode;
        bytes   callData;
        bytes32 accountGasLimits;
        uint256 preVerificationGas;
        bytes32 gasFees;
        bytes   paymasterAndData;
        bytes   signature;
    }

    /// @notice Archetype tag set at construction, used by the governor to
    ///         enforce per-archetype execution policies.
    enum Archetype { Speculator, Arbitrageur, Sovereign, MarketMaker, BlackSwan }

    event UserOpValidated(address indexed sender, uint256 indexed nonce, uint256 validationData);
    event Executed(address indexed target, uint256 value, bytes data);

    function archetype() external view returns (Archetype);

    /// @notice Called by EntryPoint during handleOps. Returns packed validation data.
    function validateUserOp(
        PackedUserOperation calldata userOp,
        bytes32 userOpHash,
        uint256 missingAccountFunds
    ) external returns (uint256 validationData);

    /// @notice Executes a single call. Callable only by EntryPoint or self.
    function execute(address target, uint256 value, bytes calldata data) external;

    /// @notice Batched execution variant.
    function executeBatch(address[] calldata targets, uint256[] calldata values, bytes[] calldata datas) external;
}
