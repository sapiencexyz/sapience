// SPDX-License-Identifier: Apache-2.0
pragma solidity ^0.8.19;

import {PythStructs} from "./PythStructs.sol";

/// @notice Minimal Pyth pull-oracle interface needed for Benchmarks (historical) verification.
/// @dev Mirrors the commonly used `@pythnetwork/pyth-sdk-solidity` surface for EVM.
interface IPyth {
    /// @notice Returns the fee required to update/verify the given price update data.
    function getUpdateFee(bytes[] calldata updateData) external view returns (uint256 feeAmount);

    /// @notice Parse and verify a batch of Pyth price feed updates and return the requested feeds
    ///         whose publishTime falls within [minPublishTime, maxPublishTime].
    /// @dev Reverts if no update for a requested feed is found within the time range.
    function parsePriceFeedUpdates(
        bytes[] calldata updateData,
        bytes32[] calldata priceIds,
        uint64 minPublishTime,
        uint64 maxPublishTime
    ) external payable returns (PythStructs.PriceFeed[] memory priceFeeds);
}


