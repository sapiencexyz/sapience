// SPDX-License-Identifier: MIT
pragma solidity ^0.8.19;

import "./IV2Types.sol";

/**
 * @title IConditionResolver
 * @notice Interface for V2 condition resolvers that return outcome vectors
 * @dev Condition resolvers are the source of truth for individual condition outcomes.
 *      Unlike V1 which returned booleans, V2 resolvers return outcome vectors
 *      [yesWeight, noWeight] to support ties and weighted outcomes.
 */
interface IConditionResolver {
    /// @notice Check if a condition ID is valid for this resolver
    /// @param conditionId The opaque condition identifier
    /// @return isValid True if the condition exists and is valid
    function isValidCondition(bytes32 conditionId) external view returns (bool isValid);

    /// @notice Get the resolution status and outcome vector for a condition
    /// @param conditionId The opaque condition identifier
    /// @return isResolved True if the condition has been resolved
    /// @return outcome The outcome vector [yesWeight, noWeight]
    /// @dev Outcome interpretation:
    ///      - [1, 0] = Resolved to YES
    ///      - [0, 1] = Resolved to NO
    ///      - [1, 1] = Tie (non-decisive)
    ///      - [0, 0] = Invalid or unresolved
    function getResolution(bytes32 conditionId)
        external
        view
        returns (bool isResolved, IV2Types.OutcomeVector memory outcome);

    /// @notice Check if a condition resolution is finalized (cannot change)
    /// @param conditionId The opaque condition identifier
    /// @return isFinalized True if the resolution is final
    function isFinalized(bytes32 conditionId) external view returns (bool isFinalized);
}
