// SPDX-License-Identifier: MIT
pragma solidity >=0.8.25 <0.9.0;

import {DecimalMath} from "./DecimalMath.sol";

library DecimalPrice {
    function sqrtRatioX96ToPrice(
        uint160 sqrtRatioX96
    ) internal pure returns (uint256 price) {
        // Calculate the price as (sqrtRatioX96^2) / (2^192)
        uint256 sqrtRatioX96Squared = DecimalMath.mulDecimal(
            uint256(sqrtRatioX96),
            uint256(sqrtRatioX96)
        );
        price = sqrtRatioX96Squared >> 96;
        // Scale price to have 18 decimal places
        price = DecimalMath.divDecimal(price, 2 ** 96);
    }
}
