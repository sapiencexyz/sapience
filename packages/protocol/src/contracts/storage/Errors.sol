// SPDX-License-Identifier: GPL-3.0

pragma solidity >=0.8.2 <0.9.0;

library Errors {
    error OnlyOwner();
    error MarketNotInitialized();
    error InvalidData(string message);
    error MarketAlreadyCreated();
    error PositionAlreadyCreated();
    error InvalidPositionId(uint256 positionId);
    error NoEpochsCreated();
    error InvalidEpoch();
    error InvalidMarket();
    error EpochNotSettled(uint256 epochId);
    error EpochAlreadyStarted();
    error EpochSettled();
    error ExpiredEpoch();
    error TokensAlreadyCreated();
    error InsufficientCollateral(
        uint256 amountRequired,
        uint256 collateralAvailable
    );
    error CollateralLimitReached(
        int256 collateralRequired,
        int256 maxCollateral
    );
    error IndexOverrun(uint256 requestedIndex, uint256 length);
    error NotAccountOwnerOrAuthorized(uint256 tokenId, address sender);
    error InvalidPositionKind();
    error InvalidRange(int24 requestedTick, int24 boundedTick);
    error PositionAlreadySettled(uint256 positionId);
    error InvalidBaseAssetMinPriceTick(int24 minPriceTick, int24 tickSpacing);
    error InvalidBaseAssetMaxPriceTick(int24 maxPriceTick, int24 tickSpacing);
    error InvalidPriceTickRange(int24 minPriceTick, int24 maxPriceTick);
    error InvalidTickSpacing(uint24 feeRate);
    error InvalidTradeSize(uint256 tradeSize);
    error OwnableUnauthorizedAccount(address sender);
    error OnlyInitializer(address sender, address initializer);
    error StartTimeTooEarly(uint256 startTime, uint256 blockTime);
    error EndTimeTooEarly(uint256 startTime, uint256 endTime);
    error PoolPriceOutOfRange(
        uint160 poolPrice,
        uint160 minPrice,
        uint160 maxPrice
    );
    error TransactionExpired(uint256 deadline, uint256 blockTime);
}
