// SPDX-License-Identifier: MIT
pragma solidity ^0.8.19;

import { Ownable } from "@openzeppelin/contracts/access/Ownable.sol";

/// @title LZETHManagement
/// @notice Abstract contract for ETH balance and gas management for LayerZero operations
/// @dev Combines ETH deposits/withdrawals with gas threshold monitoring
abstract contract LZETHManagement is Ownable {
    // ============ Errors ============
    error InsufficientETHBalance(uint256 required, uint256 available);
    error ETHTransferFailed(address recipient, uint256 amount);
    error InvalidThresholdValues(uint256 warning, uint256 critical);

    // ============ Events ============
    event ETHDeposited(address indexed depositor, uint256 amount);
    event ETHWithdrawn(address indexed recipient, uint256 amount);
    event GasReserveLow(uint256 currentBalance);
    event GasReserveCritical(uint256 currentBalance);
    event LzReceiveCostUpdated(uint128 lzReceiveCost);
    event GasThresholdsUpdated(
        uint256 warningThreshold, uint256 criticalThreshold
    );

    // ============ Storage ============
    uint256 private _warningGasThreshold = 0.1 ether;
    uint256 private _criticalGasThreshold = 0.05 ether;
    uint128 private _lzReceiveCost;

    // ============ Constructor ============
    constructor(address _owner) Ownable(_owner) { }

    // ============ ETH Management ============

    /// @notice Deposit ETH to the contract for fee payments
    function depositETH() external payable {
        emit ETHDeposited(msg.sender, msg.value);
    }

    /// @notice Withdraw ETH from the contract
    /// @param amount The amount of ETH to withdraw
    function withdrawETH(uint256 amount) external onlyOwner {
        if (amount > address(this).balance) {
            revert InsufficientETHBalance(amount, address(this).balance);
        }

        (bool success,) = payable(owner()).call{ value: amount }("");
        if (!success) {
            revert ETHTransferFailed(owner(), amount);
        }

        emit ETHWithdrawn(owner(), amount);
        _checkGasThresholds(address(this).balance);
    }

    /// @notice Get the current ETH balance of the contract
    function getETHBalance() external view returns (uint256) {
        return address(this).balance;
    }

    /// @notice Receive function to accept ETH
    receive() external payable virtual { }

    // ============ Gas Management ============

    /// @notice Set the LayerZero receive cost for operations
    /// @param cost The cost for LayerZero receive operations
    function setLzReceiveCost(uint128 cost) external onlyOwner {
        _lzReceiveCost = cost;
        emit LzReceiveCostUpdated(cost);
    }

    /// @notice Get the LayerZero receive cost
    function getLzReceiveCost() external view returns (uint128) {
        return _lzReceiveCost;
    }

    /// @notice Set gas thresholds for monitoring
    /// @param warningThreshold The threshold for warning alerts
    /// @param criticalThreshold The threshold for critical alerts
    function setGasThresholds(
        uint256 warningThreshold,
        uint256 criticalThreshold
    ) external onlyOwner {
        if (warningThreshold <= criticalThreshold) {
            revert InvalidThresholdValues(warningThreshold, criticalThreshold);
        }
        _warningGasThreshold = warningThreshold;
        _criticalGasThreshold = criticalThreshold;
        emit GasThresholdsUpdated(warningThreshold, criticalThreshold);
    }

    /// @notice Get the current gas thresholds
    function getGasThresholds()
        external
        view
        returns (uint256 warning, uint256 critical)
    {
        return (_warningGasThreshold, _criticalGasThreshold);
    }

    // ============ Internal Functions ============

    /// @notice Require that the contract has sufficient ETH for a given fee
    function _requireSufficientETH(uint256 requiredFee) internal view {
        if (address(this).balance < requiredFee) {
            revert InsufficientETHBalance(requiredFee, address(this).balance);
        }
    }

    /// @notice Check gas thresholds and emit alerts if necessary
    function _checkGasThresholds(uint256 currentBalance) internal {
        if (currentBalance <= _criticalGasThreshold) {
            emit GasReserveCritical(currentBalance);
        } else if (currentBalance <= _warningGasThreshold) {
            emit GasReserveLow(currentBalance);
        }
    }

    /// @notice Get the LayerZero receive cost (internal)
    function _getLzReceiveCost() internal view returns (uint128) {
        return _lzReceiveCost;
    }
}
