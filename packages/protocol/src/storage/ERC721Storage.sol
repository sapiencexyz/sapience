//SPDX-License-Identifier: MIT
pragma solidity >=0.8.11 <0.9.0;
import "../synthetix/utils/AddressUtil.sol";
import "../synthetix/utils/StringUtil.sol";
import "../synthetix/utils/ERC2771Context.sol";
import "../synthetix/errors/AddressError.sol";
import "../synthetix/errors/AccessError.sol";
import "../synthetix/errors/InitError.sol";
import "../synthetix/errors/ParameterError.sol";
import "../interfaces/IERC721.sol";
import "../synthetix/interfaces/IERC721Receiver.sol";

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
        return ERC721Storage.load().ownerOf[tokenId] != address(0);
    }

    function _ownerOf(uint256 tokenId) internal view returns (address) {
        return ERC721Storage.load().ownerOf[tokenId];
    }

    function _getApproved(
        uint256 tokenId
    ) internal view returns (address operator) {
        return ERC721Storage.load().tokenApprovals[tokenId];
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
        return ERC721Storage.load().operatorApprovals[holder][operator];
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
        ERC721Storage.Data storage store = ERC721Storage.load();
        if (to == address(0)) {
            revert AddressError.ZeroAddress();
        }

        if (tokenId == 0) {
            revert ParameterError.InvalidParameter("tokenId", "cannot be zero");
        }

        if (_exists(tokenId)) {
            revert IERC721.TokenAlreadyMinted(tokenId);
        }

        _beforeTransfer(address(0), to, tokenId);

        store.balanceOf[to] += 1;
        store.ownerOf[tokenId] = to;

        _postTransfer(address(0), to, tokenId);

        emit IERC721.Transfer(address(0), to, tokenId);
    }

    function _burn(uint256 tokenId) internal {
        ERC721Storage.Data storage store = ERC721Storage.load();
        address holder = store.ownerOf[tokenId];

        _approve(address(0), tokenId);

        _beforeTransfer(holder, address(0), tokenId);

        store.balanceOf[holder] -= 1;
        delete store.ownerOf[tokenId];

        _postTransfer(holder, address(0), tokenId);

        emit IERC721.Transfer(holder, address(0), tokenId);
    }

    function _transfer(address from, address to, uint256 tokenId) internal {
        ERC721Storage.Data storage store = ERC721Storage.load();

        if (_ownerOf(tokenId) != from) {
            revert AccessError.Unauthorized(from);
        }

        if (to == address(0)) {
            revert AddressError.ZeroAddress();
        }

        _beforeTransfer(from, to, tokenId);

        // Clear approvals from the previous holder
        _approve(address(0), tokenId);

        store.balanceOf[from] -= 1;
        store.balanceOf[to] += 1;
        store.ownerOf[tokenId] = to;

        _postTransfer(from, to, tokenId);

        emit IERC721.Transfer(from, to, tokenId);
    }

    function _approve(address to, uint256 tokenId) internal {
        ERC721Storage.load().tokenApprovals[tokenId] = to;
        emit IERC721.Approval(_ownerOf(tokenId), to, tokenId);
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

    function _beforeTransfer(
        address from,
        address to,
        uint256 tokenId // solhint-disable-next-line no-empty-blocks
    ) internal {}

    function _postTransfer(
        address from,
        address to,
        uint256 tokenId // solhint-disable-next-line no-empty-blocks
    ) internal {}

    function _initialize(
        string memory tokenName,
        string memory tokenSymbol,
        string memory baseTokenURI
    ) internal {
        ERC721Storage.Data storage store = ERC721Storage.load();
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
