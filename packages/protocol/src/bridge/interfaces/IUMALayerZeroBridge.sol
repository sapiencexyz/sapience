// SPDX-License-Identifier: MIT
pragma solidity ^0.8.22;

import {ILayerZeroBridge} from "./ILayerZeroBridge.sol";
import {IBondManagement} from "./IBondManagement.sol";

/**
 * @title IUMALayerZeroBridge
 * @notice Interface for UMA-side LayerZero bridge
 */
interface IUMALayerZeroBridge is ILayerZeroBridge, IBondManagement {
    // Events
    event OptimisticOracleV3Updated(address indexed optimisticOracleV3);

    // UMA-side specific functions
    function assertionResolvedCallback(
        bytes32 assertionId,
        bool assertedTruthfully
    ) external;
    function assertionDisputedCallback(bytes32 assertionId) external;

    // Optimistic Oracle V3
    function setOptimisticOracleV3(address _optimisticOracleV3) external;
    function getOptimisticOracleV3() external view returns (address);
} 