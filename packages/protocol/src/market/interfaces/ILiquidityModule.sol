// SPDX-License-Identifier: MIT
pragma solidity >=0.8.2 <0.9.0;

import {IFoilStructs} from "./IFoilStructs.sol";
import {INonfungiblePositionManager} from "../interfaces/external/INonfungiblePositionManager.sol";

interface ILiquidityModule {
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

    /**
     * @notice Creates a new liquidity position in the specified epoch
     * @param params The parameters for creating the liquidity position
     * @return id The unique identifier of the created position
     * @return requiredCollateralAmount The amount of collateral required for the position
     * @return totalDepositedCollateralAmount The total amount of collateral deposited for the position
     * @return uniswapNftId The ID of the Uniswap V3 NFT representing the liquidity position
     * @return liquidity The amount of liquidity added to the position
     * @return addedAmount0 The amount of token0 added to the position
     * @return addedAmount1 The amount of token1 added to the position
     */
    function createLiquidityPosition(
        IFoilStructs.LiquidityMintParams memory params
    )
        external
        returns (
            uint256 id,
            uint256 requiredCollateralAmount,
            uint256 totalDepositedCollateralAmount,
            uint256 uniswapNftId,
            uint128 liquidity,
            uint256 addedAmount0,
            uint256 addedAmount1
        );

    struct DecreaseLiquidityPositionStack {
        uint256 previousAmount0;
        uint256 previousAmount1;
        uint128 previousLiquidity;
        int24 lowerTick;
        int24 upperTick;
        INonfungiblePositionManager.DecreaseLiquidityParams decreaseParams;
        uint256 tokensOwed0;
        uint256 tokensOwed1;
        bool isFeeCollector;
        uint256 requiredCollateralAmount;
        uint256 newCollateralAmount;
        uint256 loanAmount0;
        uint256 loanAmount1;
    }

    function decreaseLiquidityPosition(
        IFoilStructs.LiquidityDecreaseParams memory params
    )
        external
        returns (uint256 amount0, uint256 amount1, uint256 collateralAmount);

    struct IncreaseLiquidityPositionStack {
        uint256 previousAmount0;
        uint256 previousAmount1;
        uint128 previousLiquidity;
        int24 lowerTick;
        int24 upperTick;
        INonfungiblePositionManager.IncreaseLiquidityParams increaseParams;
        uint256 tokensOwed0;
        uint256 tokensOwed1;
        bool isFeeCollector;
        uint256 requiredCollateralAmount;
        uint256 newCollateralAmount;
        uint256 loanAmount0;
        uint256 loanAmount1;
    }

    function increaseLiquidityPosition(
        IFoilStructs.LiquidityIncreaseParams memory params
    )
        external
        returns (
            uint128 liquidity,
            uint256 amount0,
            uint256 amount1,
            uint256 requiredCollateralAmount,
            uint256 totalDepositedCollateralAmount
        );

    function quoteLiquidityPositionTokens(
        uint256 epochId,
        uint256 depositedCollateralAmount,
        uint160 sqrtPriceX96,
        uint160 sqrtPriceAX96,
        uint160 sqrtPriceBX96
    )
        external
        view
        returns (uint256 amount0, uint256 amount1, uint128 liquidity);

    function quoteRequiredCollateral(
        uint256 positionId,
        uint128 liquidity
    ) external view returns (uint256 requiredCollateral);

    /**
     * @notice Increases the deposited collateral for a liquidity position
     * @dev Only the fee collector can increase the deposited collateral
     * @dev The fee collector is maybe an L2 sequencer that deposits its fees periodically instead of
     *      having upfront capital.  it's like a smart/trusted margin account
     * @param positionId The ID of the liquidity position (fee collector has to be owner)
     * @param collateralAmount The amount of collateral to increase
     */
    function depositCollateral(
        uint256 positionId,
        uint256 collateralAmount
    ) external;
}
