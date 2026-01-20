// SPDX-License-Identifier: MIT
pragma solidity ^0.8.19;

import "./IV2Types.sol";

/**
 * @title IV2Events
 * @notice Events for the V2 Prediction Market protocol
 */
interface IV2Events {
    /// @notice Emitted when a new prediction is created
    event PredictionCreated(
        bytes32 indexed predictionId,
        address indexed predictor,
        address indexed counterparty,
        address predictorToken,
        address counterpartyToken,
        uint256 predictorWager,
        uint256 counterpartyWager,
        bytes32 refCode
    );

    /// @notice Emitted when a prediction is settled
    event PredictionSettled(
        bytes32 indexed predictionId,
        IV2Types.SettlementResult result,
        uint256 predictorClaimable,
        uint256 counterpartyClaimable,
        bytes32 refCode
    );

    /// @notice Emitted when tokens are redeemed for collateral
    event TokensRedeemed(
        bytes32 indexed predictionId,
        address indexed holder,
        address indexed positionToken,
        uint256 tokensBurned,
        uint256 collateralPaid,
        bytes32 refCode
    );

    /// @notice Emitted when collateral is deposited into escrow
    event CollateralDeposited(
        bytes32 indexed predictionId, uint256 totalAmount
    );

    /// @notice Emitted when collateral distribution is recorded after settlement
    event CollateralDistributed(
        bytes32 indexed predictionId,
        uint256 predictorClaimable,
        uint256 counterpartyClaimable
    );
}
