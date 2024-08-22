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
    // error InvalidAmount(uint256 amount);
    // error InvalidStartTime(uint256 time);
    // error InvalidEndTime(uint256 time);
    // error OverlappingEpochs(uint256 startTime);
    // error InvalidPool(address pool);
    // error InvalidVirtualToken(address token);
    // error PoolAlreadyCreated();
    // error NotEnoughCredit(uint256 amount, uint256 credit);
}
