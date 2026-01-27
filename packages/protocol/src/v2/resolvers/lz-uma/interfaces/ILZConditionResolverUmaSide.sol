// SPDX-License-Identifier: MIT
pragma solidity ^0.8.19;

import { LZTypes } from "../../shared/LZTypes.sol";

/// @title ILZConditionResolverUmaSide
/// @notice Interface for UMA-side LayerZero Condition Resolver
/// @dev This resolver handles UMA interactions and sends results to prediction market side
interface ILZConditionResolverUmaSide {
    // ============ Structs ============
    struct Settings {
        address bondCurrency;
        uint256 bondAmount;
        uint64 assertionLiveness;
    }

    // ============ Errors ============
    error OnlyOptimisticOracleV3CanCall();
    error OnlyApprovedAssertersCanCall();
    error InvalidAssertionId();
    error ConditionNotEnded();
    error AssertionAlreadySubmitted();
    error NotEnoughBondAmount(
        address sender,
        address bondCurrency,
        uint256 bondAmount,
        uint256 balance
    );
    error InvalidSourceChain(uint32 expected, uint32 actual);
    error InvalidSender(address expected, address actual);
    error OnlySelfCallAllowed(address caller);

    // ============ Events ============
    event BridgeConfigUpdated(LZTypes.BridgeConfig config);
    event OptimisticOracleV3Updated(address indexed optimisticOracleV3);
    event ConfigUpdated(
        address indexed bondCurrency,
        uint256 bondAmount,
        uint64 assertionLiveness
    );
    event AsserterApproved(address indexed asserter);
    event AsserterRevoked(address indexed asserter);
    event BondWithdrawn(
        address indexed token, uint256 amount, address indexed to
    );
    event ConditionSubmittedToUMA(
        bytes32 indexed conditionId,
        bytes32 indexed assertionId,
        address asserter,
        bytes claim,
        bool resolvedToYes
    );
    event ConditionResolvedFromUMA(
        bytes32 indexed conditionId,
        bytes32 indexed assertionId,
        bool resolvedToYes,
        bool assertedTruthfully
    );
    event ConditionDisputedFromUMA(
        bytes32 indexed conditionId, bytes32 indexed assertionId
    );

    // ============ Functions ============

    // Assertion submission
    function submitAssertion(
        bytes calldata claim,
        uint256 endTime,
        bool resolvedToYes
    ) external;

    // Configuration
    function setBridgeConfig(LZTypes.BridgeConfig calldata config) external;
    function getBridgeConfig()
        external
        view
        returns (LZTypes.BridgeConfig memory);
    function setConfig(Settings calldata config) external;
    function getConfig() external view returns (Settings memory);
    function setOptimisticOracleV3(address optimisticOracleV3) external;
    function getOptimisticOracleV3() external view returns (address);

    // Asserter management
    function approveAsserter(address asserter) external;
    function revokeAsserter(address asserter) external;
    function isAsserterApproved(address asserter) external view returns (bool);

    // Bond management
    function withdrawBond(address token, uint256 amount, address to) external;

    // View functions
    function getConditionAssertionId(bytes32 conditionId)
        external
        view
        returns (bytes32);
    function getAssertionConditionId(bytes32 assertionId)
        external
        view
        returns (bytes32);
}
