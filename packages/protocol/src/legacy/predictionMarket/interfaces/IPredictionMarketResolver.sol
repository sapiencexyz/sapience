// SPDX-License-Identifier: MIT
pragma solidity ^0.8.19;

/**
 * @title IPredictionMarketResolver
 */
interface IPredictionMarketResolver {
    enum Error {
        NO_ERROR,
        INVALID_MARKET,
        MARKET_NOT_OPENED,
        MARKET_NOT_SETTLED,
        TOO_MANY_MARKETS,
        MUST_HAVE_AT_LEAST_ONE_MARKET
    }

    function validatePredictionMarkets(
        bytes calldata encodedPredictedOutcomes
    ) external view returns (bool isValid, Error error);

    function getPredictionResolution(
        bytes calldata encodedPredictedOutcomes
    ) external view returns (bool isResolved, Error error, bool parlaySuccess);
}
