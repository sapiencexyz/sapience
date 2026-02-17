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
     * @notice Mint a new prediction NFT with RFQ (Request-for-Quote) mechanism
     * @dev The taker must sign an EIP-712 approval for the specific prediction. It will:
     *   1- Validate the taker's signature for this exact prediction
     *   2- Verify maker nonce and increment it to prevent replay attacks
     *   3- Validate the predicted outcomes (markets are valid, not settled)
     *   4- Transfer collateral from both maker and taker (they must have approved the contract)
     *   5- Create the prediction with maker and taker NFT IDs
     *   6- Mint both NFTs to their respective parties
     *   7- Emit a PredictionMinted event
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
