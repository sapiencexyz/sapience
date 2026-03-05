// SPDX-License-Identifier: MIT
pragma solidity ^0.8.19;

import "./IV2Types.sol";

/**
 * @title IV2Events
 * @notice Events for the V2 Prediction Market protocol
 */
interface IV2Events {
    /// @notice Emitted when a new pick configuration is created (once per unique pick combo)
    event PickConfigCreated(
        bytes32 indexed pickConfigId,
        address predictorToken,
        address counterpartyToken,
        IV2Types.Pick[] picks
    );

    /// @notice Emitted when a new prediction is created
    event PredictionCreated(
        bytes32 indexed predictionId,
        address indexed predictor,
        address indexed counterparty,
        address predictorToken,
        address counterpartyToken,
        uint256 predictorCollateral,
        uint256 counterpartyCollateral,
        bytes32 refCode,
        bytes32 pickConfigId
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
        bytes32 indexed pickConfigId,
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

    /// @notice Emitted when dust is swept from a fully-redeemed pick configuration
    event DustSwept(
        bytes32 indexed pickConfigId, address indexed recipient, uint256 amount
    );

    /// @notice Emitted when positions are burned bilaterally before resolution
    event PositionsBurned(
        bytes32 indexed pickConfigId,
        address indexed predictorHolder,
        address indexed counterpartyHolder,
        uint256 predictorTokensBurned,
        uint256 counterpartyTokensBurned,
        uint256 predictorPayout,
        uint256 counterpartyPayout,
        bytes32 refCode
    );
}
