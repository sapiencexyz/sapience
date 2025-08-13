// SPDX-License-Identifier: MIT
pragma solidity ^0.8.19;

import "./IParlayStructs.sol";
import "./IParlayEvents.sol";

/**
 * @title IParlayPool
 * @notice Main interface for the Parlay Pool contract
 */
interface IParlayPool is IParlayStructs, IParlayEvents {
    // ============ Parlay Functions ============

    /**
     * @notice Submit a parlay order to the orderbook
     * @param predictedOutcomes Array of predicted outcomes (true = YES, false = NO)
     * @param collateral Amount of collateral to use for the parlay
     * @param payout Minimum acceptable payout for the parlay
     * @param orderExpirationTime Expiration time for the parlay order
     * @param refCode Reference code for the parlay order
     * @return requestId ID of the parlay request
     */
    function submitParlayOrder(
        IParlayStructs.PredictedOutcome[] calldata predictedOutcomes,
        uint256 collateral,
        uint256 payout,
        uint256 orderExpirationTime,
        bytes32 refCode
    )
        external
        returns (
            // uint256 parlayExpirationTime
            uint256 requestId
        );

    /**
     * @notice Fill a parlay order directly with the specified payout
     * @param requestId ID of the parlay request
     * @dev First LP to call this function within orderExpirationTime will fill the order
     * @param refCode Reference code for the parlay order
     */
    function fillParlayOrder(uint256 requestId, bytes32 refCode) external;

    /**
     * @notice Settle a parlay after all markets have resolved
     * @param tokenId The NFT token ID representing the parlay
     */
    function settleParlay(uint256 tokenId) external;

    /**
     * @notice Withdraw the collateral and payout of a settled parlay
     * @param tokenId The NFT token ID of the parlay (player or lp depending on the result of the parlay)
     */
    function withdrawParlayCollateral(uint256 tokenId) external;

    /**
     * @notice Settle a parlay after all markets have resolved and withdraw the collateral
     * @param tokenId The NFT token ID representing the parlay
     */
    function settleAndWithdrawParlayCollateral(uint256 tokenId) external;

    /**
     * @notice Cancel an expired parlay order and return collateral to player
     * @param requestId ID of the expired parlay request
     */
    function cancelExpiredOrder(uint256 requestId) external;

    // ============ View Functions ============

    /**
     * @notice Get the pool configuration
     * @return config Pool configuration
     */
    function getConfig()
        external
        view
        returns (IParlayStructs.Settings memory config);

    /**
     * @notice Get parlay information
     * @param tokenId NFT token ID
     * @return parlayData Parlay details
     * @return predictedOutcomes Array of predicted outcomes
     */
    function getParlay(
        uint256 tokenId
    )
        external
        view
        returns (
            IParlayStructs.ParlayData memory parlayData,
            IParlayStructs.PredictedOutcome[] memory predictedOutcomes
        );

    /**
     * @notice Get parlay information by ID
     * @param parlayId ID of the parlay
     * @return parlayData Parlay details
     * @return predictedOutcomes Array of predicted outcomes
     */
    function getParlayById(
        uint256 parlayId
    )
        external
        view
        returns (
            IParlayStructs.ParlayData memory parlayData,
            IParlayStructs.PredictedOutcome[] memory predictedOutcomes
        );

    /**
     * @notice Get multiple parlays by IDs
     * @param parlayIds IDs of the parlays
     * @return parlayDataList List of parlay details
     * @return predictedOutcomesList List of predicted outcomes arrays
     */
    function getParlayByIds(
        uint256[] calldata parlayIds
    )
        external
        view
        returns (
            IParlayStructs.ParlayData[] memory parlayDataList,
            IParlayStructs.PredictedOutcome[][] memory predictedOutcomesList
        );

    /**
     * @notice Get parlay order information
     * @param requestId ID of the parlay request
     * @return parlayData Parlay request details
     * @return predictedOutcomes Array of predicted outcomes
     */
    function getParlayOrder(
        uint256 requestId
    )
        external
        view
        returns (
            IParlayStructs.ParlayData memory parlayData,
            IParlayStructs.PredictedOutcome[] memory predictedOutcomes
        );

    /**
     * @notice Check if a parlay order can be filled
     * @param requestId ID of the parlay request
     * @return canFill Whether the order can be filled
     * @return reason Reason if cannot be filled
     */
    function canFillParlayOrder(
        uint256 requestId
    ) external view returns (bool canFill, uint256 reason);

    /**
     * @notice Get all unfilled order IDs
     */
    function getUnfilledOrderIds()
        external
        view
        returns (uint256[] memory orderIds);

    /**
     * @notice Get all order IDs where `account` is the maker or taker
     * @param account Address to filter by
     */
    function getOrderIdsByAddress(
        address account
    ) external view returns (uint256[] memory orderIds);
}
