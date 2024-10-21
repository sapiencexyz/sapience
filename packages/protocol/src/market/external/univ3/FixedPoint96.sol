// SPDX-License-Identifier: GPL-2.0-or-later
pragma solidity >=0.8.2 <0.9.0;

/// @notice based on Uniswap V3's TickMath library, but migrated to use Solidity 0.8.2 onwards

/// @title FixedPoint96
/// @notice A library for handling binary fixed point numbers, see https://en.wikipedia.org/wiki/Q_(number_format)
/// @dev Used in SqrtPriceMath.sol
library FixedPoint96 {
    uint8 internal constant RESOLUTION = 96;
    uint256 internal constant Q96 = 0x1000000000000000000000000;
}
