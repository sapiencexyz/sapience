// SPDX-License-Identifier: MIT
pragma solidity >=0.8.2 <0.9.0;

interface IExposedInternalFunctions {
    function requiredCollateralForLiquidity(
        uint256 marketId,
        uint128 liquidity,
        uint256 loanAmount0,
        uint256 loanAmount1,
        uint256 tokensOwed0,
        uint256 tokensOwed1,
        uint160 sqrtPriceAX96,
        uint160 sqrtPriceBX96
    ) external view returns (uint256);
}
