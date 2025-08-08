// SPDX-License-Identifier: MIT
pragma solidity >=0.8.25 <0.9.0;

import "@openzeppelin/contracts/utils/math/Math.sol";
import {SafeCastU256} from "@synthetixio/core-contracts/contracts/utils/SafeCast.sol";

library DecimalMath {
    using Math for uint256;
    using SafeCastU256 for uint256;

    uint256 constant UNIT = 10 ** 18;

    // UINT256
    function mulDecimal(uint256 a, uint256 b) internal pure returns (uint256) {
        return Math.mulDiv(a, b, UNIT);
    }

    function divDecimal(uint256 a, uint256 b) internal pure returns (uint256) {
        return Math.mulDiv(a, UNIT, b);
    }

    function mulDecimalRoundUp(uint256 a, uint256 b) internal pure returns (uint256) {
        return Math.mulDiv(a, b, UNIT, Math.Rounding.Ceil);
    }

    function divDecimalRoundUp(uint256 a, uint256 b) internal pure returns (uint256) {
        return Math.mulDiv(a, UNIT, b, Math.Rounding.Ceil);
    }

    // INT256
    function mulDecimal(int256 a, int256 b) internal pure returns (int256) {
        return Math.mulDiv(abs(a), abs(b), UNIT).toInt() * productSign(a, b);
    }

    function divDecimal(int256 a, int256 b) internal pure returns (int256) {
        return Math.mulDiv(abs(a), UNIT, abs(b)).toInt() * productSign(a, b);
    }

    function mulDecimalRoundUp(int256 a, int256 b) internal pure returns (int256) {
        return Math.mulDiv(abs(a), abs(b), UNIT, Math.Rounding.Ceil).toInt() * productSign(a, b);
    }

    function divDecimalRoundUp(int256 a, int256 b) internal pure returns (int256) {
        return Math.mulDiv(abs(a), UNIT, abs(b), Math.Rounding.Ceil).toInt() * productSign(a, b);
    }

    // Auxiliary
    function abs(int256 a) internal pure returns (uint256) {
        return a < int256(0) ? uint256(-a) : uint256(a);
    }

    function productSign(int256 a, int256 b) internal pure returns (int256) {
        return (a < 0 || b < 0) && !(a < 0 && b < 0) ? int256(-1) : int256(1);
    }
}
