// SPDX-License-Identifier: MIT
pragma solidity ^0.8.19;

import "../interfaces/IPredictionMarketResolver.sol";
import "../../market/interfaces/ISapience.sol";
import "../../market/interfaces/ISapienceStructs.sol";

/**
 * @title PredictionMarketSapienceResolver
 * @notice SapienceResolver contract for Prediction Market system
 */
contract PredictionMarketSapienceResolver is IPredictionMarketResolver {
    // ============ Custom Errors ============
    error MustHaveAtLeastOneMarket();
    error TooManyMarkets();
    error InvalidMarketGroupAddress();
    error MarketIsNotYesNoMarket();

    struct Settings {
        uint256 maxPredictionMarkets;
    }

    Settings public config;

    constructor(Settings memory _config) {
        config = _config;
    }

    // ============ Sapience Market Resolver Structs ============
    struct MarketIdentifier {
        address marketGroup;
        uint256 marketId;
    }

    struct PredictedOutcome {
        MarketIdentifier market;
        bool prediction; // true for YES, false for NO
    }

    // ============ Resolver Functions ============
    function validatePredictionMarkets(
        bytes calldata encodedPredictedOutcomes
    ) external view returns (bool isValid, Error error) {
        isValid = true;
        error = Error.NO_ERROR;
        PredictedOutcome[] memory predictedOutcomes = decodePredictionOutcomes(
            encodedPredictedOutcomes
        );

        if (predictedOutcomes.length == 0) revert MustHaveAtLeastOneMarket();
        if (predictedOutcomes.length > config.maxPredictionMarkets)
            revert TooManyMarkets();

        for (uint256 i = 0; i < predictedOutcomes.length; i++) {
            if (predictedOutcomes[i].market.marketGroup == address(0)) {
                isValid = false;
                error = Error.INVALID_MARKET;
                break;
            }

            if (!_isYesNoMarket(predictedOutcomes[i].market)) {
                isValid = false;
                error = Error.INVALID_MARKET;
                break;
            }

            (, bool settled) = _getMarketOutcome(predictedOutcomes[i].market);
            if (settled) {
                isValid = false;
                error = Error.MARKET_NOT_OPENED;
                break;
            }
        }
        return (isValid, error);
    }

    function resolvePrediction(
        bytes calldata encodedPredictedOutcomes
    ) external view returns (bool isValid, Error error, bool makerWon) {
        PredictedOutcome[] memory predictedOutcomes = decodePredictionOutcomes(
            encodedPredictedOutcomes
        );
        makerWon = true;
        isValid = true;
        error = Error.NO_ERROR;

        for (uint256 i = 0; i < predictedOutcomes.length; i++) {
            MarketIdentifier memory market = predictedOutcomes[i].market;
            (bool marketOutcome, bool marketSettled) = _getMarketOutcome(
                market
            );
            if (!marketSettled) {
                isValid = false;
                error = Error.MARKET_NOT_SETTLED;
                break;
            }

            if (predictedOutcomes[i].prediction != marketOutcome) {
                makerWon = false;
                break;
            }
        }

        return (isValid, error, makerWon);
    }

    // ============ Sapience Encoding and Decoding Functions ============
    function encodePredictionOutcomes(
        PredictedOutcome[] calldata predictedOutcomes
    ) external pure returns (bytes memory) {
        return abi.encode(predictedOutcomes);
    }

    function decodePredictionOutcomes(
        bytes calldata encodedPredictedOutcomes
    ) public pure returns (PredictedOutcome[] memory) {
        return abi.decode(encodedPredictedOutcomes, (PredictedOutcome[]));
    }

    // ============ Sapience Market Validation Functions ============
    function _isYesNoMarket(
        MarketIdentifier memory market
    ) internal view returns (bool) {
        // Validate market address
        if (market.marketGroup == address(0))
            revert InvalidMarketGroupAddress();

        // Get the specific market data from the Sapience market group
        (ISapienceStructs.MarketData memory marketData, ) = ISapience(
            market.marketGroup
        ).getMarket(market.marketId);

        // Check if this is a Yes/No market by examining the claimStatementNo
        // If claimStatementNo is not empty, it's a Yes/No market
        // If claimStatementNo is empty, it's a numeric market
        return marketData.claimStatementNo.length > 0;
    }

    /**
     * @notice Internal function to get the outcome and settlement status of a market
     * @dev it needs to go to the market address as a Sapience market group and check if the market is settled
     * and then get the outcome of the market. The market should be a Yes/No Sapience market.
     * @param market The market to check
     * @return outcome The outcome of the market (true = YES, false = NO)
     * @return settled Whether the market has been settled
     */
    function _getMarketOutcome(
        MarketIdentifier memory market
    ) internal view returns (bool outcome, bool settled) {
        // Validate market address
        if (market.marketGroup == address(0))
            revert InvalidMarketGroupAddress();

        // Check if this is a Yes/No market first
        if (!_isYesNoMarket(market)) revert MarketIsNotYesNoMarket();

        // Get the specific market data from the Sapience market group
        (ISapienceStructs.MarketData memory marketData, ) = ISapience(
            market.marketGroup
        ).getMarket(market.marketId);

        // Check if the market is settled
        settled = marketData.settled;

        if (!settled) {
            return (false, false);
        }

        // For Yes/No markets, the settlement price will be at the extreme bounds
        // Due to price clamping in Sapience markets:
        // - YES settlements (prices > max) get clamped to maxPriceD18
        // - NO settlements (prices < min) get clamped to minPriceD18
        uint256 settlementPrice = marketData.settlementPriceD18;
        uint256 minPrice = marketData.minPriceD18;
        uint256 maxPrice = marketData.maxPriceD18;

        // Check if this is a Yes/No market by comparing settlement price to bounds
        // For Yes/No markets, the settlement price should be at one of the extreme bounds
        // We use the midpoint between min and max to determine the outcome
        uint256 midpoint = (minPrice + maxPrice) / 2;

        if (settlementPrice >= midpoint) {
            // Market settled as YES (price is closer to max than min)
            outcome = true;
        } else {
            // Market settled as NO (price is closer to min than max)
            outcome = false;
        }
    }
}
