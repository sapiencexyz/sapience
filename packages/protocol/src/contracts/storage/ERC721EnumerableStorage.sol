//SPDX-License-Identifier: MIT
pragma solidity >=0.8.11 <0.9.0;

import "./ERC721Storage.sol";
import "./Errors.sol";

library ERC721EnumerableStorage {
    using ERC721Storage for ERC721Storage.Data;

    bytes32 private constant _SLOT_ERC721_ENUMERABLE_STORAGE =
        keccak256(abi.encode("io.synthetix.core-contracts.ERC721Enumerable"));

    struct Data {
        mapping(uint256 => uint256) ownedTokensIndex;
        mapping(uint256 => uint256) allTokensIndex;
        mapping(address => mapping(uint256 => uint256)) ownedTokens;
        uint256[] allTokens;
    }

    function load() internal pure returns (Data storage store) {
        bytes32 s = _SLOT_ERC721_ENUMERABLE_STORAGE;
        assembly {
            store.slot := s
        }
    }

    function totalSupply() internal view returns (uint256) {
        return load().allTokens.length;
    }

    function tokenOfOwnerByIndex(
        address owner,
        uint256 index
    ) public view returns (uint256) {
        ERC721Storage.Data storage erc721Storage = ERC721Storage.load();

        if (erc721Storage.balanceOf[owner] <= index) {
            revert Errors.IndexOverrun(index, erc721Storage.balanceOf[owner]);
        }
        return load().ownedTokens[owner][index];
    }

    /**
     * @dev Returns the total amount of tokens stored by the contract.
     */
    function tokenByIndex(uint256 index) public view returns (uint256) {
        if (index > totalSupply()) {
            revert Errors.IndexOverrun(index, totalSupply());
        }
        return load().allTokens[index];
    }

    function _addTokenToOwnerEnumeration(address to, uint256 tokenId) internal {
        uint256 length = ERC721Storage.load().balanceOf[to];
        Data storage self = load();
        self.ownedTokens[to][length] = tokenId;
        self.ownedTokensIndex[tokenId] = length;
    }

    /**
     * @dev Private function to add a token to this extension's token tracking data structures.
     * @param tokenId uint256 ID of the token to be added to the tokens list
     */
    function _addTokenToAllTokensEnumeration(uint256 tokenId) internal {
        Data storage self = load();
        self.allTokensIndex[tokenId] = self.allTokens.length;
        self.allTokens.push(tokenId);
    }

    /**
     * @dev Private function to remove a token from this extension's ownership-tracking data structures. Note that
     * while the token is not assigned a new owner, the `_ownedTokensIndex` mapping is _not_ updated: this allows for
     * gas optimizations e.g. when performing a transfer operation (avoiding double writes).
     * This has O(1) time complexity, but alters the order of the _ownedTokens array.
     * @param from address representing the previous owner of the given token ID
     * @param tokenId uint256 ID of the token to be removed from the tokens list of the given address
     */
    function _removeTokenFromOwnerEnumeration(
        address from,
        uint256 tokenId
    ) internal {
        // To prevent a gap in from's tokens array, we store the last token in the index of the token to delete, and
        // then delete the last slot (swap and pop).
        Data storage self = load();

        uint256 lastTokenIndex = ERC721Storage.load().balanceOf[from] - 1;
        uint256 tokenIndex = self.ownedTokensIndex[tokenId];

        // When the token to delete is the last token, the swap operation is unnecessary
        if (tokenIndex != lastTokenIndex) {
            uint256 lastTokenId = self.ownedTokens[from][lastTokenIndex];

            self.ownedTokens[from][tokenIndex] = lastTokenId; // Move the last token to the slot of the to-delete token
            self.ownedTokensIndex[lastTokenId] = tokenIndex; // Update the moved token's index
        }

        // This also deletes the contents at the last position of the array
        delete self.ownedTokensIndex[tokenId];
        delete self.ownedTokens[from][lastTokenIndex];
    }

    /**
     * @dev Private function to remove a token from this extension's token tracking data structures.
     * This has O(1) time complexity, but alters the order of the _allTokens array.
     * @param tokenId uint256 ID of the token to be removed from the tokens list
     */
    function _removeTokenFromAllTokensEnumeration(uint256 tokenId) internal {
        Data storage self = load();

        // To prevent a gap in the tokens array, we store the last token in the index of the token to delete, and
        // then delete the last slot (swap and pop).

        uint256 lastTokenIndex = self.allTokens.length - 1;
        uint256 tokenIndex = self.allTokensIndex[tokenId];

        // When the token to delete is the last token, the swap operation is unnecessary. However, since this occurs so
        // rarely (when the last minted token is burnt) that we still do the swap here to avoid the gas cost of adding
        // an 'if' statement (like in _removeTokenFromOwnerEnumeration)
        uint256 lastTokenId = self.allTokens[lastTokenIndex];

        self.allTokens[tokenIndex] = lastTokenId; // Move the last token to the slot of the to-delete token
        self.allTokensIndex[lastTokenId] = tokenIndex; // Update the moved token's index

        // This also deletes the contents at the last position of the array
        delete self.allTokensIndex[tokenId];
        self.allTokens.pop();
    }
}
