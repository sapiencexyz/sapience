// SPDX-License-Identifier: MIT
pragma solidity ^0.8.19;

import "../interfaces/IParlayPoolResolver.sol";
import "../interfaces/IParlayPoolResolverCallback.sol";
import "../interfaces/IParlayStructs.sol";
import "../../market/interfaces/ISapience.sol";
import "../../market/interfaces/ISapienceStructs.sol";

/**
 * @title ParlayNFT
 * @notice NFT contract for Parlay Pool system
 */
contract ParlayPoolSapienceResolver is IParlayPoolResolver {
    address parlayPool;
    constructor(address _parlayPool) {
        parlayPool = _parlayPool;
    }

    function validateParlayMarkets(
        IParlayStructs.PredictedOutcome[] calldata predictedOutcomes,
        bool syncCall,
        uint256 requestId
    ) external returns (bool syncCallSucceded) {
        syncCallSucceded = true;
        // uint256 error;
        for (uint256 i = 0; i < predictedOutcomes.length; i++) {
            require(
                predictedOutcomes[i].market.marketGroup != address(0),
                "Invalid market group address"
            );

            // Check that the market is a Yes/No market
            require(
                _isYesNoMarket(predictedOutcomes[i].market),
                "Market is not a Yes/No market"
            );

            // Check that the market is not settled
            (, bool settled) = _getMarketOutcome(predictedOutcomes[i].market);
            require(!settled, "Market is already settled");
        }

        if (syncCall) {
            return syncCallSucceded;
        }
        IParlayPoolResolverCallback(parlayPool).validateParlayMarketsCallback(
            requestId,
            syncCallSucceded
        );
    }

    function resolveParlay(
        IParlayStructs.PredictedOutcome[] calldata predictedOutcomes,
        bool syncCall,
        uint256 parlayId
    ) external returns (bool syncCallSucceded, bool makerWon) {
        makerWon = true;
        syncCallSucceded = true;

        for (uint256 i = 0; i < predictedOutcomes.length; i++) {
            IParlayStructs.Market memory market = predictedOutcomes[i].market;
            (bool marketOutcome, bool marketSettled) = _getMarketOutcome(
                market
            );
            if (!marketSettled) {
                if(!syncCall) {
                    revert("At least one market not settled");
                }
                syncCallSucceded = false;
                break;
            }

            if (predictedOutcomes[i].prediction != marketOutcome) {
                makerWon = false;
                break;
            }
        }

        IParlayPoolResolverCallback(parlayPool).resolveParlayCallback(
            parlayId,
            syncCallSucceded,
            makerWon
        );

        return (syncCallSucceded, makerWon);
    }

    function _isYesNoMarket(
        IParlayStructs.Market memory market
    ) internal view returns (bool) {
        // Validate market address
        require(
            market.marketGroup != address(0),
            "Invalid market group address"
        );

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
        IParlayStructs.Market memory market
    ) internal view returns (bool outcome, bool settled) {
        // Validate market address
        require(
            market.marketGroup != address(0),
            "Invalid market group address"
        );

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
        // YES = maxPriceD18, NO = minPriceD18
        uint256 settlementPrice = marketData.settlementPriceD18;
        uint256 minPrice = marketData.minPriceD18;
        uint256 maxPrice = marketData.maxPriceD18;

        // Check if this is a Yes/No market by comparing settlement price to bounds
        if (settlementPrice >= maxPrice) {
            // Market settled as YES
            outcome = true;
        } else if (settlementPrice <= minPrice) {
            // Market settled as NO
            outcome = false;
        } else {
            // This is a numeric market, not Yes/No
            // For parlay purposes, we only support Yes/No markets
            revert(
                "Market is not a Yes/No market - settlement price is not at bounds"
            );
        }
    }
}
