// SPDX-License-Identifier: MIT
pragma solidity ^0.8.19;

import "@openzeppelin/contracts/token/ERC721/ERC721.sol";
import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import "@openzeppelin/contracts/access/Ownable.sol";

/**
 * @title BingoCardReceipt
 * @notice On-chain receipt + payout rail for COMBO.BINGO cards. The game
 *         itself runs through the bingo-server: it deals each card from a
 *         committed fairness seed, runs the RFQ auctions, and mints the
 *         escrow positions as the player via a scoped session key. This
 *         contract is the public record of that game:
 *
 *         - The backend (minter) mints one receipt NFT per
 *           (pool, player, cardIndex) when a card is submitted — indexes
 *           strictly sequential per wallet — stamping the fairness seed,
 *           declared sides, card price, and referrer.
 *         - Bonus payouts go to the NFT's current owner — the claim is
 *           transferable. Referral payouts go to the stamped referrer.
 *         - `payBonus` / `payReferral` move USDe from the treasury
 *           (the caller) through the contract in the same transaction and
 *           set one-shot paid flags, so payouts are idempotent and publicly
 *           auditable via events.
 *
 *         The contract never holds user funds, prize pools, or stakes —
 *         there is nothing at rest to drain.
 */
contract BingoCardReceipt is ERC721, Ownable {
    using SafeERC20 for IERC20;

    // ============ Types ============

    struct CardMeta {
        /// @dev keccak256(utf8(poolId)) — the human-readable id is in the
        ///      mint event.
        bytes32 poolHash;
        /// @dev The fairness seed the card layout derives from:
        ///      keccak256(poolSecret ‖ utf8(poolId) ‖ player ‖
        ///      uint32(cardIndex)). Verifiable once the pool's secret is
        ///      revealed after cutoff.
        bytes32 seed;
        /// @dev Referrer payout address; zero = no referral.
        address referrer;
        uint64 submittedAt;
        /// @dev Declared sides: bit i = YES on cell i.
        uint16 yesMask;
        /// @dev Which of the player's cards in this pool this is (0-based,
        ///      strictly sequential).
        uint32 cardIndex;
        /// @dev Card price (10 line stakes) in payout-token wei.
        uint256 cardPrice;
        bool bonusPaid;
        bool referralPaid;
    }

    // ============ Storage ============

    IERC20 public immutable payoutToken;

    /// @notice Backend hot wallet allowed to mint receipts.
    address public minter;

    uint256 public nextId;
    mapping(uint256 => CardMeta) public cardMeta;

    /// @notice How many cards a player holds in a pool. Card indexes are
    ///         strictly sequential, so this is also the next mintable index.
    mapping(bytes32 => mapping(address => uint256)) public cardCount;

    /// @notice Receipt token id per (pool, player, cardIndex); 0 = unminted.
    mapping(bytes32 => mapping(address => mapping(uint32 => uint256))) public
        tokenOfPlayerPoolIndex;

    string public baseURI;

    // ============ Events ============

    event MinterSet(address indexed minter);
    event BaseURISet(string baseURI);
    event CardReceiptMinted(
        uint256 indexed tokenId,
        address indexed player,
        bytes32 indexed poolHash,
        string poolId,
        uint32 cardIndex,
        bytes32 seed,
        uint16 yesMask,
        uint256 cardPrice,
        address referrer
    );
    event BonusPaid(
        uint256 indexed tokenId, address indexed to, uint8 wins, uint256 amount
    );
    event ReferralPaid(
        uint256 indexed tokenId, address indexed referrer, uint256 amount
    );

    // ============ Errors ============

    error NotMinter();
    /// @dev Card indexes are strictly sequential per (pool, player); a
    ///      replayed index means "already minted", a skipped one is invalid.
    error CardIndexMismatch(uint32 expected);
    error AlreadyPaid();
    error NoReferrer();

    // ============ Constructor ============

    constructor(address payoutToken_, address owner_)
        ERC721("COMBO.BINGO Card", "BINGO")
        Ownable(owner_)
    {
        payoutToken = IERC20(payoutToken_);
    }

    // ============ Admin ============

    function setMinter(address minter_) external onlyOwner {
        minter = minter_;
        emit MinterSet(minter_);
    }

    function setBaseURI(string calldata baseURI_) external onlyOwner {
        baseURI = baseURI_;
        emit BaseURISet(baseURI_);
    }

    function _baseURI() internal view override returns (string memory) {
        return baseURI;
    }

    // ============ Mint (backend) ============

    /// @notice Mints the receipt for a submitted card to the player.
    ///         Backend-only; called once per (pool, player, cardIndex) at
    ///         submission time, when sides and price are locked. Indexes are
    ///         strictly sequential — a retry of an already-minted index
    ///         reverts, which is the backend's idempotency backstop.
    function mint(
        address player,
        string calldata poolId,
        uint32 cardIndex,
        bytes32 seed,
        uint16 yesMask,
        uint256 cardPrice,
        address referrer
    ) external returns (uint256 tokenId) {
        if (msg.sender != minter && msg.sender != owner()) {
            revert NotMinter();
        }
        bytes32 poolHash = keccak256(bytes(poolId));
        uint256 expected = cardCount[poolHash][player];
        if (cardIndex != expected) {
            revert CardIndexMismatch(uint32(expected));
        }

        tokenId = ++nextId;
        cardCount[poolHash][player] = uint256(cardIndex) + 1;
        tokenOfPlayerPoolIndex[poolHash][player][cardIndex] = tokenId;
        cardMeta[tokenId] = CardMeta({
            poolHash: poolHash,
            seed: seed,
            referrer: referrer,
            submittedAt: uint64(block.timestamp),
            yesMask: yesMask,
            cardIndex: cardIndex,
            cardPrice: cardPrice,
            bonusPaid: false,
            referralPaid: false
        });
        _safeMint(player, tokenId);
        emit CardReceiptMinted(
            tokenId,
            player,
            poolHash,
            poolId,
            cardIndex,
            seed,
            yesMask,
            cardPrice,
            referrer
        );
    }

    // ============ Payouts (treasury) ============

    /// @notice Pays the card's bonus to the NFT's CURRENT owner, pulling
    ///         `amount` of the payout token from the caller (the treasury).
    ///         One-shot per card. `wins` is informational, for the audit
    ///         trail — the amount is computed off-chain against the
    ///         published multiplier table.
    function payBonus(uint256 tokenId, uint8 wins, uint256 amount)
        external
        onlyOwner
    {
        CardMeta storage meta = cardMeta[tokenId];
        if (meta.bonusPaid) revert AlreadyPaid();
        meta.bonusPaid = true;
        address to = ownerOf(tokenId); // reverts if not minted
        payoutToken.safeTransferFrom(msg.sender, to, amount);
        emit BonusPaid(tokenId, to, wins, amount);
    }

    /// @notice Pays the card's referral cut to the stamped referrer, pulling
    ///         `amount` of the payout token from the caller. One-shot.
    function payReferral(uint256 tokenId, uint256 amount) external onlyOwner {
        CardMeta storage meta = cardMeta[tokenId];
        _requireOwned(tokenId);
        if (meta.referrer == address(0)) revert NoReferrer();
        if (meta.referralPaid) revert AlreadyPaid();
        meta.referralPaid = true;
        payoutToken.safeTransferFrom(msg.sender, meta.referrer, amount);
        emit ReferralPaid(tokenId, meta.referrer, amount);
    }
}
