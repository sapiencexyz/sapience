// SPDX-License-Identifier: MIT
pragma solidity ^0.8.19;

import "@openzeppelin/contracts/token/ERC721/ERC721.sol";
import "@openzeppelin/contracts/access/Ownable.sol";
import "./interfaces/IParlayNFT.sol";

/**
 * @title ParlayNFT
 * @notice NFT contract for Parlay Pool system
 */
contract ParlayNFT is IParlayNFT, ERC721, Ownable {
    constructor(
        string memory name,
        string memory symbol
    ) ERC721(name, symbol) Ownable(msg.sender) {}

    /**
     * @notice Mint a new parlay NFT (only callable by authorized contracts)
     * @param to Address to mint the NFT to
     * @param tokenId Token ID for the NFT
     */
    function mint(address to, uint256 tokenId) external override onlyOwner {
        _safeMint(to, tokenId);
    }

    /**
     * @notice Burn a parlay NFT (only callable by authorized contracts)
     * @param tokenId Token ID to burn
     */
    function burn(uint256 tokenId) external override onlyOwner {
        _burn(tokenId);
    }
}
