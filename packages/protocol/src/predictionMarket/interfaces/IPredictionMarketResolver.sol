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
        MARKET_NOT_SETTLED
    }

    function validatePredictionMarkets(
        bytes calldata encodedPredictedOutcomes
    ) external view returns (bool isValid, Error error);

    function resolvePrediction(
        bytes calldata encodedPredictedOutcomes
    ) external view returns (bool isValid, Error error, bool makerWon);
}
