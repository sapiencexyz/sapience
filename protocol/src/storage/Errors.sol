// SPDX-License-Identifier: GPL-3.0

pragma solidity >=0.8.2 <0.9.0;

library Errors {
    error AccountAlreadyCreated();
    error InvalidAccountId(uint256 accountId);
    error InvalidEpoch();
    error InvalidAmount(uint256 amount);
    error InvalidStartTime(uint256 time);
    error InvalidEndTime(uint256 time);
    error OverlappingEpochs(uint256 startTime);
    error InvalidPool(address pool);
    error InvalidVirtualToken(address token);
    error EpochAlreadySettled(uint256 epochId);
    error EpochNotOver(uint256 epochId);
    error EpochNotStarted(uint256 epochId);
    error EpochAlreadyStarted();
    error TokensAlreadyCreated();
    error PoolAlreadyCreated();
    error NoEpochs();
    error NotAccountOwnerOrAuthorized(uint256 accountId, address sender);
    error NotEnoughCredit(uint256 amount, uint256 credit);
}
