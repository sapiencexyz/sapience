// SPDX-License-Identifier: MIT
pragma solidity ^0.8.22;

import {GasManagement} from "./GasManagement.sol";
import {IETHManagement} from "../interfaces/ILayerZeroBridge.sol";

/**
 * @title ETHManagement
 * @notice Abstract contract for ETH balance management
 * @dev This contract provides common functionality for:
 * - Depositing ETH to the contract
 * - Withdrawing ETH from the contract
 * - Getting ETH balance
 * - Receiving ETH via fallback
 * - Gas threshold monitoring
 */
abstract contract ETHManagement is GasManagement, IETHManagement {

    /**
     * @notice Constructor for ETHManagement
     * @param _owner The owner of the contract
     */
    constructor(address _owner) GasManagement(_owner) {}

    /**
     * @notice Deposit ETH to the contract for fee payments
     * @dev Anyone can deposit ETH to help pay for fees
     */
    function depositETH() external payable {
        emit ETHDeposited(msg.sender, msg.value);
    }

    /**
     * @notice Withdraw ETH from the contract
     * @param amount The amount of ETH to withdraw
     */
    function withdrawETH(uint256 amount) external onlyOwner {
        require(amount <= address(this).balance, "Insufficient balance");
        payable(owner()).transfer(amount);
        emit ETHWithdrawn(owner(), amount);
        
        // Check gas thresholds after withdrawal
        _checkGasThresholds(address(this).balance);
    }

    /**
     * @notice Get the current ETH balance of the contract
     * @return The current ETH balance
     */
    function getETHBalance() external view returns (uint256) {
        return address(this).balance;
    }

    /**
     * @notice Receive function to accept ETH
     * @dev This function is called when ETH is sent to the contract
     */
    receive() external virtual payable {
        emit ETHDeposited(msg.sender, msg.value);
    }

    /**
     * @notice Require that the contract has sufficient ETH for a given fee
     * @param requiredFee The fee amount to check against
     */
    function _requireSufficientETH(uint256 requiredFee) internal view {
        require(address(this).balance >= requiredFee, "Insufficient ETH balance for fee");
    }

    /**
     * @notice Check gas thresholds using current balance
     */
    function _checkGasThresholds() internal {
        _checkGasThresholds(address(this).balance);
    }
} 