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

    /**
     * @notice Params for creating a market
     * @param startTime The start time of the market
     * @param endTime The end time of the market
     * @param startingSqrtPriceX96 The starting price of the market
     * @param baseAssetMinPriceTick The minimum price tick of the base asset
     * @param baseAssetMaxPriceTick The maximum price tick of the base asset
     * @param salt The salt for the market
     * @param claimStatementYesOrNumeric The claim statement for the yes or numeric case
     * @param claimStatementNo The claim statement for the no case
     * @dev claimStatementNo should be empty if market is for a numeric claim. If is a yes/no market the claim is selected based on the settlement price:
     * if the price is 0, the claim is No and the claimStatementNo is the statement for the no case.
     * if the price is 1, the claim is Yes and the claimStatementYesOrNumeric is the statement for the yes case.
     */
    struct MarketCreationParams {
        uint256 startTime;
        uint256 endTime;
        uint160 startingSqrtPriceX96;
        int24 baseAssetMinPriceTick;
        int24 baseAssetMaxPriceTick;
        uint256 salt;
        bytes claimStatementYesOrNumeric;
        bytes claimStatementNo;
    }

    /**
     * @notice Params for submitting a settlement price
     * @param marketId The market ID
     * @param asserter The address of the asserter
     * @param settlementSqrtPriceX96 The settlement price
     * @dev Notice, if we are on a bridged configuration, asserter is the address of the user that deposited the bond on the other side of the bridge (UMA Side)
     * and will be the one receiving the bond back from the other side of the bridge (UMA Side) when the assertion is resolved
     */
    struct SettlementPriceParams {
        uint256 marketId;
        address asserter;
        uint160 settlementSqrtPriceX96;
    }
}
