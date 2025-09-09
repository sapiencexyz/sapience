// SPDX-License-Identifier: MIT
pragma solidity ^0.8.19;

import "../../src/market/interfaces/ISapienceStructs.sol";

contract MockSapience {
    mapping(uint256 => ISapienceStructs.MarketData) private marketData;
    mapping(uint256 => ISapienceStructs.MarketParams) private marketParams;

    function setMarketData(
        uint256 marketId,
        bool settled,
        bool outcome,
        uint256 minPrice,
        uint256 maxPrice
    ) external {
        marketData[marketId] = ISapienceStructs.MarketData({
            marketId: marketId,
            startTime: block.timestamp,
            endTime: block.timestamp + 1 days,
            pool: address(this),
            quoteToken: address(0),
            baseToken: address(0),
            minPriceD18: minPrice,
            maxPriceD18: maxPrice,
            baseAssetMinPriceTick: 0,
            baseAssetMaxPriceTick: 0,
            settled: settled,
            settlementPriceD18: outcome ? maxPrice : minPrice,
            assertionId: bytes32(0),
            claimStatementYesOrNumeric: "YES",
            claimStatementNo: "NO"
        });

        marketParams[marketId] = ISapienceStructs.MarketParams({
            feeRate: 0,
            assertionLiveness: 0,
            bondAmount: 0,
            bondCurrency: address(0),
            uniswapPositionManager: address(0),
            uniswapSwapRouter: address(0),
            uniswapQuoter: address(0),
            optimisticOracleV3: address(0)
        });
    }

    function setNumericMarketData(
        uint256 marketId,
        bool settled,
        uint256 settlementPrice,
        uint256 minPrice,
        uint256 maxPrice
    ) external {
        marketData[marketId] = ISapienceStructs.MarketData({
            marketId: marketId,
            startTime: block.timestamp,
            endTime: block.timestamp + 1 days,
            pool: address(this),
            quoteToken: address(0),
            baseToken: address(0),
            minPriceD18: minPrice,
            maxPriceD18: maxPrice,
            baseAssetMinPriceTick: 0,
            baseAssetMaxPriceTick: 0,
            settled: settled,
            settlementPriceD18: settlementPrice,
            assertionId: bytes32(0),
            claimStatementYesOrNumeric: "Price will be",
            claimStatementNo: "" // Empty = numeric market
        });

        marketParams[marketId] = ISapienceStructs.MarketParams({
            feeRate: 0,
            assertionLiveness: 0,
            bondAmount: 0,
            bondCurrency: address(0),
            uniswapPositionManager: address(0),
            uniswapSwapRouter: address(0),
            uniswapQuoter: address(0),
            optimisticOracleV3: address(0)
        });
    }

    function getMarket(
        uint256 marketId
    )
        external
        view
        returns (
            ISapienceStructs.MarketData memory,
            ISapienceStructs.MarketParams memory
        )
    {
        return (marketData[marketId], marketParams[marketId]);
    }
}
