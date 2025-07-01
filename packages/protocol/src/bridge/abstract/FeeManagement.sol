// SPDX-License-Identifier: MIT
pragma solidity ^0.8.22;

import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";
import {IFeeManagement} from "../interfaces/ILayerZeroBridge.sol";

/**
 * @title FeeManagement
 * @notice Abstract contract for gas threshold and execution gas management
 * @dev This contract provides common functionality for:
 * - Setting and getting gas thresholds (warning and critical)
 * - Setting and getting max execution gas
 * - Checking gas thresholds and revert if necessary
 */
abstract contract FeeManagement is Ownable, IFeeManagement { //TODO feeManagement?
    // Gas monitoring and execution gas
    uint256 private WARNING_GAS_THRESHOLD = 0.1 ether;
    uint256 private CRITICAL_GAS_THRESHOLD = 0.05 ether;
    uint128 private lzReceiveCost;

    /**
     * @notice Constructor for FeeManagement
     * @param _owner The owner of the contract
     */
    constructor(address _owner) Ownable(_owner) {}

    /**
     * @notice Set the LayerZero receive cost for operations
     * @param _lzReceiveCost The cost for LayerZero receive operations
     */
    function setLzReceiveCost(uint128 _lzReceiveCost) external onlyOwner {
        lzReceiveCost = _lzReceiveCost;
    }

    /**
     * @notice Get the LayerZero receive cost
     * @return The LayerZero receive cost value
     */
    function getLzReceiveCost() external view returns (uint128) {
        return lzReceiveCost;
    }

    /**
     * @notice Set gas thresholds for monitoring
     * @param _warningGasThreshold The threshold for warning alerts
     * @param _criticalGasThreshold The threshold for critical alerts
     */
    function setGasThresholds(uint256 _warningGasThreshold, uint256 _criticalGasThreshold) external onlyOwner {
        require(_warningGasThreshold > _criticalGasThreshold, "Warning threshold must be greater than critical");
        WARNING_GAS_THRESHOLD = _warningGasThreshold;
        CRITICAL_GAS_THRESHOLD = _criticalGasThreshold;
    }

    /**
     * @notice Get the current gas thresholds
     * @return warningThreshold The warning gas threshold
     * @return criticalThreshold The critical gas threshold
     */
    function getGasThresholds() external view returns (uint256, uint256) {
        return (WARNING_GAS_THRESHOLD, CRITICAL_GAS_THRESHOLD);
    }

    /**
     * @notice Check gas thresholds and emit alerts if necessary
     * @param currentBalance The current ETH balance to check against thresholds
     */
    function _checkGasThresholds(uint256 currentBalance) internal {
        if (currentBalance <= CRITICAL_GAS_THRESHOLD) {
            emit GasReserveCritical(currentBalance);
        } else if (currentBalance <= WARNING_GAS_THRESHOLD) {
            emit GasReserveLow(currentBalance);
        }
    }

    /**
     * @notice Get the LayerZero receive cost (internal)
     * @return The LayerZero receive cost
     */
    function _getLzReceiveCost() internal view returns (uint128) {
        return lzReceiveCost;
    }
} 