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
    error IndexOverrun(uint256 requestedIndex, uint256 length);
    error NotAccountOwnerOrAuthorized(uint256 tokenId, address sender);
    error InsufficientVEth(uint256 amount, uint256 vEth);
    error InsufficientVGas(uint256 amount, uint256 vGas);
    error InvalidPositionKind();
    error InvalidRange(int24 requestedTick, int24 boundedTick);
    error PositionAlreadySettled(uint256 positionId);
    error OwnableUnauthorizedAccount(address sender);
}
