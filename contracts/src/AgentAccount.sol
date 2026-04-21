// SPDX-License-Identifier: MIT
// contracts/src/AgentAccount.sol
pragma solidity ^0.8.24;

import "@openzeppelin/contracts/utils/cryptography/ECDSA.sol";
import "@openzeppelin/contracts/utils/cryptography/MessageHashUtils.sol";
import "../interfaces/IAgentAccount.sol";

/// @notice Minimal EIP-4337 v0.7 smart account bound to a swarm archetype.
///         Owner key is set at construction; archetype tag is immutable.
///         Intended to be deployed via AgentAccountFactory with a
///         per-archetype salt for deterministic CREATE2 addresses.
///
/// @dev Production accounts should delegate paymaster + bundler fee logic
///      to a Paymaster contract. This reference is fee-payer-agnostic.
contract AgentAccount is IAgentAccount {
    address public immutable entryPoint;
    Archetype public immutable _archetype;
    address public owner;
    uint256 public nonce;

    error NotEntryPoint();
    error NotEntryPointOrSelf();

    constructor(address entryPoint_, Archetype archetype_, address owner_) {
        entryPoint = entryPoint_;
        _archetype = archetype_;
        owner      = owner_;
    }

    modifier onlyEntryPoint() {
        if (msg.sender != entryPoint) revert NotEntryPoint();
        _;
    }
    modifier onlyEntryPointOrSelf() {
        if (msg.sender != entryPoint && msg.sender != address(this)) revert NotEntryPointOrSelf();
        _;
    }

    function archetype() external view returns (Archetype) {
        return _archetype;
    }

    /// @inheritdoc IAgentAccount
    function validateUserOp(
        PackedUserOperation calldata userOp,
        bytes32 userOpHash,
        uint256 missingAccountFunds
    ) external onlyEntryPoint returns (uint256 validationData) {
        // EIP-191 personal_sign recovery via OZ ECDSA — rejects malleable `s`
        // (upper-half secp256k1n) and malformed signatures. Failure returns
        // SIG_VALIDATION_FAILED (=1) rather than reverting, per 4337 v0.7.
        bytes32 digest = MessageHashUtils.toEthSignedMessageHash(userOpHash);
        (address recovered, ECDSA.RecoverError err, ) = ECDSA.tryRecover(digest, userOp.signature);
        validationData = (err == ECDSA.RecoverError.NoError && recovered == owner) ? 0 : 1;
        nonce = userOp.nonce;
        emit UserOpValidated(userOp.sender, userOp.nonce, validationData);

        if (missingAccountFunds != 0) {
            (bool ok, ) = payable(msg.sender).call{value: missingAccountFunds}("");
            ok; // ignore result, per 4337 spec
        }
    }

    function execute(address target, uint256 value, bytes calldata data)
        external onlyEntryPointOrSelf
    {
        (bool ok, bytes memory ret) = target.call{value: value}(data);
        require(ok, _revertReason(ret));
        emit Executed(target, value, data);
    }

    function executeBatch(address[] calldata targets, uint256[] calldata values, bytes[] calldata datas)
        external onlyEntryPointOrSelf
    {
        require(targets.length == values.length && values.length == datas.length, "len");
        for (uint256 i = 0; i < targets.length; ++i) {
            (bool ok, bytes memory ret) = targets[i].call{value: values[i]}(datas[i]);
            require(ok, _revertReason(ret));
            emit Executed(targets[i], values[i], datas[i]);
        }
    }

    receive() external payable {}

    function _revertReason(bytes memory ret) private pure returns (string memory) {
        if (ret.length < 68) return "call reverted";
        assembly { ret := add(ret, 0x04) }
        return abi.decode(ret, (string));
    }
}
