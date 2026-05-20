// SPDX-License-Identifier: MIT
pragma solidity ^0.8.19;

import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/token/ERC721/ERC721.sol";

import "./IEntropy.sol";

/// @title BingoCard
/// @notice ERC-721. Mint pays the Pyth Entropy fee and gets back a tokenId.
///         Once the entropy callback lands, `randomNumberOf(tokenId)` is set
///         and the card is considered rolled. How that random number maps to
///         picks, lines, bonuses, etc. is decided off-contract for now.
contract BingoCard is ERC721, IEntropyConsumer, Ownable {
    IEntropy public immutable entropy;
    address public immutable entropyProvider;

    uint256 private _nextTokenId = 1;

    mapping(uint256 => bytes32) public randomNumberOf;
    mapping(uint64 => uint256) private _tokenIdBySequence;

    event CardMinted(
        uint256 indexed tokenId, address indexed owner, uint64 sequenceNumber
    );
    event CardRolled(uint256 indexed tokenId, bytes32 randomNumber);

    error InsufficientEntropyFee();
    error RefundFailed();
    error UnknownSequence();
    error AlreadyRolled();

    constructor(address entropy_, address entropyProvider_, address owner_)
        ERC721("Sapience Bingo Card", "BINGO")
        Ownable(owner_)
    {
        entropy = IEntropy(entropy_);
        entropyProvider = entropyProvider_;
    }

    /// @notice Mint a new card. Pay at least `entropyFee()`; excess is refunded.
    function mint(bytes32 userRandomNumber)
        external
        payable
        returns (uint256 tokenId)
    {
        uint128 fee = entropy.getFeeV2(entropyProvider);
        if (msg.value < fee) revert InsufficientEntropyFee();

        tokenId = _nextTokenId++;
        _safeMint(msg.sender, tokenId);

        uint64 sequenceNumber = entropy.requestWithCallback{ value: fee }(
            entropyProvider, userRandomNumber
        );
        _tokenIdBySequence[sequenceNumber] = tokenId;

        emit CardMinted(tokenId, msg.sender, sequenceNumber);

        if (msg.value > fee) {
            (bool ok,) = msg.sender.call{ value: msg.value - fee }("");
            if (!ok) revert RefundFailed();
        }
    }

    function entropyFee() external view returns (uint128) {
        return entropy.getFeeV2(entropyProvider);
    }

    function getEntropy() public view override returns (address) {
        return address(entropy);
    }

    function _entropyCallback(
        uint64 sequenceNumber,
        address, /* provider */
        bytes32 randomNumber
    ) internal override {
        uint256 tokenId = _tokenIdBySequence[sequenceNumber];
        if (tokenId == 0) revert UnknownSequence();
        if (randomNumberOf[tokenId] != bytes32(0)) revert AlreadyRolled();

        randomNumberOf[tokenId] = randomNumber;
        delete _tokenIdBySequence[sequenceNumber];

        emit CardRolled(tokenId, randomNumber);
    }
}
