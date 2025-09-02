// SPDX-License-Identifier: MIT
pragma solidity ^0.8.19;

import "@openzeppelin/contracts/token/ERC721/IERC721.sol";
import "./IParlayStructs.sol";
import "./IParlayEvents.sol";


/**
 * @title IParlayPool
 * @notice Main interface for the Parlay Pool contract
 */
interface IParlayPool is IERC721,  IParlayStructs, IParlayEvents {
    // ============ Parlay Functions ============

    /**
     * @notice Mint a new parlay NFT directly with maker and taker signatures
     * @dev it will:
     *   1- do all the validations on the predictedOutcomes (markets are valid, taker and maker has enough funds)
     *   2- execute the collateral aproval for both, taker and maker using the signatures
     *   3- create the parlay -> maker and taker NFT ids, predictedOutcomes, amount of collateral used from each party, total collateral on the parlay. (winner takes all)
     *   4- mint the taker and maker NFT
     *   5- emit an event with the right information
     * @param mintParlayRequestData Struct containing the mint parlay request data
     */
    function mint(
        IParlayStructs.MintParlayRequestData calldata mintParlayRequestData
    ) external returns (uint256 makerNftTokenId, uint256 takerNftTokenId);

    /**
     * @notice Burn a parlay NFT and release any remaining collateral
     * @dev it will: 
     *   1- identify the parlay based on the token id (can be the maker or taker NFT id)
     *   2- confirm the markets settled -> set the parlay as settled
     *   3- find who won (maker or taker based on markets result) -> set the winner as maker or taker
     *   4- transfer the collateral to winner NFT owner
     *   5- burn the two NFTs 
     *   6- emit an event with the right information
     * @param tokenId The NFT token ID to burn
     */
    function burn(uint256 tokenId) external;


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
}
