// SPDX-License-Identifier: MIT
// contracts/src/AgentAccount.sol
pragma solidity ^0.8.24;

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
        // Minimal signature check: owner signs the userOpHash with EIP-191.
        address recovered = _recover(userOpHash, userOp.signature);
        validationData = recovered == owner ? 0 : 1; // SIG_VALIDATION_FAILED
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

    function _recover(bytes32 hash, bytes memory sig) private pure returns (address) {
        if (sig.length != 65) return address(0);
        bytes32 r; bytes32 s; uint8 v;
        assembly {
            r := mload(add(sig, 32))
            s := mload(add(sig, 64))
            v := byte(0, mload(add(sig, 96)))
        }
        if (v < 27) v += 27;
        // Prefix per EIP-191 personal_sign.
        bytes32 digest = keccak256(abi.encodePacked("\x19Ethereum Signed Message:\n32", hash));
        return ecrecover(digest, v, r, s);
    }

    function _revertReason(bytes memory ret) private pure returns (string memory) {
        if (ret.length < 68) return "call reverted";
        assembly { ret := add(ret, 0x04) }
        return abi.decode(ret, (string));
    }
}
