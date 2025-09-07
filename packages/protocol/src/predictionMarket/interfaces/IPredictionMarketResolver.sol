// SPDX-License-Identifier: MIT
pragma solidity ^0.8.19;

import "./IPredictionStructs.sol";

/**
 * @title IPredictionMarketResolver
 */
interface IPredictionMarketResolver {
    enum Error {
        NO_ERROR,
        INVALID_MARKET_GROUP,
        INVALID_MARKET,
        MARKET_SETTLED,
        MARKET_NOT_SETTLED
    }

    function validatePredictionMarkets(
        bytes calldata encodedPredictedOutcomes
    ) external view returns (bool isValid, Error error);

    function resolvePrediction(
        bytes calldata encodedPredictedOutcomes
    ) external view returns (bool isValid, Error error, bool makerWon);
}
