// SPDX-License-Identifier: MIT
pragma solidity ^0.8.22;

import {FeeManagement} from "./FeeManagement.sol";
import {IETHManagement} from "../interfaces/IETHManagement.sol";

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
abstract contract ETHManagement is FeeManagement, IETHManagement {
    /**
     * @notice Constructor for ETHManagement
     * @param _owner The owner of the contract
     */
    constructor(address _owner) FeeManagement(_owner) {}

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
        if (amount > address(this).balance) {
            revert InsufficientETHBalance(amount, address(this).balance);
        }

        (bool success, ) = payable(owner()).call{value: amount}("");
        if (!success) {
            revert ETHTransferFailed(owner(), amount);
        }

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
    receive() external payable virtual {
        // do nothing. Just accept ETH.
    }

    /**
     * @notice Require that the contract has sufficient ETH for a given fee
     * @param requiredFee The fee amount to check against
     */
    function _requireSufficientETH(uint256 requiredFee) internal view {
        if (address(this).balance < requiredFee) {
            revert InsufficientETHBalance(requiredFee, address(this).balance);
        }
    }

    /**
     * @notice Check gas thresholds using current balance
     */
    function _checkGasThresholds() internal {
        _checkGasThresholds(address(this).balance);
    }
}
