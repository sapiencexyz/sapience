// SPDX-License-Identifier: MIT
pragma solidity >=0.8.2 <0.9.0;

import "./IFoilStructs.sol";
import "../storage/Position.sol";

interface IFoil {
    function getEpoch()
        external
        view
        returns (address pool, address ethToken, address gasToken);

    // function getPosition(
    //     uint256 accountId
    // ) external view returns (uint256 tokenAmount0, uint256 tokenAmount1);

    function createTraderPosition(
        uint collateral,
        int size
    ) external returns (uint256 tokenId);

    function updateTraderPosition(
        uint256 tokenId,
        uint collateral,
        int size
    ) external;

    function createLiquidityPosition(
        IFoilStructs.LiquidityPositionParams memory params
    )
        external
        payable
        returns (
            uint256 tokenId,
            uint128 liquidity,
            uint256 amount0,
            uint256 amount1
        );

    function createLiquidityPositionTwo(
        IFoilStructs.LiquidityPositionParams memory params
    )
        external
        payable
        returns (
            uint256 tokenId,
            uint128 liquidity,
            uint256 amount0,
            uint256 amount1
        );

    function swapTokens(
        uint256 amountInVEth,
        uint256 amountInVGas
    ) external returns (uint256 amountOutVEth, uint256 amountOutVGas);

    function updateLiquidityPosition(
        uint256 tokenId,
        uint256 collateral,
        uint128 liquidityRatio
    ) external payable returns (uint256 amount0, uint256 amount1);

    function collectFees(
        uint256 tokenId
    ) external returns (uint256 amount0, uint256 amount1);

    function getPosition(
        uint256 positionId
    )
        external
        view
        returns (
            uint96 nonce,
            address operator,
            address token0,
            address token1,
            uint24 fee,
            int24 tickLower,
            int24 tickUpper,
            uint128 liquidity,
            uint256 feeGrowthInside0LastX128,
            uint256 feeGrowthInside1LastX128,
            uint128 tokensOwed0,
            uint128 tokensOwed1
        );

    function fakeSettle(uint256 settlementPrice) external;

    function getPositionData(
        uint256 accountId
    ) external view returns (Position.Data memory);

    function getAccountData(
        uint256 accountId
    ) external view returns (Account.Data memory);

    function getTokenAmounts(
        uint256 collateralAmountETH, // in ETH terms (18 decimals)
        int24 tickLower,
        int24 tickUpper,
        uint160 sqrtPriceX96
    ) external pure returns (uint256 amountGWEI, uint256 amountGAS);
}
