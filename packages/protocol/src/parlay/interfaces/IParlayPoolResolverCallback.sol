// SPDX-License-Identifier: MIT
pragma solidity ^0.8.19;

/**
 * @title IParlayPoolResolverCallback
 */
interface IParlayPoolResolverCallback {
    function validateParlayMarketsCallback(uint256 parlayId, bool validMarkets) external;
    function resolveParlayCallback(uint256 parlayId, bool validMarkets, bool makerWon) external;
}
