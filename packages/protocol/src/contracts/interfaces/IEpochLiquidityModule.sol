// SPDX-License-Identifier: MIT
pragma solidity >=0.8.2 <0.9.0;

import {IFoilStructs} from "./IFoilStructs.sol";

interface IEpochLiquidityModule {
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
        uint256 accountId,
        uint256 collateralAmount,
        uint128 liquidity,
        uint256 minGasAmount,
        uint256 minEthAmount
    ) external returns (uint256 amount0, uint256 amount1);

    function increaseLiquidityPosition(
        uint256 accountId,
        uint256 collateralAmount,
        uint256 gasTokenAmount,
        uint256 ethTokenAmount,
        uint256 minGasAmount,
        uint256 minEthAmount
    ) external returns (uint128 liquidity, uint256 amount0, uint256 amount1);

    function collectFees(
        uint256 tokenId
    ) external returns (uint256 amount0, uint256 amount1);

    function getPosition(
        uint256 accountId
    )
        external
        view
        returns (
            uint256 tokenId,
            uint256 collateralAmount,
            uint256 borrowedGwei,
            uint256 borrowedGas
        );
}
