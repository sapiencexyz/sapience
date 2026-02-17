// SPDX-License-Identifier: MIT
pragma solidity ^0.8.19;

import {IPredictionMarketResolver} from "../../interfaces/IPredictionMarketResolver.sol";

/**
 * @title IPredictionMarketLZResolver
 * @notice Interface for LayerZero-based Prediction Market Resolver (PM side)
 * @dev This resolver only receives resolution messages from UMA side via LayerZero
 */
interface IPredictionMarketLZResolver is IPredictionMarketResolver {
    // Custom errors
    error OnlyRemoteResolverCanCall();
    error InvalidMarketId();

    // Events
    event MarketResolved(
        bytes32 indexed marketId,
        bool resolvedToYes,
        bool assertedTruthfully,
        uint256 resolutionTime
    );
}
