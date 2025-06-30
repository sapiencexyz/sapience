// SPDX-License-Identifier: MIT
pragma solidity ^0.8.22;

import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";
import {IGasManagement} from "../interfaces/ILayerZeroBridge.sol";

/**
 * @title GasManagement
 * @notice Abstract contract for gas threshold and execution gas management
 * @dev This contract provides common functionality for:
 * - Setting and getting gas thresholds (warning and critical)
 * - Setting and getting max execution gas
 * - Checking gas thresholds and revert if necessary
 */
abstract contract GasManagement is Ownable, IGasManagement {
    // Gas monitoring and execution gas
    uint256 private WARNING_GAS_THRESHOLD = 0.1 ether;
    uint256 private CRITICAL_GAS_THRESHOLD = 0.05 ether;
    uint128 private maxExecutionGas;

    /**
     * @notice Constructor for GasManagement
     * @param _owner The owner of the contract
     */
    constructor(address _owner) Ownable(_owner) {}

    /**
     * @notice Set the maximum execution gas for LayerZero operations
     * @param _maxExecutionGas The maximum gas to use for execution
     */
    function setMaxExecutionGas(uint128 _maxExecutionGas) external onlyOwner {
        maxExecutionGas = _maxExecutionGas;
    }

    /**
     * @notice Get the maximum execution gas
     * @return The maximum execution gas value
     */
    function getMaxExecutionGas() external view returns (uint128) {
        return maxExecutionGas;
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
     * @notice Get the max execution gas (internal)
     * @return The max execution gas
     */
    function _getMaxExecutionGas() internal view returns (uint128) {
        return maxExecutionGas;
    }
} 