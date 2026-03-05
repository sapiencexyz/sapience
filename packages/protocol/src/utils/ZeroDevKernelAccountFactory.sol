// SPDX-License-Identifier: MIT
pragma solidity ^0.8.19;

import { IAccountFactory } from "./IAccountFactory.sol";

interface IKernelFactory {
    function getAddress(bytes calldata data, bytes32 salt)
        external
        view
        returns (address);
}

/// @title ZeroDevKernelAccountFactory
/// @notice Wrapper for ZeroDev Kernel V3.1 factory implementing IAccountFactory
/// @dev Verified against SDK address computation - uses VALIDATOR_TYPE.SECONDARY (0x01)
contract ZeroDevKernelAccountFactory is IAccountFactory {
    IKernelFactory public immutable kernelFactory;
    address public immutable ecdsaValidator;

    /// @notice VALIDATOR_TYPE.SECONDARY = 0x01 (from ZeroDev SDK constants)
    /// @dev Even though used as sudo plugin, ECDSA validator has validatorType="SECONDARY"
    bytes1 private constant VALIDATOR_TYPE_SECONDARY = 0x01;

    constructor(address kernelFactory_, address ecdsaValidator_) {
        require(kernelFactory_ != address(0), "Invalid kernel factory");
        require(ecdsaValidator_ != address(0), "Invalid validator");
        kernelFactory = IKernelFactory(kernelFactory_);
        ecdsaValidator = ecdsaValidator_;
    }

    function getAccountAddress(address owner, uint256 index)
        external
        view
        override
        returns (address account)
    {
        bytes memory initData = _buildInitializeData(owner);
        bytes32 salt = bytes32(index);
        return kernelFactory.getAddress(initData, salt);
    }

    function _buildInitializeData(address owner)
        internal
        view
        returns (bytes memory)
    {
        // Build ValidationId: [0x01 type byte][20-byte validator address] = 21 bytes
        // This matches SDK's: concat([VALIDATOR_TYPE.SECONDARY, validatorAddress])
        bytes21 validationId = bytes21(
            bytes.concat(VALIDATOR_TYPE_SECONDARY, bytes20(ecdsaValidator))
        );

        // Validator data: owner address as raw bytes (20 bytes)
        // This matches SDK's: getEnableData() which returns the owner address
        bytes memory validatorData = abi.encodePacked(owner);

        // Build initialize call matching KernelV3_1AccountAbi
        return abi.encodeWithSignature(
            "initialize(bytes21,address,bytes,bytes,bytes[])",
            validationId,
            address(0), // hook: NO_HOOK
            validatorData, // validatorData: owner address
            "", // hookData: empty
            new bytes[](0) // initConfig: empty array
        );
    }
}
