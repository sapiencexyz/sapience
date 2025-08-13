// SPDX-License-Identifier: MIT

pragma solidity >=0.8.2 <0.9.0;

import {TickMath} from "../external/univ3/TickMath.sol";
import {FullMath} from "../external/univ3/FullMath.sol";
import {DecimalPrice} from "./DecimalPrice.sol";

library Quote {
    function quoteBaseToQuoteWithPrice(uint256 baseAmount, uint256 price) internal pure returns (uint256) {
        return FullMath.mulDiv(baseAmount, price, 1e18);
    }
}
