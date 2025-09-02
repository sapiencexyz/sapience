// SPDX-License-Identifier: MIT
pragma solidity ^0.8.19;

import "./IParlayStructs.sol";

/**
 * @title IParlayPoolResolver
 */
interface IParlayPoolResolver {
    enum Error {
        NO_ERROR,
        INVALID_MARKET_GROUP,
        INVALID_MARKET,
        MARKET_SETTLED,
        MARKET_NOT_SETTLED
    }

    function validateParlayMarkets(
        IParlayStructs.PredictedOutcome[] calldata predictedOutcomes
    ) external view returns (bool isValid, Error error);

    function resolveParlay(
        IParlayStructs.PredictedOutcome[] calldata predictedOutcomes
    ) external view returns (bool isValid, Error error, bool makerWon);
}
