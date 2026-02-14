// SPDX-License-Identifier: MIT
pragma solidity ^0.8.19;

import "../../../src/v2/interfaces/IConditionResolver.sol";
import "../../../src/v2/interfaces/IV2Types.sol";

/// @title MockConditionResolver
/// @notice Test mock for IConditionResolver — allows programmatic control of condition outcomes
contract MockConditionResolver is IConditionResolver {
    mapping(bytes32 => bool) public validConditions;
    mapping(bytes32 => bool) public resolvedConditions;
    mapping(bytes32 => IV2Types.OutcomeVector) public outcomes;
    mapping(bytes32 => bool) public finalizedConditions;

    /// @notice Configure a condition for testing
    function setCondition(
        bytes32 id,
        bool valid,
        bool resolved,
        uint256 yesWeight,
        uint256 noWeight,
        bool finalized
    ) external {
        validConditions[id] = valid;
        resolvedConditions[id] = resolved;
        outcomes[id] = IV2Types.OutcomeVector(yesWeight, noWeight);
        finalizedConditions[id] = finalized;
    }

    function isValidCondition(bytes32 conditionId) external view returns (bool) {
        return validConditions[conditionId];
    }

    function getResolution(bytes32 conditionId)
        external
        view
        returns (bool isResolved, IV2Types.OutcomeVector memory outcome)
    {
        return (resolvedConditions[conditionId], outcomes[conditionId]);
    }

    function isFinalized(bytes32 conditionId) external view returns (bool) {
        return finalizedConditions[conditionId];
    }

    function getResolutions(bytes32[] calldata conditionIds)
        external
        view
        returns (bool[] memory isResolved, IV2Types.OutcomeVector[] memory outcomeVectors)
    {
        isResolved = new bool[](conditionIds.length);
        outcomeVectors = new IV2Types.OutcomeVector[](conditionIds.length);
        for (uint256 i = 0; i < conditionIds.length; i++) {
            isResolved[i] = resolvedConditions[conditionIds[i]];
            outcomeVectors[i] = outcomes[conditionIds[i]];
        }
    }
}
