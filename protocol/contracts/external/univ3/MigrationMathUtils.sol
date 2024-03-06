// SPDX-License-Identifier: GPL-3.0

pragma solidity >=0.8.2 <0.9.0;

library MigrationMathUtils {
    error OverflowUint256ToInt256();
    error OverflowInt256ToUint256();
    error OverflowInt24ToUint256();

    function toInt(uint256 x) internal pure returns (int256) {
        if (x > uint256(type(int256).max)) {
            revert OverflowUint256ToInt256();
        }

        return int256(x);
    }

    function toUint(int256 x) internal pure returns (uint256) {
        if (x < 0) {
            revert OverflowInt256ToUint256();
        }

        return uint256(x);
    }

    function toUint256(int24 x) internal pure returns (uint256) {
        if (x < 0) {
            revert OverflowInt24ToUint256();
        }
        return uint256(uint24(x));
    }

    function abs(int256 x) internal pure returns (uint256 z) {
        assembly {
            /// shr(255, x):
            /// shifts the number x to the right by 255 bits:
            /// IF the number is negative, the leftmost bit (bit 255) will be 1
            /// IF the number is positive,the leftmost bit (bit 255) will be 0

            /// sub(0, shr(255, x)):
            /// creates a mask of all 1s if x is negative
            /// creates a mask of all 0s if x is positive
            let mask := sub(0, shr(255, x))

            /// If x is negative, this effectively negates the number
            /// if x is positive, it leaves the number unchanged, thereby computing the absolute value
            z := xor(mask, add(mask, x))
        }
    }
}
