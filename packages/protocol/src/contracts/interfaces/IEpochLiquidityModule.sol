// SPDX-License-Identifier: MIT
pragma solidity >=0.8.2 <0.9.0;

import {IFoilStructs} from "./IFoilStructs.sol";
import {INonfungiblePositionManager} from "../interfaces/external/INonfungiblePositionManager.sol";

interface IEpochLiquidityModule {
    event LiquidityPositionCreated(
        uint256 tokenId,
        uint256 collateralAmount,
        uint128 liquidity,
        uint256 addedAmount0,
        uint256 addedAmount1,
        int24 lowerTick,
        int24 upperTick
    );

    event LiquidityPositionDecreased(
        uint256 tokenId,
        uint256 collateralAmount,
        uint128 liquidity,
        uint256 amount0,
        uint256 amount1
    );

    event LiquidityPositionIncreased(
        uint256 tokenId,
        uint256 collateralAmount,
        uint128 liquidity,
        uint256 amount0,
        uint256 amount1
    );

    function createLiquidityPosition(
        IFoilStructs.LiquidityMintParams memory params
    )
        external
        returns (
            uint256 id,
            uint256 collateralAmount,
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
    }

    function increaseLiquidityPosition(
        IFoilStructs.LiquidityIncreaseParams memory params
    )
        external
        returns (
            uint128 liquidity,
            uint256 amount0,
            uint256 amount1,
            uint256 collateralAmount
        );

    function getTokenAmounts(
        uint256 epochId,
        uint256 depositedCollateralAmount,
        uint160 sqrtPriceX96,
        uint160 sqrtPriceAX96,
        uint160 sqrtPriceBX96
    )
        external
        view
        returns (uint256 amount0, uint256 amount1, uint128 liquidity);

    function getCollateralRequirementForAdditionalTokens(
        uint256 positionId,
        uint256 amount0,
        uint256 amount1
    ) external view returns (uint256);
}
