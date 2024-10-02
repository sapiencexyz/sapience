// SPDX-License-Identifier: MIT
pragma solidity >=0.8.2 <0.9.0;

import "../storage/Epoch.sol";

contract ExposedInternalFunctions {
    using Epoch for Epoch.Data;

    function requiredCollateralForLiquidity(
        uint256 epochId,
        uint128 liquidity,
        uint256 loanAmount0,
        uint256 loanAmount1,
        uint256 tokensOwed0,
        uint256 tokensOwed1,
        uint160 sqrtPriceAX96,
        uint160 sqrtPriceBX96
    )
        external
        returns (
            // ) external view returns (uint256) { //@audit changed by fuzzer
            uint256
        )
    {
        Epoch.Data storage epoch = Epoch.load(epochId);
        return
            epoch.requiredCollateralForLiquidity(
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
