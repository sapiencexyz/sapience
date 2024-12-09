// SPDX-License-Identifier: MIT
pragma solidity >=0.8.2 <0.9.0;

import "../storage/Position.sol";

interface IFoilPositionEvents {
    // Liquidity Position Events
    event LiquidityPositionCreated(
        address indexed sender,
        uint256 indexed epochId,
        uint256 indexed positionId,
        uint256 collateralAmount,
        uint128 liquidity,
        uint256 addedAmount0,
        uint256 addedAmount1,
        int24 lowerTick,
        int24 upperTick
    );

    event LiquidityPositionDecreased(
        address indexed sender,
        uint256 indexed epochId,
        uint256 indexed positionId,
        uint256 collateralAmount,
        uint128 liquidity,
        uint256 decreasedAmount0,
        uint256 decreasedAmount1,
        uint256 loanAmount0,
        uint256 loanAmount1
    );

    event LiquidityPositionIncreased(
        address indexed sender,
        uint256 indexed epochId,
        uint256 indexed positionId,
        uint256 collateralAmount,
        uint128 liquidity,
        uint256 increasedAmount0,
        uint256 increasedAmount1,
        uint256 loanAmount0,
        uint256 loanAmount1
    );

    event LiquidityPositionClosed(
        address indexed sender,
        uint256 indexed epochId,
        uint256 indexed positionId,
        IFoilStructs.PositionKind kind,
        uint256 collectedAmount0,
        uint256 collectedAmount1,
        uint256 loanAmount0,
        uint256 loanAmount1
    );

    event CollateralDeposited(
        address indexed sender,
        uint256 indexed epochId,
        uint256 indexed positionId,
        uint256 depositedCollateralAmount,
        uint256 collateralAmountAdded
    );

    struct LiquidityPositionCreatedEventData {
        address sender;
        uint256 epochId;
        uint256 positionId;
        uint256 depositedCollateralAmount;
        uint128 liquidity;
        uint256 addedAmount0;
        uint256 addedAmount1;
        int24 lowerTick;
        int24 upperTick;
    }

    // Trade Position Events
    event TraderPositionCreated(
        address indexed sender,
        uint256 indexed epochId,
        uint256 indexed positionId,
        uint256 collateralAmount,
        uint256 vEthAmount,
        uint256 vGasAmount,
        uint256 borrowedVEth,
        uint256 borrowedVGas,
        uint256 initialPrice,
        uint256 finalPrice,
        uint256 tradeRatio
    );

    event TraderPositionModified(
        address indexed sender,
        uint256 indexed epochId,
        uint256 indexed positionId,
        uint256 collateralAmount,
        uint256 vEthAmount,
        uint256 vGasAmount,
        uint256 borrowedVEth,
        uint256 borrowedVGas,
        uint256 initialPrice,
        uint256 finalPrice,
        uint256 tradeRatio
    );

    // Generic Position Updated Events
    enum TransactionType {
        Undefined,
        CreateLiquidityPosition,
        IncreaseLiquidityPosition,
        DecreaseLiquidityPosition,
        CloseLiquidityPosition,
        TransitionLiquidityToTrade,
        DepositCollateral,
        CreateTradePosition,
        ModifyTradePosition,
        CloseTradePosition
    }

    event PositionUpdated(
        address indexed sender,
        uint256 indexed epochId,
        uint256 indexed positionId,
        TransactionType transactionType,
        int256 deltaCollateral,
        uint256 collateralAmount,
        uint256 vEthAmount,
        uint256 vGasAmount,
        uint256 borrowedVEth,
        uint256 borrowedVGas
    );

    struct PositionUpdatedEventData {
        TransactionType transactionType;
        address sender;
        int256 deltaCollateral;
        Position.Data position;
    }

    // Settlement Events
    /**
     * @notice Event emitted when a position is settled
     * @param positionId The ID of the settled position
     * @param withdrawnCollateral The amount of collateral withdrawn after settlement
     */
    event PositionSettled(uint256 positionId, uint256 withdrawnCollateral);
}
