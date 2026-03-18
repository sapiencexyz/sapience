// SPDX-License-Identifier: MIT
pragma solidity ^0.8.19;

import { IConditionResolver } from "../interfaces/IConditionResolver.sol";
import { IV2Types } from "../interfaces/IV2Types.sol";

/// @title ConditionResolverBase
/// @notice Abstract base contract for condition resolvers that emits the unified ConditionResolved event
/// @dev All resolvers should inherit this to get the _emitResolved helper
abstract contract ConditionResolverBase is IConditionResolver {
    /// @dev Emit the unified ConditionResolved event with derived convenience booleans
    /// @param conditionId The opaque condition identifier (variable length)
    /// @param outcome The outcome vector [yesWeight, noWeight]
    function _emitResolved(
        bytes memory conditionId,
        IV2Types.OutcomeVector memory outcome
    ) internal {
        bool isIndecisive = outcome.yesWeight > 0 && outcome.noWeight > 0;
        bool resolvedToYes = !isIndecisive && outcome.yesWeight > 0;

        emit ConditionResolved(conditionId, isIndecisive, resolvedToYes);
    }
}
