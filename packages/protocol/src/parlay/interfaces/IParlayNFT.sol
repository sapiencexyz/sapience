// SPDX-License-Identifier: MIT
pragma solidity ^0.8.19;

import "@openzeppelin/contracts/token/ERC721/IERC721.sol";

/**
 * @title IParlayNFT
 * @notice Interface for Parlay NFT contracts with mint and burn capabilities
 */
interface IParlayNFT is IERC721 {
    /**
     * @notice Mint a new NFT token
     * @param to The address to mint the token to
     * @param tokenId The token ID to mint
     */
    function mint(address to, uint256 tokenId) external;

    /**
     * @notice Burn an existing NFT token
     * @param tokenId The token ID to burn
     */
    function burn(uint256 tokenId) external;
}
