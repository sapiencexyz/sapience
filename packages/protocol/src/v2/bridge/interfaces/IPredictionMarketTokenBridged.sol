// SPDX-License-Identifier: MIT
pragma solidity ^0.8.19;

import "@openzeppelin/contracts/token/ERC20/IERC20.sol";

/// @title IPredictionMarketTokenBridged
/// @notice Interface for bridged position tokens (on remote chain)
interface IPredictionMarketTokenBridged is IERC20 {
    // ============ Errors ============

    /// @notice Only bridge can mint/burn
    error OnlyBridge();

    // ============ View Functions ============

    /// @notice The prediction this token represents
    function pickConfigId() external view returns (bytes32);

    /// @notice True if this is the predictor token
    function isPredictorToken() external view returns (bool);

    /// @notice The bridge contract authorized for mint/burn
    function bridge() external view returns (address);

    // ============ Bridge Functions ============

    /// @notice Mint tokens (only bridge)
    /// @param to Recipient address
    /// @param amount Amount to mint
    function mint(address to, uint256 amount) external;

    /// @notice Burn tokens (only bridge)
    /// @param from Address to burn from
    /// @param amount Amount to burn
    function burn(address from, uint256 amount) external;
}
