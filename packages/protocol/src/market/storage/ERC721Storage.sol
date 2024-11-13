//SPDX-License-Identifier: MIT
pragma solidity >=0.8.11 <0.9.0;
import "@synthetixio/core-contracts/contracts/utils/AddressUtil.sol";
import "@synthetixio/core-contracts/contracts/utils/StringUtil.sol";
import "@synthetixio/core-contracts/contracts/utils/ERC2771Context.sol";
import "@synthetixio/core-contracts/contracts/errors/AddressError.sol";
import "@synthetixio/core-contracts/contracts/errors/AccessError.sol";
import "@synthetixio/core-contracts/contracts/errors/InitError.sol";
import "@synthetixio/core-contracts/contracts/errors/ParameterError.sol";
import "../interfaces/IERC721.sol";
import "@synthetixio/core-contracts/contracts/interfaces/IERC721Receiver.sol";
import "./ERC721EnumerableStorage.sol";

library ERC721Storage {
    bytes32 private constant _SLOT_ERC721_STORAGE =
        keccak256(abi.encode("io.synthetix.core-contracts.ERC721"));

    struct Data {
        string name;
        string symbol;
        string baseTokenURI;
        mapping(uint256 => address) ownerOf;
        mapping(address => uint256) balanceOf;
        mapping(uint256 => address) tokenApprovals;
        mapping(address => mapping(address => bool)) operatorApprovals;
    }

    function load() internal pure returns (Data storage store) {
        bytes32 s = _SLOT_ERC721_STORAGE;
        assembly {
            store.slot := s
        }
    }

    function _exists(
        Data storage self,
        uint256 tokenId
    ) internal view returns (bool) {
        return self.ownerOf[tokenId] != address(0);
    }

    function _exists(uint256 tokenId) internal view returns (bool) {
        return load().ownerOf[tokenId] != address(0);
    }

    function _ownerOf(uint256 tokenId) internal view returns (address) {
        return load().ownerOf[tokenId];
    }

    function _getApproved(
        uint256 tokenId
    ) internal view returns (address operator) {
        return load().tokenApprovals[tokenId];
    }

    function _getApproved(
        Data storage self,
        uint256 tokenId
    ) internal view returns (address operator) {
        return self.tokenApprovals[tokenId];
    }

    function _isApprovedForAll(
        address holder,
        address operator
    ) internal view returns (bool) {
        return load().operatorApprovals[holder][operator];
    }

    function _isApprovedForAll(
        Data storage self,
        address holder,
        address operator
    ) internal view returns (bool) {
        return self.operatorApprovals[holder][operator];
    }

    function _isApprovedOrOwner(
        address spender,
        uint256 tokenId
    ) internal view returns (bool) {
        address holder = _ownerOf(tokenId);

        // Not checking tokenId existence since it is checked in ownerOf() and getApproved()

        return (spender == holder ||
            _getApproved(tokenId) == spender ||
            _isApprovedForAll(holder, spender));
    }

    function _mint(address to, uint256 tokenId) internal {
        Data storage store = load();
        if (to == address(0)) {
            revert AddressError.ZeroAddress();
        }

        if (tokenId == 0) {
            revert ParameterError.InvalidParameter("tokenId", "cannot be zero");
        }

        if (_exists(tokenId)) {
            revert IERC721Foil.TokenAlreadyMinted(tokenId);
        }

        store.balanceOf[to] += 1;
        store.ownerOf[tokenId] = to;

        emit IERC721Foil.Transfer(address(0), to, tokenId);

        _enumarebleTransfer(address(0), to, tokenId);
    }

    function _burn(uint256 tokenId) internal {
        Data storage store = load();
        address holder = store.ownerOf[tokenId];

        _approve(address(0), tokenId);

        store.balanceOf[holder] -= 1;
        delete store.ownerOf[tokenId];

        emit IERC721Foil.Transfer(holder, address(0), tokenId);

        _enumarebleTransfer(holder, address(0), tokenId);
    }

    function _transfer(address from, address to, uint256 tokenId) internal {
        Data storage store = load();

        if (_ownerOf(tokenId) != from) {
            revert AccessError.Unauthorized(from);
        }

        if (to == address(0)) {
            revert AddressError.ZeroAddress();
        }

        // Clear approvals from the previous holder
        _approve(address(0), tokenId);

        store.balanceOf[from] -= 1;
        store.balanceOf[to] += 1;
        store.ownerOf[tokenId] = to;

        emit IERC721Foil.Transfer(from, to, tokenId);

        _enumarebleTransfer(from, to, tokenId);
    }

    function _approve(address to, uint256 tokenId) internal {
        load().tokenApprovals[tokenId] = to;
        emit IERC721Foil.Approval(_ownerOf(tokenId), to, tokenId);
    }

    function _checkOnERC721Received(
        address from,
        address to,
        uint256 tokenId,
        bytes memory data
    ) internal returns (bool) {
        if (AddressUtil.isContract(to)) {
            try
                IERC721Receiver(to).onERC721Received(
                    ERC2771Context._msgSender(),
                    from,
                    tokenId,
                    data
                )
            returns (bytes4 retval) {
                return retval == IERC721Receiver.onERC721Received.selector;
            } catch {
                return false;
            }
        } else {
            return true;
        }
    }

    function _enumarebleTransfer(
        address from,
        address to,
        uint256 tokenId
    ) internal {
        if (from == address(0)) {
            ERC721EnumerableStorage._addTokenToAllTokensEnumeration(tokenId);
        } else if (from != to) {
            ERC721EnumerableStorage._removeTokenFromOwnerEnumeration(
                from,
                tokenId
            );
        }
        if (to == address(0)) {
            ERC721EnumerableStorage._removeTokenFromAllTokensEnumeration(
                tokenId
            );
        } else if (to != from) {
            ERC721EnumerableStorage._addTokenToOwnerEnumeration(to, tokenId);
        }
    }

    function _initialize(
        string memory tokenName,
        string memory tokenSymbol,
        string memory baseTokenURI
    ) internal {
        Data storage store = load();
        if (
            bytes(store.name).length > 0 ||
            bytes(store.symbol).length > 0 ||
            bytes(store.baseTokenURI).length > 0
        ) {
            revert InitError.AlreadyInitialized();
        }

        if (bytes(tokenName).length == 0 || bytes(tokenSymbol).length == 0) {
            revert ParameterError.InvalidParameter(
                "name/symbol",
                "must not be empty"
            );
        }

        store.name = tokenName;
        store.symbol = tokenSymbol;
        store.baseTokenURI = baseTokenURI;
    }
}
