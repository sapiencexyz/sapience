// SPDX-License-Identifier: MIT
pragma solidity ^0.8.19;

/// @title IAccountFactory
/// @notice Interface for smart account factories (e.g., ZeroDev Kernel)
/// @dev Used to verify smart account ownership by predicting account addresses
interface IAccountFactory {
    /// @notice Get the deterministic address for a smart account
    /// @param owner The owner of the smart account
    /// @param index The account index/salt (usually 0 for primary account)
    /// @return account The predicted smart account address
    function getAccountAddress(address owner, uint256 index)
        external
        view
        returns (address account);
}
