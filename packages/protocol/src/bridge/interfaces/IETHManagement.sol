// SPDX-License-Identifier: MIT
pragma solidity ^0.8.22;

/**
 * @title IETHManagement
 * @notice Interface for ETH management functionality in LayerZero bridges
 */
interface IETHManagement {
    // Custom errors
    error ETHTransferFailed(address recipient, uint256 amount);

    // Events
    event ETHDeposited(address indexed depositor, uint256 amount);
    event ETHWithdrawn(address indexed recipient, uint256 amount);

    // Functions
    function depositETH() external payable;
    function withdrawETH(uint256 amount) external;
    function getETHBalance() external view returns (uint256);
} 