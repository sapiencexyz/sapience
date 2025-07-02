// SPDX-License-Identifier: MIT
pragma solidity >=0.8.2 <0.9.0;

interface ISapienceStructs {
    enum PositionKind {
        Unknown,
        Liquidity,
        Trade
    }

    struct LiquidityMintParams {
        uint256 marketId;
        uint256 amountBaseToken;
        uint256 amountQuoteToken;
        uint256 collateralAmount;
        int24 lowerTick;
        int24 upperTick;
        uint256 minAmountBaseToken;
        uint256 minAmountQuoteToken;
        uint256 deadline;
    }

    struct LiquidityDecreaseParams {
        uint256 positionId;
        uint128 liquidity;
        uint256 minBaseAmount;
        uint256 minQuoteAmount;
        uint256 deadline;
    }

    struct LiquidityCloseParams {
        uint256 positionId;
        uint256 liquiditySlippage; // slippage for closing the liquidity position D18 100% = 1e18
        uint256 tradeSlippage; // slippage for closing the trade position D18 100% = 1e18
        uint256 deadline;
    }

    struct LiquidityIncreaseParams {
        uint256 positionId;
        uint256 collateralAmount;
        uint256 baseTokenAmount;
        uint256 quoteTokenAmount;
        uint256 minBaseAmount;
        uint256 minQuoteAmount;
        uint256 deadline;
    }

    struct MarketParams {
        uint24 feeRate;
        uint64 assertionLiveness;
        uint256 bondAmount;
        address bondCurrency;
        address uniswapPositionManager;
        address uniswapSwapRouter;
        address uniswapQuoter;
        address optimisticOracleV3;
    }

    struct MarketData {
        uint256 marketId;
        uint256 startTime;
        uint256 endTime;
        address pool;
        address quoteToken;
        address baseToken;
        uint256 minPriceD18;
        uint256 maxPriceD18;
        int24 baseAssetMinPriceTick;
        int24 baseAssetMaxPriceTick;
        bool settled;
        uint256 settlementPriceD18;
        bytes32 assertionId;
        bytes claimStatementYesOrNumeric;
        bytes claimStatementNo;
    }

    struct TraderPositionCreateParams {
        uint256 marketId;
        int256 size;
        uint256 maxCollateral;
        uint256 deadline;
    }

    struct TraderPositionModifyParams {
        uint256 positionId;
        int256 size;
        int256 deltaCollateralLimit;
        uint256 deadline;
    }

    struct MarketCreationParams {
        uint256 startTime;
        uint256 endTime;
        uint160 startingSqrtPriceX96;
        int24 baseAssetMinPriceTick;
        int24 baseAssetMaxPriceTick;
        uint256 salt;
        bytes claimStatement;
    }

    struct SettlementPriceParams {
        uint256 marketId;
        address asserter;
        uint160 settlementSqrtPriceX96;
    }
}
