// SPDX-License-Identifier: MIT
pragma solidity ^0.8.19;

import "./IPredictionStructs.sol";

/**
 * @title IPredictionMarketRFQ
 * @notice Main interface for the Prediction Market contract
 */
interface IPredictionMarketRFQ {
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
        IPredictionStructs.MintPredictionRequestData
            calldata mintPredictionRequestData
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

}
