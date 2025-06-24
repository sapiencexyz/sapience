// SPDX-License-Identifier: MIT
pragma solidity >=0.8.2 <0.9.0;

library Errors {
    error OnlyOwner();
    error MarketNotInitialized();
    error InvalidData(string message);
    error MarketGroupAlreadyCreated();
    error PositionAlreadyCreated();
    error InvalidPositionId(uint256 positionId);
    error NoMarketsCreated();
    error InvalidMarket();
    error InvalidMarketGroup();
    error MarketNotSettled(uint256 marketId);
    error ExpiredMarketNotSettled(uint256 marketEndTime);
    error MarketAlreadyStarted();
    error MarketSettled();
    error ExpiredMarket();
    error TokensAlreadyCreated();
    error InsufficientCollateral(
        uint256 amountRequired,
        uint256 collateralAvailable
    );
    error CollateralLimitReached(
        int256 collateralRequired,
        int256 maxCollateral
    );
    error CollateralBelowMin(uint256 collateralRequired, uint256 minCollateral);
    error NotAccountOwner(uint256 tokenId, address sender);
    error InvalidPositionKind();
    error InvalidRange(int24 requestedTick, int24 boundedTick);
    error PositionAlreadySettled(uint256 positionId);
    error InvalidBaseAssetMinPriceTick(int24 minPriceTick, int24 tickSpacing);
    error InvalidBaseAssetMaxPriceTick(int24 maxPriceTick, int24 tickSpacing);
    error InvalidPriceTickRange(int24 minPriceTick, int24 maxPriceTick);
    error InvalidTickSpacing(uint24 feeRate);
    error InvalidInternalTradeSize(uint256 tradeSize);
    error DeltaTradeIsZero();
    error PositionSizeBelowMin();
    error InvalidFeeRate(uint24 feeRate);
    error OwnableUnauthorizedAccount(address sender);
    error OnlyInitializer(address sender, address initializer);
    error StartTimeCannotBeZero();
    error EndTimeTooEarly(uint256 startTime, uint256 endTime);
    error PoolPriceOutOfRange(
        uint160 poolPrice,
        uint160 minPrice,
        uint160 maxPrice
    );
    error TransactionExpired(uint256 deadline, uint256 blockTime);
    error OnlyFeeCollector();
    error InvalidTransferRecipient(address recipient);
    error TradePriceOutOfBounds(
        uint256 tradeRatioD18,
        uint256 minTradeRatioD18,
        uint256 maxTradeRatioD18
    );
    error InvalidStartingPrice(
        uint160 startingSqrtPriceX96,
        uint160 minSqrtPriceX96,
        uint160 maxSqrtPriceX96
    );
    error InvalidBondAmount(uint256 bondAmount, uint256 minBond);
    error ManualSettlementTooEarly(uint256 requiredDelay);
    error InvalidSlippage(uint256 liquiditySlippage, uint256 tradeSlippage);
}
