// SPDX-License-Identifier: MIT
pragma solidity ^0.8.19;

import "./IPredictionStructs.sol";

/**
 * @title IPredictionEvents
 * @notice Interface containing all prediction-related events
 */
interface IPredictionEvents {
    // ============ Events ============

    // delta paid by taker to reach the payout amount
    // total payout to the winner,
    event PredictionMinted( // locked in the pool from maker
        address indexed maker,
        address indexed taker,
        bytes encodedPredictedOutcomes,
        uint256 makerNftTokenId,
        uint256 takerNftTokenId,
        uint256 makerCollateral,
        uint256 takerCollateral,
        uint256 totalCollateral,
        bytes32 refCode
    );

    event PredictionBurned(
        address indexed maker,
        address indexed taker,
        bytes encodedPredictedOutcomes,
        uint256 makerNftTokenId,
        uint256 takerNftTokenId,
        uint256 totalCollateral,
        bool makerWon,
        bytes32 refCode
    );

    event PredictionConsolidated(
        uint256 indexed makerNftTokenId,
        uint256 indexed takerNftTokenId,
        uint256 totalCollateral,
        bytes32 refCode
    );

    // ============ Limit Order Events ============
    event OrderPlaced(
        address indexed maker,
        uint256 indexed orderId,
        bytes encodedPredictedOutcomes,
        address resolver,
        uint256 makerCollateral,
        uint256 takerCollateral,
        bytes32 refCode
    );

    event OrderFilled(
        uint256 indexed orderId,
        address indexed maker,
        address indexed taker,
        bytes encodedPredictedOutcomes,
        uint256 makerCollateral,
        uint256 takerCollateral,
        bytes32 refCode
    );

    event OrderCancelled(
        uint256 indexed orderId,
        address indexed maker,
        bytes encodedPredictedOutcomes,
        uint256 makerCollateral,
        uint256 takerCollateral
    );
}
