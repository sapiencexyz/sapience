// SPDX-License-Identifier: GPL-3.0

pragma solidity >=0.8.2 <0.9.0;

import {TickMath} from "../external/univ3/TickMath.sol";
import {FullMath} from "../external/univ3/FullMath.sol";

import "forge-std/console2.sol";

library Quote {
    function quoteEthToGas(
        uint256 ethAmount,
        uint160 sqrtRatioX96
    ) internal pure returns (uint256) {
        return
            FullMath.mulDiv(ethAmount, 1e18, sqrtRatioX96ToPrice(sqrtRatioX96));
    }

    function quoteGasToEth(
        uint256 gasAmount,
        uint160 sqrtRatioX96
    ) internal pure returns (uint256) {
        return
            FullMath.mulDiv(gasAmount, sqrtRatioX96ToPrice(sqrtRatioX96), 1e18);
    }

    function sqrtRatioX96ToPrice(
        uint160 sqrtRatioX96
    ) internal pure returns (uint256 price) {
        // Calculate the price as (sqrtRatioX96^2) / (2^192)
        uint256 sqrtRatioX96Squared = uint256(sqrtRatioX96) *
            uint256(sqrtRatioX96);
        price = sqrtRatioX96Squared >> 96;
        // Scale price to have 18 decimal places
        price = (price * 10 ** 18) / (2 ** 96);
    }
}
