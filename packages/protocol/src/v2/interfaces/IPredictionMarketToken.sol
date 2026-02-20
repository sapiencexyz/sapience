// SPDX-License-Identifier: MIT
pragma solidity ^0.8.19;

import "@openzeppelin/contracts/token/ERC20/IERC20.sol";

/**
 * @title IPredictionMarketToken
 * @notice Interface for V2 position tokens (predictor or counterparty)
 * @dev Fungible tokens shared across predictions with the same picks.
 *      Supply is dynamic (equals total collateral). Holders can transfer and redeem.
 */
interface IPredictionMarketToken is IERC20 {
    /// @notice Get the pick configuration ID this token belongs to
    function pickConfigId() external view returns (bytes32);

    /// @notice Check if this is the predictor token (vs counterparty)
    function isPredictorToken() external view returns (bool);

    /// @notice Get the address authorized to mint/burn tokens
    function authority() external view returns (address);

    /// @notice Mint new tokens (used when new bets are placed)
    /// @param to The address to mint tokens to
    /// @param amount The amount to mint
    /// @dev Only callable by authority
    function mint(address to, uint256 amount) external;

    /// @notice Burn tokens from a holder (used during redemption)
    /// @param holder The address to burn tokens from
    /// @param amount The amount to burn
    /// @dev Only callable by authority
    function burn(address holder, uint256 amount) external;
}
