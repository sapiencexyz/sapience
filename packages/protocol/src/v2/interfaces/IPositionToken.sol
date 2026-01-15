// SPDX-License-Identifier: MIT
pragma solidity ^0.8.19;

import "@openzeppelin/contracts/token/ERC20/IERC20.sol";

/**
 * @title IPositionToken
 * @notice Interface for V2 position tokens (predictor or counterparty)
 * @dev Each prediction has two position tokens with a fixed supply of 1e18.
 *      Token holders can transfer positions and redeem for proportional collateral.
 */
interface IPositionToken is IERC20 {
    /// @notice Fixed total supply for all position tokens
    function TOTAL_SUPPLY() external pure returns (uint256);

    /// @notice Get the prediction ID this token belongs to
    function predictionId() external view returns (bytes32);

    /// @notice Get the factory that created this token
    function factory() external view returns (address);

    /// @notice Check if this is the predictor token (vs counterparty)
    function isPredictorToken() external view returns (bool);

    /// @notice Burn tokens from a holder (used during redemption)
    /// @param holder The address to burn tokens from
    /// @param amount The amount to burn
    /// @dev Only callable by authorized contracts (escrow)
    function burn(address holder, uint256 amount) external;
}
