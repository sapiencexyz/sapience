// SPDX-License-Identifier: GPL-3.0

pragma solidity >=0.8.2 <0.9.0;

library CommonErrors {
    error InvalidId(uint256 id);
    error InvalidAmount(uint256 amount);
    error InvalidStartTime(uint256 time);
    error InvalidEndTime(uint256 time);
    error OverlappingEpochs(uint256 startTime);
    error InvalidPool(address pool);
    error InvalidVirtualToken(address token);
}
