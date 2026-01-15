// SPDX-License-Identifier: MIT
pragma solidity ^0.8.19;

import "./IV2Types.sol";

/**
 * @title ICollateralEscrow
 * @notice Interface for the collateral escrow and distribution contract
 * @dev Holds WUSDe collateral, tracks claimable amounts, and handles redemptions
 */
interface ICollateralEscrow {
    /// @notice Deposit collateral for a new prediction
    /// @param predictionId The prediction identifier
    /// @param predictorWager Amount from predictor
    /// @param counterpartyWager Amount from counterparty
    /// @param predictor Address of predictor (source of predictorWager)
    /// @param counterparty Address of counterparty (source of counterpartyWager)
    /// @dev Only callable by the prediction market contract
    function deposit(
        bytes32 predictionId,
        uint256 predictorWager,
        uint256 counterpartyWager,
        address predictor,
        address counterparty
    ) external;

    /// @notice Record settlement outcome and assign claimable amounts
    /// @param predictionId The prediction identifier
    /// @param result The settlement result
    /// @param predictorWager Original predictor wager
    /// @param counterpartyWager Original counterparty wager
    /// @dev Only callable by the prediction market contract
    function recordSettlement(
        bytes32 predictionId,
        IV2Types.SettlementResult result,
        uint256 predictorWager,
        uint256 counterpartyWager
    ) external;

    /// @notice Redeem position tokens for collateral
    /// @param predictionId The prediction identifier
    /// @param positionToken The position token being redeemed
    /// @param holder Address of the token holder
    /// @param tokenAmount Amount of tokens to redeem
    /// @return payout Amount of collateral paid out
    /// @dev Burns tokens and transfers proportional collateral
    function redeem(bytes32 predictionId, address positionToken, address holder, uint256 tokenAmount)
        external
        returns (uint256 payout);

    /// @notice Get the escrow record for a prediction
    /// @param predictionId The prediction identifier
    /// @return record The escrow record
    function getEscrowRecord(bytes32 predictionId) external view returns (IV2Types.EscrowRecord memory record);

    /// @notice Calculate claimable amount for a given token amount
    /// @param predictionId The prediction identifier
    /// @param positionToken The position token
    /// @param tokenAmount Amount of tokens
    /// @return claimable Amount of collateral claimable
    function getClaimableAmount(bytes32 predictionId, address positionToken, uint256 tokenAmount)
        external
        view
        returns (uint256 claimable);
}
