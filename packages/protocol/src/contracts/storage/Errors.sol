// SPDX-License-Identifier: GPL-3.0

pragma solidity >=0.8.2 <0.9.0;

library Errors {
    error OnlyOwner();
    error InvalidCaller();
    error MarketNotInitialized();
    error InvalidData(string message);
    error MarketAlreadyCreated();
    error PositionAlreadyCreated();
    error InvalidPositionId(uint256 positionId);
    error NoEpochsCreated();
    error InvalidEpoch();
    error InvalidMarket();
    error EpochAlreadySettled(uint256 epochId);
    error EpochNotOver(uint256 epochId);
    error EpochNotStarted(uint256 epochId);
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
        uint256 collateralRequired,
        uint256 maxCollateral
    );
    error IndexOverrun(uint256 requestedIndex, uint256 length);
    error NotAccountOwnerOrAuthorized(uint256 tokenId, address sender);
    error InsufficientVEth(uint256 amount, uint256 vEth);
    error InsufficientVGas(uint256 amount, uint256 vGas);
    error InvalidPositionKind();
    error InvalidRange(int24 requestedTick, int24 boundedTick);
    error PositionAlreadySettled(uint256 positionId);
    error InvalidBaseAssetMinPriceTick(int24 minPriceTick, int24 tickSpacing);
    error InvalidBaseAssetMaxPriceTick(int24 maxPriceTick, int24 tickSpacing);
    error InvalidPriceTickRange(int24 minPriceTick, int24 maxPriceTick);
    error InvalidTickSpacing(uint24 feeRate);
    error OwnableUnauthorizedAccount(address sender);
    error OnlyInitializer(address sender, address initializer);
    error startTimeTooEarly(uint256 startTime, uint256 blockTime);
    error endTimeTooEarly(uint256 startTime, uint256 endTime);
}
