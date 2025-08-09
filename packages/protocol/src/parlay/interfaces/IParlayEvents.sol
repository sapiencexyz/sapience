// SPDX-License-Identifier: MIT
pragma solidity ^0.8.19;

import "./IParlayStructs.sol";

/**
 * @title IParlayEvents
 * @notice Interface containing all parlay-related events
 */
interface IParlayEvents {
    // ============ Events ============

    event ParlayOrderSubmitted(
        address indexed maker,
        uint256 indexed requestId,
        IParlayStructs.PredictedOutcome[] predictedOutcomes,
        uint256 collateral,
        uint256 payout,
        uint256 orderExpirationTime,
        bytes32 refCode
    );

    event ParlayOrderFilled(
        uint256 indexed requestId,
        address indexed maker,
        address indexed taker,
        uint256 makerNftTokenId,
        uint256 takerNftTokenId,
        uint256 collateral, // locked in the pool from maker
        uint256 delta, // delta paid by taker to reach the payout amount
        uint256 payout, // total payout to the winner,
        bytes32 refCode
    );

    event ParlaySettled(
        uint256 indexed makerNftTokenId,
        uint256 indexed takerNftTokenId,
        uint256 payout,
        bool makerWon
    );

    event ParlayCollateralWithdrawn(
        uint256 indexed nftTokenId,
        address indexed owner,
        uint256 amount
    );

    event ParlayExpired(
        uint256 indexed makerNftTokenId,
        uint256 indexed takerNftTokenId,
        uint256 collateralReclaimed
    );

    event OrderExpired(
        uint256 indexed requestId,
        address indexed maker,
        uint256 collateralReturned
    );
}
