// SPDX-License-Identifier: MIT
pragma solidity ^0.8.19;

import "./IV2Types.sol";

/**
 * @title IPredictionMarketV2
 * @notice Interface for the V2 Prediction Market orchestrator
 * @dev Main entry point for mint, settle, and redeem operations
 */
interface IPredictionMarketV2 {
    // ============ Errors ============

    error InvalidSignature();
    error ExpiredDeadline();
    error InvalidNonce();
    error PredictionAlreadyExists();
    error PredictionNotFound();
    error PredictionNotSettled();
    error PredictionAlreadySettled();
    error PredictionNotResolvable();
    error InvalidPicks();
    error DuplicatePick();
    error PicksNotCanonical();
    error ZeroWager();
    error InvalidToken();

    // ============ External Functions ============

    /// @notice Create a new prediction with both parties' signatures
    /// @param request The mint request containing picks, wagers, and signatures
    /// @return predictionId The unique prediction identifier
    /// @return predictorToken Address of the predictor position token
    /// @return counterpartyToken Address of the counterparty position token
    function mint(IV2Types.MintRequest calldata request)
        external
        returns (bytes32 predictionId, address predictorToken, address counterpartyToken);

    /// @notice Settle a prediction based on condition resolver outcomes
    /// @param predictionId The prediction to settle
    /// @dev Anyone can call this once all picks are resolved
    function settle(bytes32 predictionId) external;

    /// @notice Redeem position tokens for collateral
    /// @param positionToken The position token to redeem
    /// @param amount Amount of tokens to redeem
    /// @return payout Amount of collateral received
    function redeem(address positionToken, uint256 amount) external returns (uint256 payout);

    // ============ View Functions ============

    /// @notice Get prediction data
    /// @param predictionId The prediction identifier
    /// @return prediction The prediction data
    function getPrediction(bytes32 predictionId) external view returns (IV2Types.Prediction memory prediction);

    /// @notice Get the token pair for a prediction
    /// @param predictionId The prediction identifier
    /// @return tokenPair The predictor and counterparty token addresses
    function getTokenPair(bytes32 predictionId) external view returns (IV2Types.TokenPair memory tokenPair);

    /// @notice Get the current nonce for an account
    /// @param account The account address
    /// @return nonce The current nonce
    function getNonce(address account) external view returns (uint256 nonce);

    /// @notice Check if a prediction can be settled
    /// @param predictionId The prediction identifier
    /// @return canSettle True if the prediction can be settled
    function canSettle(bytes32 predictionId) external view returns (bool canSettle);

    /// @notice Get the picks for a prediction
    /// @param predictionId The prediction identifier
    /// @return picks The array of picks
    function getPicks(bytes32 predictionId) external view returns (IV2Types.Pick[] memory picks);
}
