// SPDX-License-Identifier: MIT
pragma solidity ^0.8.19;

import "./IV2Types.sol";

/**
 * @title IConditionResolver
 * @notice Interface for V2 condition resolvers that return outcome vectors
 * @dev Condition resolvers are the source of truth for individual condition outcomes.
 *      Unlike V1 which returned booleans, V2 resolvers return outcome vectors
 *      [yesWeight, noWeight] to support ties and weighted outcomes.
 *      conditionId is variable-length bytes to support resolver-specific encoding
 *      (e.g. bytes32 conditionId + uint256 timestamp for deadline-aware resolution).
 */
interface IConditionResolver {
    /// @notice Unified event emitted by all resolvers when a condition is resolved
    /// @param conditionId The opaque condition identifier (variable length)
    /// @param isIndecisive True if both yesWeight and noWeight are non-zero (tie)
    /// @param resolvedToYes True if not indecisive and yesWeight > 0
    event ConditionResolved(
        bytes conditionId, bool isIndecisive, bool resolvedToYes
    );

    /// @notice Check if a condition ID is valid for this resolver
    /// @param conditionId The opaque condition identifier (variable length)
    /// @return isValid True if the condition exists and is valid
    function isValidCondition(bytes calldata conditionId)
        external
        view
        returns (bool isValid);

    /// @notice Get the resolution status and outcome vector for a condition
    /// @param conditionId The opaque condition identifier (variable length)
    /// @return isResolved True if the condition has been resolved
    /// @return outcome The outcome vector [yesWeight, noWeight]
    /// @dev Outcome interpretation:
    ///      - [1, 0] = Resolved to YES
    ///      - [0, 1] = Resolved to NO
    ///      - [1, 1] = Tie (non-decisive)
    ///      - [0, 0] = Invalid or unresolved
    function getResolution(bytes calldata conditionId)
        external
        view
        returns (bool isResolved, IV2Types.OutcomeVector memory outcome);

    /// @notice Check if a condition resolution is finalized (cannot change)
    /// @param conditionId The opaque condition identifier (variable length)
    /// @return isFinalized True if the resolution is final
    function isFinalized(bytes calldata conditionId)
        external
        view
        returns (bool isFinalized);

    /// @notice Batch get resolution status and outcome vectors for multiple conditions
    /// @param conditionIds Array of opaque condition identifiers
    /// @return isResolved Array of resolution statuses
    /// @return outcomes Array of outcome vectors
    /// @dev More gas efficient when resolving multiple conditions from the same resolver
    function getResolutions(bytes[] calldata conditionIds)
        external
        view
        returns (
            bool[] memory isResolved,
            IV2Types.OutcomeVector[] memory outcomes
        );
}
