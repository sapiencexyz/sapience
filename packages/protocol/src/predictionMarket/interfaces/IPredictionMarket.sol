// SPDX-License-Identifier: MIT
pragma solidity ^0.8.19;

import "@openzeppelin/contracts/token/ERC721/IERC721.sol";
import "./IPredictionStructs.sol";
import "./IPredictionEvents.sol";


/**
 * @title IPredictionMarket
 * @notice Main interface for the Prediction Market contract
 */
interface IPredictionMarket is IERC721,  IPredictionStructs, IPredictionEvents {
    // ============ Prediction Functions ============

    /**
     * @notice Mint a new prediction NFT directly with maker and taker signatures
     * @dev it will:
     *   1- do all the validations on the predictedOutcomes (markets are valid, taker and maker has enough funds)
     *   2- execute the collateral aproval for both, taker and maker using the signatures
     *   3- create the prediction -> maker and taker NFT ids, predictedOutcomes, amount of collateral used from each party, total collateral on the prediction. (winner takes all)
     *   4- mint the taker and maker NFT
     *   5- emit an event with the right information
     * @param mintPredictionRequestData Struct containing the mint prediction request data
     */
    function mint(
        IPredictionStructs.MintPredictionRequestData calldata mintPredictionRequestData
    ) external returns (uint256 makerNftTokenId, uint256 takerNftTokenId);

    /**
     * @notice Burn a prediction NFT and release any remaining collateral
     * @dev it will: 
     *   1- identify the prediction based on the token id (can be the maker or taker NFT id)
     *   2- confirm the markets settled -> set the prediction as settled
     *   3- find who won (maker or taker based on markets result) -> set the winner as maker or taker
     *   4- transfer the collateral to winner NFT owner
     *   5- burn the two NFTs 
     *   6- emit an event with the right information
     * @param tokenId The NFT token ID to burn
     */
    function burn(uint256 tokenId, bytes32 refCode) external;

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
        returns (
            IPredictionStructs.PredictionData memory predictionData
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
