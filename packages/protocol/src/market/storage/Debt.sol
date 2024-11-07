// SPDX-License-Identifier: MIT
pragma solidity >=0.8.2 <0.9.0;

library Debt {
    struct Data {
        uint256 tokenAmount0;
        uint256 tokenAmount1;
        uint128 liquidity;
    }
}
