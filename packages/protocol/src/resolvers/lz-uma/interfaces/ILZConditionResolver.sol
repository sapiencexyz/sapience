// SPDX-License-Identifier: MIT
pragma solidity ^0.8.19;

import { IConditionResolver } from "../../../interfaces/IConditionResolver.sol";
import { LZTypes } from "../../shared/LZTypes.sol";

/// @title ILZConditionResolver
/// @notice Interface for LayerZero-based Condition Resolver (PM side)
/// @dev This resolver receives resolution messages from UMA side via LayerZero
interface ILZConditionResolver is IConditionResolver {
    // ============ Events ============
    event ConditionResolutionDetail(
        bytes32 indexed conditionId,
        bool resolvedToYes,
        bool assertedTruthfully,
        uint256 resolutionTime
    );

    event BridgeConfigUpdated(LZTypes.BridgeConfig config);

    // ============ Functions ============
    function setBridgeConfig(LZTypes.BridgeConfig calldata config) external;
    function getBridgeConfig()
        external
        view
        returns (LZTypes.BridgeConfig memory);
    function getCondition(bytes32 conditionId)
        external
        view
        returns (bool settled, bool resolvedToYes);
}
