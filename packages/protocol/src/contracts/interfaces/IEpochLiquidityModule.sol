// SPDX-License-Identifier: MIT
pragma solidity >=0.8.2 <0.9.0;

import {IFoilStructs} from "./IFoilStructs.sol";

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
        IFoilStructs.LiquidityPositionParams memory params
    )
        external
        returns (
            uint256 tokenId,
            uint128 liquidity,
            uint256 addedAmount0,
            uint256 addedAmount1
        );

    function decreaseLiquidityPosition(
        uint256 positionId,
        uint256 depositedCollateralAmount,
        uint128 liquidity,
        uint256 minGasAmount,
        uint256 minEthAmount
    ) external returns (uint256 amount0, uint256 amount1);

    function increaseLiquidityPosition(
        uint256 positionId,
        uint256 depositedCollateralAmount,
        uint256 gasTokenAmount,
        uint256 ethTokenAmount,
        uint256 minGasAmount,
        uint256 minEthAmount
    ) external returns (uint128 liquidity, uint256 amount0, uint256 amount1);

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

    function collectFees(
        uint256 epochId,
        uint256 tokenId
    ) external returns (uint256 amount0, uint256 amount1);
}
