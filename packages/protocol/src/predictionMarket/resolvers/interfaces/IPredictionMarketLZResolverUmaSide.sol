// SPDX-License-Identifier: MIT
pragma solidity ^0.8.19;

import {ILayerZeroBridge} from "../../../bridge/interfaces/ILayerZeroBridge.sol";
import {BridgeTypes} from "../../../bridge/BridgeTypes.sol";

/**
 * @title IPredictionMarketLZResolverUmaSide
 * @notice Interface for UMA-side LayerZero Prediction Market Resolver
 * @dev This resolver handles UMA interactions and sends results to prediction market side
 */
interface IPredictionMarketLZResolverUmaSide is ILayerZeroBridge {
    // Custom errors
    error OnlyOptimisticOracleV3CanCall();
    error OnlyApprovedAssertersCanCall();
    error InvalidAssertionId();
    error MarketNotEnded();
    error MarketAlreadySettled();
    error AssertionAlreadySubmitted();
    error NotEnoughBondAmount(
        address sender,
        address bondCurrency,
        uint256 bondAmount,
        uint256 initialBalance,
        uint256 finalBalance
    );

    // Events
    event OptimisticOracleV3Updated(address indexed optimisticOracleV3);
    event ConfigUpdated(address indexed bondCurrency, uint256 bondAmount, uint64 assertionLiveness, address indexed updater);
    event AsserterApproved(address indexed asserter);
    event AsserterRevoked(address indexed asserter);
    event OwnerWithdrewBond(address indexed token, uint256 amount, address indexed to);
    event MarketSubmittedToUMA(
        bytes32 indexed marketId,
        bytes32 indexed assertionId,
        address asserter,
        bytes claim,
        bool resolvedToYes
    );
    event MarketResolvedFromUMA(
        bytes32 indexed marketId,
        bytes32 indexed assertionId,
        bool resolvedToYes,
        bool assertedTruthfully
    );
    event MarketDisputedFromUMA(
        bytes32 indexed marketId,
        bytes32 indexed assertionId
    );

    // Functions
    function submitAssertion(
        bytes calldata claim,
        uint256 endTime,
        bool resolvedToYes
    ) external;

    // Optimistic Oracle V3
    function setOptimisticOracleV3(address _optimisticOracleV3) external;
    function getOptimisticOracleV3() external view returns (address);

    // Asserter management
    function approveAsserter(address asserter) external;
    function revokeAsserter(address asserter) external;
    function isAsserterApproved(address asserter) external view returns (bool);

    // Owner bond withdrawal (for stuck tokens)
    function withdrawBond(address token, uint256 amount, address to) external;
}
