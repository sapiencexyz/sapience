// SPDX-License-Identifier: MIT
pragma solidity >=0.8.2 <0.9.0;

interface IFoilStructs {
    struct AddLiquidityParams {
        uint256 accountId;
        uint256 amountTokenA;
        uint256 amountTokenB;
        uint256 collateralAmount;
        int24 lowerTick;
        int24 upperTick;
    }
}
