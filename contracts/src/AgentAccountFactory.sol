// SPDX-License-Identifier: MIT
// contracts/src/AgentAccountFactory.sol
pragma solidity ^0.8.24;

import "./AgentAccount.sol";

/// @notice Deterministic factory. `predictAddress(archetype, owner)` returns
///         the CREATE2 address that `createAccount` would produce.
///         Per-archetype salt differentiation is achieved by mixing the
///         archetype enum value into the CREATE2 salt.
contract AgentAccountFactory {
    address public immutable entryPoint;

    event AccountCreated(address account, IAgentAccount.Archetype archetype, address owner);

    constructor(address entryPoint_) {
        entryPoint = entryPoint_;
    }

    function createAccount(IAgentAccount.Archetype archetype, address owner)
        external returns (address account)
    {
        bytes32 salt = _salt(archetype, owner);
        account = predictAddress(archetype, owner);
        if (account.code.length != 0) return account; // already deployed

        account = address(new AgentAccount{salt: salt}(entryPoint, archetype, owner));
        emit AccountCreated(account, archetype, owner);
    }

    function predictAddress(IAgentAccount.Archetype archetype, address owner)
        public view returns (address)
    {
        bytes32 salt = _salt(archetype, owner);
        bytes memory init = abi.encodePacked(
            type(AgentAccount).creationCode,
            abi.encode(entryPoint, archetype, owner)
        );
        bytes32 hash = keccak256(abi.encodePacked(bytes1(0xff), address(this), salt, keccak256(init)));
        return address(uint160(uint256(hash)));
    }

    function _salt(IAgentAccount.Archetype archetype, address owner)
        private pure returns (bytes32)
    {
        return keccak256(abi.encodePacked(uint8(archetype), owner));
    }
}
