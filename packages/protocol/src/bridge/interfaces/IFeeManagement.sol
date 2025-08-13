// SPDX-License-Identifier: MIT
pragma solidity ^0.8.22;

/**
 * @title IFeeManagement
 * @notice Interface for fee and gas management functionality in LayerZero bridges
 */
interface IFeeManagement {
    // Events
    event GasReserveLow(uint256 currentBalance);
    event GasReserveCritical(uint256 currentBalance);
    event LzReceiveCostUpdated(uint128 lzReceiveCost);
    event GasThresholdsUpdated(
        uint256 warningGasThreshold,
        uint256 criticalGasThreshold
    );

    // Functions
    function setLzReceiveCost(uint128 _lzReceiveCost) external;
    function setGasThresholds(
        uint256 _warningGasThreshold,
        uint256 _criticalGasThreshold
    ) external;
    function getLzReceiveCost() external view returns (uint128);
    function getGasThresholds() external view returns (uint256, uint256);
} 