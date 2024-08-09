// SPDX-License-Identifier: GPL-3.0

pragma solidity >=0.8.2 <0.9.0;

library Errors {
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
    error EpochAlreadyStarted();
    error TokensAlreadyCreated();
    error InsufficientCollateral(uint256 amount, uint256 collateral);
    error IndexOverrun(uint256 requestedIndex, uint256 length);
    // error InvalidAmount(uint256 amount);
    // error InvalidStartTime(uint256 time);
    // error InvalidEndTime(uint256 time);
    // error OverlappingEpochs(uint256 startTime);
    // error InvalidPool(address pool);
    // error InvalidVirtualToken(address token);
    // error PoolAlreadyCreated();
    // error NotAccountOwnerOrAuthorized(uint256 tokenId, address sender);
    // error NotEnoughCredit(uint256 amount, uint256 credit);
}
