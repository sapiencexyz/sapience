// SPDX-License-Identifier: MIT
pragma solidity >=0.8.25 <0.9.0;

import "../interfaces/IERC721Enumerable.sol";
import "../storage/ERC721Storage.sol";
import "../storage/ERC721EnumerableStorage.sol";

// import "forge-std/console2.sol";

contract NftModule is IERC721Enumerable {
    constructor() {}

    // TODO Move to a module with just that function
    // function supportsInterface(
    //     bytes4 interfaceId
    // ) public view virtual override returns (bool) {
    //     return
    //         interfaceId == this.supportsInterface.selector || // ERC165
    //         interfaceId == type(IERC721).interfaceId ||
    //         interfaceId == type(IERC721Metadata).interfaceId;
    // }

    function balanceOf(
        address holder
    ) public view virtual override returns (uint256 balance) {
        if (holder == address(0)) {
            revert InvalidOwner(holder);
        }

        return ERC721Storage.load().balanceOf[holder];
    }

    function ownerOf(
        uint256 tokenId
    ) public view virtual override returns (address) {
        if (!ERC721Storage._exists(tokenId)) {
            revert TokenDoesNotExist(tokenId);
        }

        return ERC721Storage.load().ownerOf[tokenId];
    }

    function name() external view virtual override returns (string memory) {
        return ERC721Storage.load().name;
    }

    function symbol() external view virtual override returns (string memory) {
        return ERC721Storage.load().symbol;
    }

    function tokenURI(
        uint256 tokenId
    ) external view virtual override returns (string memory) {
        if (!ERC721Storage._exists(tokenId)) {
            revert TokenDoesNotExist(tokenId);
        }

        string memory baseURI = ERC721Storage.load().baseTokenURI;

        return
            bytes(baseURI).length > 0
                ? string(
                    abi.encodePacked(baseURI, StringUtil.uintToString(tokenId))
                )
                : "";
    }

    function approve(address to, uint256 tokenId) public virtual override {
        ERC721Storage.Data storage store = ERC721Storage.load();
        address holder = store.ownerOf[tokenId];

        if (to == holder) {
            revert CannotSelfApprove(to);
        }

        if (
            ERC2771Context._msgSender() != holder &&
            !isApprovedForAll(holder, ERC2771Context._msgSender())
        ) {
            revert AccessError.Unauthorized(ERC2771Context._msgSender());
        }

        ERC721Storage._approve(to, tokenId);
    }

    function getApproved(
        uint256 tokenId
    ) public view virtual override returns (address operator) {
        if (!ERC721Storage._exists(tokenId)) {
            revert TokenDoesNotExist(tokenId);
        }

        return ERC721Storage.load().tokenApprovals[tokenId];
    }

    function setApprovalForAll(
        address operator,
        bool approved
    ) public virtual override {
        if (ERC2771Context._msgSender() == operator) {
            revert CannotSelfApprove(operator);
        }

        ERC721Storage.load().operatorApprovals[ERC2771Context._msgSender()][
                operator
            ] = approved;

        emit ApprovalForAll(ERC2771Context._msgSender(), operator, approved);
    }

    function isApprovedForAll(
        address holder,
        address operator
    ) public view virtual override returns (bool) {
        return ERC721Storage.load().operatorApprovals[holder][operator];
    }

    function transferFrom(
        address from,
        address to,
        uint256 tokenId
    ) public virtual override {
        if (
            !ERC721Storage._isApprovedOrOwner(
                ERC2771Context._msgSender(),
                tokenId
            )
        ) {
            revert AccessError.Unauthorized(ERC2771Context._msgSender());
        }

        ERC721Storage._transfer(from, to, tokenId);
    }

    function safeTransferFrom(
        address from,
        address to,
        uint256 tokenId
    ) public virtual override {
        safeTransferFrom(from, to, tokenId, "");
    }

    function safeTransferFrom(
        address from,
        address to,
        uint256 tokenId,
        bytes memory data
    ) public virtual override {
        if (
            !ERC721Storage._isApprovedOrOwner(
                ERC2771Context._msgSender(),
                tokenId
            )
        ) {
            revert AccessError.Unauthorized(ERC2771Context._msgSender());
        }

        ERC721Storage._transfer(from, to, tokenId);
        if (!ERC721Storage._checkOnERC721Received(from, to, tokenId, data)) {
            revert InvalidTransferRecipient(to);
        }
    }

    ///
    ///
    ///
    /// ERC721Enumerable
    ///
    ///
    ///

    function tokenOfOwnerByIndex(
        address owner,
        uint256 index
    ) public view virtual override returns (uint256) {
        if (balanceOf(owner) <= index) {
            revert IndexOverrun(index, balanceOf(owner));
        }
        return ERC721EnumerableStorage.load().ownedTokens[owner][index];
    }

    /**
     * @dev Returns the total amount of tokens stored by the contract.
     */
    function totalSupply() public view virtual override returns (uint256) {
        return ERC721EnumerableStorage.totalSupply();
    }

    /**
     * @dev Returns the token identifier for the `_index`th NFT
     */
    function tokenByIndex(
        uint256 index
    ) public view virtual override returns (uint256) {
        if (index >= totalSupply()) {
            revert IndexOverrun(index, totalSupply());
        }
        return ERC721EnumerableStorage.load().allTokens[index];
    }
}
