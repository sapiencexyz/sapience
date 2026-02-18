// SPDX-License-Identifier: MIT
pragma solidity ^0.8.19;

import "@openzeppelin/contracts/token/ERC721/IERC721.sol";
import "./IPredictionStructs.sol";
import "./IPredictionEvents.sol";
import "./IPredictionMarketLimitOrder.sol";
import "./IPredictionMarketRFQ.sol";

/**
 * @title IPredictionMarket
 * @notice Main interface for the Prediction Market contract
 */
interface IPredictionMarket is
    IERC721,
    IPredictionStructs,
    IPredictionEvents,
    IPredictionMarketRFQ,
    IPredictionMarketLimitOrder
{
    /**
     * @notice Consolidate a prediction NFT and release any remaining collateral
     * @dev it will:
     *   1- identify the prediction based on the token id (can be the maker or taker NFT id)
     *   2- confirm the maker and taker are the same
     *   3- set the prediction as settled
     *   4- set the maker as the winner
     *   5- transfer the collateral to the maker
     *   6- burn the two NFTs
     *   7- emit an event with the right information
     * @param tokenId The NFT token ID to consolidate
     */
    function consolidatePrediction(uint256 tokenId, bytes32 refCode) external;

    // ============ View Functions ============

    /**
     * @notice Get the pool configuration
     * @return config Pool configuration
     */
    function getConfig()
        external
        view
        returns (IPredictionStructs.Settings memory config);

    /**
     * @notice Get prediction information
     * @param tokenId NFT token ID
     * @return predictionData Prediction details
     */
    function getPrediction(
        uint256 tokenId
    )
        external
        view
        returns (IPredictionStructs.PredictionData memory predictionData);

    /**
     * @notice Get total number of NFT IDs where `account` is the maker or taker
     * @param account Address to filter by
     */
    function getOwnedPredictionsCount(
        address account
    ) external view returns (uint256 count);

    /**
     * @notice Get all NFT IDs where `account` is the maker or taker
     * @param account Address to filter by
     */
    function getOwnedPredictions(
        address account
    ) external view returns (uint256[] memory nftTokenIds);

    /**
     * @notice Get the total collateral deposited by a user
     * @param user The address of the user
     * @return The total amount of collateral deposited by the user
     */
    function getUserCollateralDeposits(
        address user
    ) external view returns (uint256);

    /**
     * @notice Get the current nonce for a maker address
     * @dev Nonces are used for replay protection in mint() signatures.
     *      Each maker must use their current nonce when creating a new prediction.
     *      The nonce is incremented after each successful mint() call.
     * @param maker The maker address to query
     * @return The current nonce value for the maker
     */
    function nonces(address maker) external view returns (uint256);
}
