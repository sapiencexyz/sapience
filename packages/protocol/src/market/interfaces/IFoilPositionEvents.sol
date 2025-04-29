// SPDX-License-Identifier: MIT
pragma solidity >=0.8.2 <0.9.0;

import "../storage/Position.sol";

interface IFoilPositionEvents {
    // Liquidity Position Events
    event LiquidityPositionCreated(
        address indexed sender,
        uint256 indexed epochId,
        uint256 indexed positionId,
        uint128 liquidity,
        uint256 addedAmount0,
        uint256 addedAmount1,
        int24 lowerTick,
        int24 upperTick,
        // Position State
        uint256 positionCollateralAmount,
        uint256 positionVethAmount,
        uint256 positionVgasAmount,
        uint256 positionBorrowedVeth,
        uint256 positionBorrowedVgas,
        // Delta Collateral
        int256 deltaCollateral
    );

    event LiquidityPositionDecreased(
        address indexed sender,
        uint256 indexed epochId,
        uint256 indexed positionId,
        uint256 requiredCollateralAmount,
        uint128 liquidity,
        uint256 decreasedAmount0,
        uint256 decreasedAmount1,
        uint256 loanAmount0,
        uint256 loanAmount1,
        // Position State
        uint256 positionCollateralAmount,
        uint256 positionVethAmount,
        uint256 positionVgasAmount,
        uint256 positionBorrowedVeth,
        uint256 positionBorrowedVgas,
        // Delta Collateral
        int256 deltaCollateral
    );

    event LiquidityPositionIncreased(
        address indexed sender,
        uint256 indexed epochId,
        uint256 indexed positionId,
        uint256 requiredCollateralAmount,
        uint128 liquidity,
        uint256 increasedAmount0,
        uint256 increasedAmount1,
        uint256 loanAmount0,
        uint256 loanAmount1,
        // Position State
        uint256 positionCollateralAmount,
        uint256 positionVethAmount,
        uint256 positionVgasAmount,
        uint256 positionBorrowedVeth,
        uint256 positionBorrowedVgas,
        // Delta Collateral
        int256 deltaCollateral
    );

    event LiquidityPositionClosed(
        address indexed sender,
        uint256 indexed epochId,
        uint256 indexed positionId,
        IFoilStructs.PositionKind kind,
        uint256 collectedAmount0,
        uint256 collectedAmount1,
        uint256 loanAmount0,
        uint256 loanAmount1,
        // Position State
        uint256 positionCollateralAmount,
        uint256 positionVethAmount,
        uint256 positionVgasAmount,
        uint256 positionBorrowedVeth,
        uint256 positionBorrowedVgas,
        // Delta Collateral
        int256 deltaCollateral
    );

    event CollateralDeposited(
        address indexed sender,
        uint256 indexed epochId,
        uint256 indexed positionId,
        // Position State
        uint256 positionCollateralAmount,
        uint256 positionVethAmount,
        uint256 positionVgasAmount,
        uint256 positionBorrowedVeth,
        uint256 positionBorrowedVgas,
        // Delta Collateral
        int256 deltaCollateral
    );

    struct LiquidityPositionCreatedEventData {
        address sender;
        uint256 epochId;
        uint256 positionId;
        uint128 liquidity;
        uint256 addedAmount0;
        uint256 addedAmount1;
        int24 lowerTick;
        int24 upperTick;
        // Position State
        uint256 positionCollateralAmount;
        uint256 positionVethAmount;
        uint256 positionVgasAmount;
        uint256 positionBorrowedVeth;
        uint256 positionBorrowedVgas;
        // Delta Collateral
        int256 deltaCollateral;
    }

    struct LiquidityPositionDecreasedEventData {
        address sender;
        uint256 epochId;
        uint256 positionId;
        uint256 requiredCollateralAmount;
        uint128 liquidity;
        uint256 decreasedAmount0;
        uint256 decreasedAmount1;
        uint256 loanAmount0;
        uint256 loanAmount1;
        // Position State
        uint256 positionCollateralAmount;
        uint256 positionVethAmount;
        uint256 positionVgasAmount;
        uint256 positionBorrowedVeth;
        uint256 positionBorrowedVgas;
        // Delta Collateral
        int256 deltaCollateral;
    }

    struct LiquidityPositionIncreasedEventData {
        address sender;
        uint256 epochId;
        uint256 positionId;
        uint256 requiredCollateralAmount;
        uint128 liquidity;
        uint256 increasedAmount0;
        uint256 increasedAmount1;
        uint256 loanAmount0;
        uint256 loanAmount1;
        // Position State
        uint256 positionCollateralAmount;
        uint256 positionVethAmount;
        uint256 positionVgasAmount;
        uint256 positionBorrowedVeth;
        uint256 positionBorrowedVgas;
        // Delta Collateral
        int256 deltaCollateral;
    }

    struct LiquidityPositionClosedEventData {
        address sender;
        uint256 epochId;
        uint256 positionId;
        IFoilStructs.PositionKind positionKind;
        uint256 collectedAmount0;
        uint256 collectedAmount1;
        uint256 loanAmount0;
        uint256 loanAmount1;
        // Position State
        uint256 positionCollateralAmount;
        uint256 positionVethAmount;
        uint256 positionVgasAmount;
        uint256 positionBorrowedVeth;
        uint256 positionBorrowedVgas;
        // Delta Collateral
        int256 deltaCollateral;
    }

    // Trade Position Events
    event TraderPositionCreated(
        address indexed sender,
        uint256 indexed epochId,
        uint256 indexed positionId,
        uint256 requiredCollateral,
        uint256 initialPrice,
        uint256 finalPrice,
        uint256 tradeRatio,
        // Position State
        uint256 positionCollateralAmount,
        uint256 positionVethAmount,
        uint256 positionVgasAmount,
        uint256 positionBorrowedVeth,
        uint256 positionBorrowedVgas,
        // Delta Collateral
        int256 deltaCollateral
    );

    event TraderPositionModified(
        address indexed sender,
        uint256 indexed epochId,
        uint256 indexed positionId,
        uint256 requiredCollateral,
        uint256 initialPrice,
        uint256 finalPrice,
        uint256 tradeRatio,
        // Position State
        uint256 positionCollateralAmount,
        uint256 positionVethAmount,
        uint256 positionVgasAmount,
        uint256 positionBorrowedVeth,
        uint256 positionBorrowedVgas,
        // Delta Collateral
        int256 deltaCollateral
    );

    struct TraderPositionModifiedEventData {
        address sender;
        uint256 epochId;
        uint256 positionId;
        uint256 requiredCollateral;
        uint256 initialPrice;
        uint256 finalPrice;
        uint256 tradeRatio;
        // Position State
        uint256 positionCollateralAmount;
        uint256 positionVethAmount;
        uint256 positionVgasAmount;
        uint256 positionBorrowedVeth;
        uint256 positionBorrowedVgas;
        // Delta Collateral
        int256 deltaCollateral;
    }

    struct TraderPositionCreatedEventData {
        address sender;
        uint256 epochId;
        uint256 positionId;
        uint256 requiredCollateral;
        uint256 initialPrice;
        uint256 finalPrice;
        uint256 tradeRatio;
        // Position State
        uint256 positionCollateralAmount;
        uint256 positionVethAmount;
        uint256 positionVgasAmount;
        uint256 positionBorrowedVeth;
        uint256 positionBorrowedVgas;
        // Delta Collateral
        int256 deltaCollateral;
    }

    // Settlement Events
    /**
     * @notice Event emitted when a position is settled
     * @param positionId The ID of the settled position
     * @param withdrawnCollateral The amount of collateral withdrawn after settlement
     * @param positionCollateralAmount The amount of collateral in the position after settlement
     * @param positionVethAmount The amount of vETH in the position after settlement
     * @param positionVgasAmount The amount of vGAS in the position after settlement
     * @param positionBorrowedVeth The amount of borrowed vETH in the position after settlement
     * @param positionBorrowedVgas The amount of borrowed vGAS in the position after settlement
     * @param deltaCollateral The change in collateral after settlement
     * @param epochId The ID of the epoch in which the position was settled
     */
    event PositionSettled(
        uint256 positionId,
        uint256 withdrawnCollateral,
        // Position State
        uint256 positionCollateralAmount,
        uint256 positionVethAmount,
        uint256 positionVgasAmount,
        uint256 positionBorrowedVeth,
        uint256 positionBorrowedVgas,
        // Delta Collateral
        int256 deltaCollateral,
        // Epoch ID
        uint256 epochId
    );
}
