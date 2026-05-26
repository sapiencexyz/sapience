// SPDX-License-Identifier: MIT
pragma solidity ^0.8.19;

import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import "@openzeppelin/contracts/access/Ownable.sol";

/**
 * @title BingoCard
 * @notice Bingo-style cards backed by a sponsored line-stakes balance.
 *         A user pays `perLineStake * 10` to mint a card; the contract holds
 *         that balance and acts as IMintSponsor for the per-line escrow mints.
 *         Winning lines roll a random draw from a sponsor-funded bonus pool.
 *         Referrers earn a fixed bps cut from the same bonus pool, credited
 *         only when the referred player fills all 10 lines on a card.
 *
 *         This file is the first slice: storage + admin scaffolding only.
 *         Mint flow, Pyth callback, IMintSponsor, and bonus draws follow.
 */
contract BingoCard is Ownable {
    using SafeERC20 for IERC20;

    // ============ Types ============

    struct Card {
        address player;
        bytes32 refCode;
        uint32 poolVersion;
        uint64 mintedAt;
        uint64 expiresAt;
        uint256 sponsorBalance;
        /// @dev Card price stamped at mint time so admin changes to `cardPrice`
        ///      don't retroactively alter referral payouts or refund math.
        uint256 cardPriceAtMint;
        /// @dev Referral bps stamped at mint time, same reason.
        uint16 referralBpsAtMint;
        bool revealed;
        uint16 filledLineBitmap;
        bytes32[16] conditionIds;
        address[16] resolvers;
    }

    // ============ Constants ============

    uint256 public constant BPS = 10_000;
    uint8 public constant CELLS_PER_CARD = 16;
    uint8 public constant LINES_PER_CARD = 10;

    // ============ Immutables ============

    IERC20 public immutable collateralToken;

    // ============ Storage: pool ============

    bytes32[] public poolConditionIds;
    address[] public poolResolvers;
    uint32 public poolVersion;

    // ============ Storage: cards ============

    mapping(uint256 => Card) internal _cards;
    uint256 public nextCardId;

    // ============ Storage: bonus + referrals ============

    /// @notice Sponsor-funded pool used for both per-winning-line draws and
    ///         referrer payouts. Single budget, two outflows.
    uint256 public bonusPool;

    mapping(bytes32 => address) public referrerOf;
    mapping(address => uint256) public referralEarnings;

    // ============ Storage: config ============

    /// @notice Card price. Per-line stake is derived as cardPrice / 10.
    uint256 public cardPrice;

    /// @notice Referrer cut of card price, in bps. e.g. 200 = 2%.
    uint16 public referralBps;

    /// @notice Time from mint until `withdrawUnused` can sweep leftover balance.
    uint64 public cardExpirySeconds;

    // ============ Events ============

    event PoolSet(uint32 indexed version, uint256 size);
    event CardPriceSet(uint256 cardPrice);
    event ReferralBpsSet(uint16 bps);
    event CardExpirySet(uint64 cardExpirySeconds);
    event BonusDeposited(address indexed from, uint256 amount, uint256 newPool);
    event BonusWithdrawn(address indexed to, uint256 amount, uint256 newPool);

    // ============ Errors ============

    error PoolArrayMismatch();
    error PoolTooSmall();
    error InsufficientBonusPool();
    error CardPriceTooLow();
    error CardNotFound();

    // ============ Constructor ============

    constructor(address collateralToken_, address owner_) Ownable(owner_) {
        collateralToken = IERC20(collateralToken_);
    }

    // ============ Admin: pool ============

    /// @notice Replaces the active pool of conditions cards can draw from.
    function setPool(
        bytes32[] calldata conditionIds,
        address[] calldata resolvers
    )
        external
        onlyOwner
    {
        if (conditionIds.length != resolvers.length) {
            revert PoolArrayMismatch();
        }
        if (conditionIds.length < CELLS_PER_CARD) revert PoolTooSmall();
        poolConditionIds = conditionIds;
        poolResolvers = resolvers;
        unchecked {
            poolVersion++;
        }
        emit PoolSet(poolVersion, conditionIds.length);
    }

    function poolSize() external view returns (uint256) {
        return poolConditionIds.length;
    }

    // ============ Admin: config ============

    function setCardPrice(uint256 cardPrice_) external onlyOwner {
        if (cardPrice_ < LINES_PER_CARD) revert CardPriceTooLow();
        cardPrice = cardPrice_;
        emit CardPriceSet(cardPrice_);
    }

    function setReferralBps(uint16 bps) external onlyOwner {
        referralBps = bps;
        emit ReferralBpsSet(bps);
    }

    function setCardExpiry(uint64 cardExpirySeconds_) external onlyOwner {
        cardExpirySeconds = cardExpirySeconds_;
        emit CardExpirySet(cardExpirySeconds_);
    }

    /// @notice Per-line stake is fully derived from card price — no spread.
    function perLineStake() public view returns (uint256) {
        return cardPrice / LINES_PER_CARD;
    }

    // ============ Admin: bonus pool ============

    /// @notice Anyone can fund the bonus pool. Sponsor's growth budget.
    function depositBonus(uint256 amount) external {
        collateralToken.safeTransferFrom(msg.sender, address(this), amount);
        bonusPool += amount;
        emit BonusDeposited(msg.sender, amount, bonusPool);
    }

    /// @notice Owner withdraws unspent bonus funds.
    function withdrawBonus(uint256 amount, address to) external onlyOwner {
        if (amount > bonusPool) revert InsufficientBonusPool();
        bonusPool -= amount;
        collateralToken.safeTransfer(to, amount);
        emit BonusWithdrawn(to, amount, bonusPool);
    }

    /// @notice Sweeps tokens not tracked by `bonusPool` or card sponsor
    ///         balances. Recovers stray deposits sent directly to the contract.
    /// @dev For the collateral token, refuses to touch `bonusPool` funds; for
    ///      other tokens, transfers `amount` in full.
    function rescueTokens(IERC20 token, address to, uint256 amount)
        external
        onlyOwner
    {
        if (address(token) == address(collateralToken)) {
            uint256 balance = token.balanceOf(address(this));
            // Reserve the tracked bonus pool. Future slices will also reserve
            // outstanding per-card sponsor balances here.
            uint256 reserved = bonusPool;
            if (balance < reserved || amount > balance - reserved) {
                revert InsufficientBonusPool();
            }
        }
        token.safeTransfer(to, amount);
    }

    // ============ Reads: cards ============

    /// @notice Returns the full card struct. Reverts if the card has not been
    ///         minted (player is the zero address).
    function cardOf(uint256 cardId) external view returns (Card memory) {
        Card memory c = _cards[cardId];
        if (c.player == address(0)) revert CardNotFound();
        return c;
    }
}
