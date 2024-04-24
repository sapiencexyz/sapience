// SPDX-License-Identifier: MIT
pragma solidity >=0.8.2 <0.9.0;

interface IFoil {
    function createAccount(uint256 accountId) external;

    function getEpoch()
        external
        view
        returns (address pool, address ethToken, address gasToken);

    struct AddLiquidityRuntimeParams {
        uint256 accountId;
        uint256 amountTokenA;
        uint256 amountTokenB;
        uint256 collateralAmount;
        int24 lowerTick;
        int24 upperTick;
    }

    function addLiquidity(
        AddLiquidityRuntimeParams memory params
    )
        external
        payable
        returns (
            uint256 tokenId,
            uint128 liquidity,
            uint256 amount0,
            uint256 amount1
        );

    function getPosition(
        uint256 accountId
    ) external view returns (uint256 tokenAmount0, uint256 tokenAmount1);
}
