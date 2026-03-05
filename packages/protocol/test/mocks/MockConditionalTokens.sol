// SPDX-License-Identifier: MIT
pragma solidity ^0.8.19;

/// @title MockConditionalTokens
/// @notice Mock Gnosis ConditionalTokens for testing
contract MockConditionalTokens {
    struct ConditionData {
        uint256 slotCount;
        uint256 payoutDenominator;
        uint256[] payoutNumerators;
    }

    mapping(bytes32 => ConditionData) private _conditions;

    /// @notice Set up a condition for testing
    function setCondition(
        bytes32 conditionId,
        uint256 slotCount,
        uint256 payoutDenominator,
        uint256[] memory payoutNumerators
    ) external {
        _conditions[conditionId] = ConditionData({
            slotCount: slotCount,
            payoutDenominator: payoutDenominator,
            payoutNumerators: payoutNumerators
        });
    }

    /// @notice Set up a binary YES condition (YES wins)
    function setYesCondition(bytes32 conditionId) external {
        uint256[] memory numerators = new uint256[](2);
        numerators[0] = 1; // YES (index 0)
        numerators[1] = 0; // NO (index 1)
        _conditions[conditionId] = ConditionData({
            slotCount: 2, payoutDenominator: 1, payoutNumerators: numerators
        });
    }

    /// @notice Set up a binary NO condition (NO wins)
    function setNoCondition(bytes32 conditionId) external {
        uint256[] memory numerators = new uint256[](2);
        numerators[0] = 0; // YES (index 0)
        numerators[1] = 1; // NO (index 1)
        _conditions[conditionId] = ConditionData({
            slotCount: 2, payoutDenominator: 1, payoutNumerators: numerators
        });
    }

    /// @notice Set up an unresolved condition
    function setUnresolvedCondition(bytes32 conditionId) external {
        uint256[] memory numerators = new uint256[](2);
        numerators[0] = 0;
        numerators[1] = 0;
        _conditions[conditionId] = ConditionData({
            slotCount: 2, payoutDenominator: 0, payoutNumerators: numerators
        });
    }

    /// @notice Set up a tie/split condition (invalid for binary)
    function setTieCondition(bytes32 conditionId) external {
        uint256[] memory numerators = new uint256[](2);
        numerators[0] = 1; // YES
        numerators[1] = 1; // NO (equal = tie)
        _conditions[conditionId] = ConditionData({
            slotCount: 2, payoutDenominator: 2, payoutNumerators: numerators
        });
    }

    /// @notice Set up a non-binary condition (invalid)
    function setNonBinaryCondition(bytes32 conditionId) external {
        uint256[] memory numerators = new uint256[](3);
        numerators[0] = 1;
        numerators[1] = 0;
        numerators[2] = 0;
        _conditions[conditionId] = ConditionData({
            slotCount: 3, payoutDenominator: 1, payoutNumerators: numerators
        });
    }

    // ============ IConditionalTokens Interface ============

    function getOutcomeSlotCount(bytes32 conditionId)
        external
        view
        returns (uint256)
    {
        return _conditions[conditionId].slotCount;
    }

    function payoutDenominator(bytes32 conditionId)
        external
        view
        returns (uint256)
    {
        return _conditions[conditionId].payoutDenominator;
    }

    function payoutNumerators(bytes32 conditionId, uint256 index)
        external
        view
        returns (uint256)
    {
        ConditionData memory data = _conditions[conditionId];
        if (index >= data.payoutNumerators.length) return 0;
        return data.payoutNumerators[index];
    }
}
