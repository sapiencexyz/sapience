// SPDX-License-Identifier: MIT
pragma solidity ^0.8.19;

import { Ownable } from "@openzeppelin/contracts/access/Ownable.sol";
import { IConditionResolver } from "../../interfaces/IConditionResolver.sol";
import { ConditionResolverBase } from "../ConditionResolverBase.sol";
import { IV2Types } from "../../interfaces/IV2Types.sol";

/// @title ManualConditionResolver
/// @notice Generic condition resolver where approved settlers can manually settle conditions
/// @dev Useful for conditions that require off-chain verification or admin resolution
contract ManualConditionResolver is ConditionResolverBase, Ownable {
    // ============ Errors ============
    error NotApprovedSettler();
    error ConditionAlreadySettled();
    error InvalidOutcome();
    error ArrayLengthMismatch();

    // ============ Events ============
    event SettlerApproved(address indexed settler);
    event SettlerRevoked(address indexed settler);
    event ConditionResolutionDetail(
        bytes32 indexed conditionId,
        uint256 yesWeight,
        uint256 noWeight,
        address indexed settler
    );

    // ============ Storage ============
    mapping(address => bool) public approvedSettlers;
    mapping(bytes32 => IV2Types.OutcomeVector) internal _outcomes;
    mapping(bytes32 => bool) public isSettled;

    // ============ Constructor ============
    constructor(address _owner) Ownable(_owner) { }

    // ============ Owner Functions ============

    /// @notice Approve an address to settle conditions
    /// @param settler The address to approve
    function approveSettler(address settler) external onlyOwner {
        approvedSettlers[settler] = true;
        emit SettlerApproved(settler);
    }

    /// @notice Revoke settler approval
    /// @param settler The address to revoke
    function revokeSettler(address settler) external onlyOwner {
        approvedSettlers[settler] = false;
        emit SettlerRevoked(settler);
    }

    /// @notice Batch approve multiple settlers
    /// @param settlers Array of addresses to approve
    function approveSettlers(address[] calldata settlers) external onlyOwner {
        for (uint256 i = 0; i < settlers.length; i++) {
            approvedSettlers[settlers[i]] = true;
            emit SettlerApproved(settlers[i]);
        }
    }

    // ============ Settler Functions ============

    /// @notice Settle a condition with an outcome vector
    /// @param conditionId The condition to settle
    /// @param outcome The outcome vector [yesWeight, noWeight]
    /// @dev Only approved settlers can call this
    function settleCondition(
        bytes32 conditionId,
        IV2Types.OutcomeVector calldata outcome
    ) external {
        if (!approvedSettlers[msg.sender]) {
            revert NotApprovedSettler();
        }
        if (isSettled[conditionId]) revert ConditionAlreadySettled();

        // At least one weight must be non-zero
        if (outcome.yesWeight == 0 && outcome.noWeight == 0) {
            revert InvalidOutcome();
        }

        _outcomes[conditionId] = outcome;
        isSettled[conditionId] = true;

        emit ConditionResolutionDetail(
            conditionId, outcome.yesWeight, outcome.noWeight, msg.sender
        );

        _emitResolved(abi.encode(conditionId), outcome);
    }

    /// @notice Batch settle multiple conditions
    /// @param conditionIds Array of conditions to settle
    /// @param outcomes Array of outcome vectors
    function settleConditions(
        bytes32[] calldata conditionIds,
        IV2Types.OutcomeVector[] calldata outcomes
    ) external {
        if (!approvedSettlers[msg.sender]) revert NotApprovedSettler();
        if (conditionIds.length != outcomes.length) {
            revert ArrayLengthMismatch();
        }

        uint256 length = conditionIds.length;
        for (uint256 i = 0; i < length; i++) {
            bytes32 conditionId = conditionIds[i];
            IV2Types.OutcomeVector calldata outcome = outcomes[i];

            if (isSettled[conditionId]) revert ConditionAlreadySettled();
            if (outcome.yesWeight == 0 && outcome.noWeight == 0) {
                revert InvalidOutcome();
            }

            _outcomes[conditionId] = outcome;
            isSettled[conditionId] = true;

            emit ConditionResolutionDetail(
                conditionId, outcome.yesWeight, outcome.noWeight, msg.sender
            );

            _emitResolved(abi.encode(conditionId), outcome);
        }
    }

    // ============ IConditionResolver Implementation ============

    /// @inheritdoc IConditionResolver
    function isValidCondition(bytes calldata conditionId)
        external
        pure
        returns (bool)
    {
        if (conditionId.length != 32) return false;
        bytes32 rawId = bytes32(conditionId[:32]);
        return rawId != bytes32(0);
    }

    /// @inheritdoc IConditionResolver
    function getResolution(bytes calldata conditionId)
        external
        view
        returns (bool resolved, IV2Types.OutcomeVector memory outcome)
    {
        bytes32 rawId = bytes32(conditionId[:32]);
        resolved = isSettled[rawId];
        outcome = _outcomes[rawId];
    }

    /// @inheritdoc IConditionResolver
    function getResolutions(bytes[] calldata conditionIds)
        external
        view
        returns (
            bool[] memory resolved,
            IV2Types.OutcomeVector[] memory outcomes
        )
    {
        uint256 length = conditionIds.length;
        resolved = new bool[](length);
        outcomes = new IV2Types.OutcomeVector[](length);

        for (uint256 i = 0; i < length; i++) {
            bytes32 rawId = bytes32(conditionIds[i][:32]);
            resolved[i] = isSettled[rawId];
            outcomes[i] = _outcomes[rawId];
        }
    }

    /// @inheritdoc IConditionResolver
    function isFinalized(bytes calldata conditionId)
        external
        view
        returns (bool)
    {
        bytes32 rawId = bytes32(conditionId[:32]);
        return isSettled[rawId];
    }

    // ============ View Functions ============

    /// @notice Get the outcome for a condition
    /// @param conditionId The condition identifier
    /// @return The outcome vector
    function getOutcome(bytes32 conditionId)
        external
        view
        returns (IV2Types.OutcomeVector memory)
    {
        return _outcomes[conditionId];
    }
}
