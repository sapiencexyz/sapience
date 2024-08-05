// SPDX-License-Identifier: MIT
pragma solidity >=0.8.2 <0.9.0;

import "./IFoilStructs.sol";
import "../storage/Position.sol";
import "../storage/FAccount.sol";
import "./IEpochLiquidityModule.sol";

interface IFoil is IEpochLiquidityModule {
    function getEpoch(
            uint256 epochId
    ) external view returns (address pool, address ethToken, address gasToken);

    // function getPosition(
    //     uint256 accountId
    // ) external view returns (uint256 tokenAmount0, uint256 tokenAmount1);

    function createTraderPosition(
        uint256 epochId,
        uint256 collateral,
        int256 tokenAmount,
        int256 tokenAmountLimit
    ) external returns (uint256 tokenId);

    function modifyTraderPosition(
        uint256 epochId,
        uint256 tokenId,
        uint256 collateral,
        int256 tokenAmount,
        int256 tokenAmountLimit
    ) external;

    function swapTokens(
        uint256 amountInVEth,
        uint256 amountInVGas
    ) external returns (uint256 amountOutVEth, uint256 amountOutVGas);

    function fakeSettle(uint256 settlementPrice) external;

    function getPositionData(
        uint256 accountId
    ) external view returns (Position.Data memory);

    function getAccountData(
        uint256 accountId
    ) external view returns (FAccount.Data memory);

    function getTokenAmounts(
        uint256 collateralAmountETH, // in ETH terms (18 decimals)
        int24 tickLower,
        int24 tickUpper,
        uint160 sqrtPriceX96
    ) external pure returns (uint256 amountGWEI, uint256 amountGAS);

    function getReferencePrice(
        uint256 epochId
    ) external view returns (uint256 price);
}
