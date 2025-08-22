// SPDX-License-Identifier: MIT
pragma solidity ^0.8.22;

import {ILayerZeroBridge} from "./ILayerZeroBridge.sol";

/**
 * @title IMarketLayerZeroBridge
 * @notice Interface for Market-side LayerZero bridge
 */
interface IMarketLayerZeroBridge is ILayerZeroBridge {
    // Custom errors
    error OnlyEnabledMarketGroupsCanSubmit(address caller);
    error NotEnoughBondAmount(address asserter, address currency, uint256 required, uint256 available);

    // Events
    event AssertionSubmitted(
        address indexed marketGroup,
        uint256 indexed marketId,
        uint256 assertionId
    );
    event MarketGroupEnabled(address indexed marketGroup);
    event MarketGroupDisabled(address indexed marketGroup);
    event BondDeposited(
        address indexed submitter,
        address indexed bondToken,
        uint256 amount
    );
    event BondIntentToWithdraw(
        address indexed submitter,
        address indexed bondToken,
        uint256 amount
    );
    event BondIntentToWithdrawRemoved(
        address indexed submitter,
        address indexed bondToken,
        uint256 amount
    );
    event BondWithdrawn(
        address indexed submitter,
        address indexed bondToken,
        uint256 amount
    );

    // Market-side specific functions
    function forwardAssertTruth(
        address marketGroup,
        uint256 marketId,
        bytes memory claim,
        address asserter,
        uint64 liveness,
        address currency,
        uint256 bond
    ) external returns (bytes32);

    // MarketGroup Management
    function enableMarketGroup(address marketGroup) external;
    function disableMarketGroup(address marketGroup) external;
    function isMarketGroupEnabled(
        address marketGroup
    ) external view returns (bool);
} 