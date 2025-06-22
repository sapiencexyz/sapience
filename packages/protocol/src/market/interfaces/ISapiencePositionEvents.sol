// SPDX-License-Identifier: MIT
pragma solidity >=0.8.2 <0.9.0;

import "../storage/Position.sol";

import {ISapienceStructs} from "./ISapienceStructs.sol";

interface ISapiencePositionEvents {
    // Liquidity Position Events
    event LiquidityPositionCreated(
        address indexed sender,
        uint256 indexed marketId,
        uint256 indexed positionId,
        uint128 liquidity,
        uint256 addedAmount0,
        uint256 addedAmount1,
        int24 lowerTick,
        int24 upperTick,
        // Position State
        uint256 positionCollateralAmount,
        uint256 positionVquoteAmount,
        uint256 positionVbaseAmount,
        uint256 positionBorrowedVquote,
        uint256 positionBorrowedVbase,
        // Delta Collateral
        int256 deltaCollateral
    );

    event LiquidityPositionDecreased(
        address indexed sender,
        uint256 indexed marketId,
        uint256 indexed positionId,
        uint256 requiredCollateralAmount,
        uint128 liquidity,
        uint256 decreasedAmount0,
        uint256 decreasedAmount1,
        uint256 loanAmount0,
        uint256 loanAmount1,
        // Position State
        uint256 positionCollateralAmount,
        uint256 positionVquoteAmount,
        uint256 positionVbaseAmount,
        uint256 positionBorrowedVquote,
        uint256 positionBorrowedVbase,
        // Delta Collateral
        int256 deltaCollateral
    );

    event LiquidityPositionIncreased(
        address indexed sender,
        uint256 indexed marketId,
        uint256 indexed positionId,
        uint256 requiredCollateralAmount,
        uint128 liquidity,
        uint256 increasedAmount0,
        uint256 increasedAmount1,
        uint256 loanAmount0,
        uint256 loanAmount1,
        // Position State
        uint256 positionCollateralAmount,
        uint256 positionVquoteAmount,
        uint256 positionVbaseAmount,
        uint256 positionBorrowedVquote,
        uint256 positionBorrowedVbase,
        // Delta Collateral
        int256 deltaCollateral
    );

    event LiquidityPositionClosed(
        address indexed sender,
        uint256 indexed marketId,
        uint256 indexed positionId,
        ISapienceStructs.PositionKind kind,
        uint256 collectedAmount0,
        uint256 collectedAmount1,
        uint256 loanAmount0,
        uint256 loanAmount1,
        // Position State
        uint256 positionCollateralAmount,
        uint256 positionVquoteAmount,
        uint256 positionVbaseAmount,
        uint256 positionBorrowedVquote,
        uint256 positionBorrowedVbase,
        // Delta Collateral
        int256 deltaCollateral
    );

    event CollateralDeposited(
        address indexed sender,
        uint256 indexed marketId,
        uint256 indexed positionId,
        // Position State
        uint256 positionCollateralAmount,
        uint256 positionVquoteAmount,
        uint256 positionVbaseAmount,
        uint256 positionBorrowedVquote,
        uint256 positionBorrowedVbase,
        // Delta Collateral
        int256 deltaCollateral
    );

    struct LiquidityPositionCreatedEventData {
        address sender;
        uint256 marketId;
        uint256 positionId;
        uint128 liquidity;
        uint256 addedAmount0;
        uint256 addedAmount1;
        int24 lowerTick;
        int24 upperTick;
        // Position State
        uint256 positionCollateralAmount;
        uint256 positionVquoteAmount;
        uint256 positionVbaseAmount;
        uint256 positionBorrowedVquote;
        uint256 positionBorrowedVbase;
        // Delta Collateral
        int256 deltaCollateral;
    }

    struct LiquidityPositionDecreasedEventData {
        address sender;
        uint256 marketId;
        uint256 positionId;
        uint256 requiredCollateralAmount;
        uint128 liquidity;
        uint256 decreasedAmount0;
        uint256 decreasedAmount1;
        uint256 loanAmount0;
        uint256 loanAmount1;
        // Position State
        uint256 positionCollateralAmount;
        uint256 positionVquoteAmount;
        uint256 positionVbaseAmount;
        uint256 positionBorrowedVquote;
        uint256 positionBorrowedVbase;
        // Delta Collateral
        int256 deltaCollateral;
    }

    struct LiquidityPositionIncreasedEventData {
        address sender;
        uint256 marketId;
        uint256 positionId;
        uint256 requiredCollateralAmount;
        uint128 liquidity;
        uint256 increasedAmount0;
        uint256 increasedAmount1;
        uint256 loanAmount0;
        uint256 loanAmount1;
        // Position State
        uint256 positionCollateralAmount;
        uint256 positionVquoteAmount;
        uint256 positionVbaseAmount;
        uint256 positionBorrowedVquote;
        uint256 positionBorrowedVbase;
        // Delta Collateral
        int256 deltaCollateral;
    }

    struct LiquidityPositionClosedEventData {
        address sender;
        uint256 marketId;
        uint256 positionId;
        ISapienceStructs.PositionKind positionKind;
        uint256 collectedAmount0;
        uint256 collectedAmount1;
        uint256 loanAmount0;
        uint256 loanAmount1;
        // Position State
        uint256 positionCollateralAmount;
        uint256 positionVquoteAmount;
        uint256 positionVbaseAmount;
        uint256 positionBorrowedVquote;
        uint256 positionBorrowedVbase;
        // Delta Collateral
        int256 deltaCollateral;
    }

    // Trade Position Events
    event TraderPositionCreated(
        address indexed sender,
        uint256 indexed marketId,
        uint256 indexed positionId,
        uint256 requiredCollateral,
        uint256 initialPrice,
        uint256 finalPrice,
        uint256 tradeRatio,
        // Position State
        uint256 positionCollateralAmount,
        uint256 positionVquoteAmount,
        uint256 positionVbaseAmount,
        uint256 positionBorrowedVquote,
        uint256 positionBorrowedVbase,
        // Delta Collateral
        int256 deltaCollateral
    );

    event TraderPositionModified(
        address indexed sender,
        uint256 indexed marketId,
        uint256 indexed positionId,
        uint256 requiredCollateral,
        uint256 initialPrice,
        uint256 finalPrice,
        uint256 tradeRatio,
        // Position State
        uint256 positionCollateralAmount,
        uint256 positionVquoteAmount,
        uint256 positionVbaseAmount,
        uint256 positionBorrowedVquote,
        uint256 positionBorrowedVbase,
        // Delta Collateral
        int256 deltaCollateral
    );

    struct TraderPositionModifiedEventData {
        address sender;
        uint256 marketId;
        uint256 positionId;
        uint256 requiredCollateral;
        uint256 initialPrice;
        uint256 finalPrice;
        uint256 tradeRatio;
        // Position State
        uint256 positionCollateralAmount;
        uint256 positionVquoteAmount;
        uint256 positionVbaseAmount;
        uint256 positionBorrowedVquote;
        uint256 positionBorrowedVbase;
        // Delta Collateral
        int256 deltaCollateral;
    }

    struct TraderPositionCreatedEventData {
        address sender;
        uint256 marketId;
        uint256 positionId;
        uint256 requiredCollateral;
        uint256 initialPrice;
        uint256 finalPrice;
        uint256 tradeRatio;
        // Position State
        uint256 positionCollateralAmount;
        uint256 positionVquoteAmount;
        uint256 positionVbaseAmount;
        uint256 positionBorrowedVquote;
        uint256 positionBorrowedVbase;
        // Delta Collateral
        int256 deltaCollateral;
    }

    // Settlement Events
    /**
     * @notice Event emitted when a position is settled
     * @param positionId The ID of the settled position
     * @param withdrawnCollateral The amount of collateral withdrawn after settlement
     * @param positionCollateralAmount The amount of collateral in the position after settlement
     * @param positionVquoteAmount The amount of vQuote in the position after settlement
     * @param positionVbaseAmount The amount of vBase in the position after settlement
     * @param positionBorrowedVquote The amount of borrowed vQuote in the position after settlement
     * @param positionBorrowedVbase The amount of borrowed vBase in the position after settlement
     * @param deltaCollateral The change in collateral after settlement
     * @param marketId The ID of the market in which the position was settled
     * @param positionOwner The address of the owner of the position
     */
    event PositionSettled(
        uint256 positionId,
        uint256 withdrawnCollateral,
        // Position State
        uint256 positionCollateralAmount,
        uint256 positionVquoteAmount,
        uint256 positionVbaseAmount,
        uint256 positionBorrowedVquote,
        uint256 positionBorrowedVbase,
        // Delta Collateral
        int256 deltaCollateral,
        // Market ID and sender
        uint256 marketId,
        address positionOwner
    );
}
