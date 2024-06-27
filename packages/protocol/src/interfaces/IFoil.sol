// SPDX-License-Identifier: MIT
pragma solidity >=0.8.2 <0.9.0;

import "./IFoilStructs.sol";

interface IFoil {
    function getEpoch()
        external
        view
        returns (address pool, address ethToken, address gasToken);

    function getPosition(
        uint256 accountId
    ) external view returns (uint256 tokenAmount0, uint256 tokenAmount1);

    function createTraderPosition(uint collateral, int size) external returns ( uint256 tokenId);

    function updateTraderPosition(uint256 tokenId, uint collateral, int size) external;

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

    function updateLiquidityPosition(
        uint256 tokenId,
        uint256 collateral,
        uint256 liquidityRatio
    )
        external
        payable
        returns (
            uint128 liquidity,
            uint256 amount0,
            uint256 amount1
        );

}
