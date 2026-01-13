// SPDX-License-Identifier: MIT
pragma solidity ^0.8.19;

/// @notice Minimal interface for the on-chain Pyth Lazer verifier contract.
/// @dev Mirrors `verifyUpdate` / `verification_fee` from upstream `PythLazer.sol`.
interface IPythLazer {
    function verification_fee() external view returns (uint256);

    function verifyUpdate(
        bytes calldata update
    ) external payable returns (bytes calldata payload, address signer);
}


