// SPDX-License-Identifier: MIT
pragma solidity >=0.8.2 <0.9.0;

import {IExposedInternalFunctions} from "../../interfaces/mocks/IExposedInternalFunctions.sol";
import {Market} from "../../storage/Market.sol";

contract ExposedInternalFunctions is IExposedInternalFunctions {
    using Market for Market.Data;
    function requiredCollateralForLiquidity(
        uint256 marketId,
        uint128 liquidity,
        uint256 loanAmount0,
        uint256 loanAmount1,
        uint256 tokensOwed0,
        uint256 tokensOwed1,
        uint160 sqrtPriceAX96,
        uint160 sqrtPriceBX96
    ) external view returns (uint256) {
        Market.Data storage market = Market.load(marketId);
        return market.requiredCollateralForLiquidity(
            liquidity,
            loanAmount0,
            loanAmount1,
            tokensOwed0,
            tokensOwed1,
            sqrtPriceAX96,
            sqrtPriceBX96
        );
    }
}