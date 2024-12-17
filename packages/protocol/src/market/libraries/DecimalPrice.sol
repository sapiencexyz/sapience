// SPDX-License-Identifier: MIT
pragma solidity >=0.8.25 <0.9.0;

import "@openzeppelin/contracts/utils/math/Math.sol";

library DecimalPrice {
    uint256 constant Q96 = 2 ** 96;

    function sqrtRatioX96ToPrice(
        uint160 sqrtRatioX96
    ) internal pure returns (uint256 price) {
        // Calculate the price as (sqrtRatioX96^2) / (2^192)
        uint256 sqrtRatioX96Squared = Math.mulDiv(
            uint256(sqrtRatioX96),
            uint256(sqrtRatioX96),
            1
        );
        price = sqrtRatioX96Squared >> 96;
        price = Math.mulDiv(sqrtRatioX96Squared, 1e18, Q96);
    }
}
