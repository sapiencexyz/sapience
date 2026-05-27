// SPDX-License-Identifier: MIT
pragma solidity ^0.8.19;

import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import "@openzeppelin/contracts/access/Ownable.sol";

import "../interfaces/IConditionResolver.sol";
import "../interfaces/IMintSponsor.sol";
import "../interfaces/IV2Types.sol";
import "./IEntropy.sol";

/**
 * @title BingoCard
 * @notice Bingo-style cards backed by a sponsored line-stakes balance.
 *         A user pays `cardPrice` to mint a card; the contract holds that
 *         balance and acts as IMintSponsor for the per-line escrow mints
 *         (one mint per line, each pulling `cardPrice / LINES_PER_CARD`).
 *         Winning lines roll a random draw from a sponsor-funded bonus pool.
 *         Referrers earn a fixed bps cut from the bonus pool, credited only
 *         when the referred player fills all 10 lines on a card.
 */
contract BingoCard is Ownable, IEntropyConsumer, IMintSponsor {
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
        bool referrerPaid;
        /// @dev True once the player has declared their YES/NO choice on each
        ///      of the 16 cells. fundMint reverts until this is set.
        bool sidesDeclared;
        uint16 filledLineBitmap;
        /// @dev Bit i: 1 = YES, 0 = NO for cell i. Only meaningful once
        ///      `sidesDeclared` is true.
        uint16 cellSides;
        bytes32[16] conditionIds;
        address[16] resolvers;
    }

    // ============ Constants ============

    uint256 public constant BPS = 10_000;
    uint8 public constant CELLS_PER_CARD = 16;
    uint8 public constant CELLS_PER_LINE = 4;
    uint8 public constant LINES_PER_CARD = 10;
    /// @dev Bitmap with bits 0..LINES_PER_CARD-1 set. Card is complete when
    ///      `filledLineBitmap == COMPLETE_BITMAP`.
    uint16 internal constant COMPLETE_BITMAP =
        uint16((1 << LINES_PER_CARD) - 1);

    // ============ Immutables ============

    IERC20 public immutable collateralToken;
    IEntropy public immutable entropy;
    address public immutable entropyProvider;

    // ============ Storage: pool ============

    bytes32[] public poolConditionIds;
    address[] public poolResolvers;
    uint32 public poolVersion;

    // ============ Storage: cards ============

    mapping(uint256 => Card) internal _cards;
    uint256 public nextCardId;

    /// @notice Sum of `card.sponsorBalance` across all cards. Reserved from
    ///         `rescueTokens` so admin can't drain in-flight line stakes.
    uint256 public outstandingSponsorBalance;

    /// @dev Map a pending entropy sequence to the cardId it reveals.
    mapping(uint64 => uint256) public pendingReveal;

    /// @dev Snapshot of pool at mint time, kept until reveal so admin
    ///      `setPool` calls don't corrupt in-flight draws.
    mapping(uint256 => bytes32[]) internal _cardPoolCondIds;
    mapping(uint256 => address[]) internal _cardPoolResolvers;

    // ============ Storage: bonus + referrals ============

    /// @notice Sponsor-funded pool used for both per-winning-line draws and
    ///         referrer payouts. Single budget, two outflows.
    uint256 public bonusPool;

    /// @notice Sum of `referralEarnings` across referrers. Reserved from
    ///         `rescueTokens` like outstandingSponsorBalance.
    uint256 public outstandingReferralEarnings;

    mapping(bytes32 => address) public referrerOf;
    mapping(address => uint256) public referralEarnings;

    // ============ Storage: config ============

    /// @notice Card price. Per-line stake is derived as cardPrice / 10.
    uint256 public cardPrice;

    /// @notice Referrer cut of card price, in bps. e.g. 200 = 2%.
    uint16 public referralBps;

    /// @notice Time from mint until `withdrawUnused` can sweep leftover balance.
    uint64 public cardExpirySeconds;

    /// @notice Authorized escrow that may call `fundMint`. Set by owner.
    address public escrow;

    /// @notice Bonus multiplier in bps indexed by winning-line count (0..10).
    ///         e.g. `multiplierBps(2) == 11_000` → 1.1x of `cardPrice` paid
    ///         out when 2 of the funded lines win.
    uint16[11] public multiplierBps;

    /// @notice True once `claimBonus` has paid out the bonus for a card.
    mapping(uint256 => bool) public bonusClaimed;

    // ============ Events ============

    event PoolSet(uint32 indexed version, uint256 size);
    event CardPriceSet(uint256 cardPrice);
    event ReferralBpsSet(uint16 bps);
    event CardExpirySet(uint64 cardExpirySeconds);
    event EscrowSet(address indexed escrow);
    event BonusDeposited(address indexed from, uint256 amount, uint256 newPool);
    event BonusWithdrawn(address indexed to, uint256 amount, uint256 newPool);
    event CodeRegistered(bytes32 indexed code, address indexed referrer);
    event ReferralEarningsClaimed(
        address indexed referrer, address indexed to, uint256 amount
    );
    event CardMinted(
        uint256 indexed cardId,
        address indexed player,
        bytes32 refCode,
        uint64 sequenceNumber
    );
    event CardRevealed(uint256 indexed cardId, bytes32 randomNumber);
    event LineFunded(
        uint256 indexed cardId,
        uint8 indexed lineIndex,
        uint256 stake,
        uint16 filledBitmap
    );
    event CardCompleted(uint256 indexed cardId, address indexed referrer);
    event ReferralCredited(
        address indexed referrer, uint256 indexed cardId, uint256 amount
    );
    event UnusedWithdrawn(
        uint256 indexed cardId, address indexed to, uint256 amount
    );
    event SidesDeclared(uint256 indexed cardId, uint16 yesMask);
    event MultipliersSet(uint16[11] bps);
    event BonusClaimed(
        uint256 indexed cardId,
        address indexed player,
        uint8 winCount,
        uint256 payout
    );

    // ============ Errors ============

    error PoolArrayMismatch();
    error PoolTooSmall();
    error InsufficientBonusPool();
    error CardPriceTooLow();
    error CardNotFound();
    error InvalidCode();
    error CodeTaken();
    error NothingToClaim();
    error InsufficientEntropyFee();
    error RefundFailed();
    error UnknownSequence();
    error AlreadyRevealed();
    error UnauthorizedEscrow();
    error CardNotRevealed();
    error PlayerMismatch();
    error StakeMismatch();
    error NoMatchingLine();
    error LineAlreadyFilled();
    error InvalidSponsorData();
    error CardNotExpired();
    error NothingToWithdraw();
    error BonusAlreadyClaimed();
    error CardNotComplete();
    error SidesNotDeclared();
    error SidesAlreadyDeclared();
    error SideMismatch();

    // ============ Constructor ============

    constructor(
        address collateralToken_,
        address entropy_,
        address entropyProvider_,
        address owner_
    ) Ownable(owner_) {
        collateralToken = IERC20(collateralToken_);
        entropy = IEntropy(entropy_);
        entropyProvider = entropyProvider_;
    }

    // ============ Admin: pool ============

    /// @notice Replaces the active pool of conditions cards can draw from.
    function setPool(
        bytes32[] calldata conditionIds,
        address[] calldata resolvers
    ) external onlyOwner {
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

    function setEscrow(address escrow_) external onlyOwner {
        escrow = escrow_;
        emit EscrowSet(escrow_);
    }

    /// @notice Replace the full multiplier table in one call. Each slot is
    ///         in bps where `10_000 == 1x`. Slot index = winning-line count.
    function setMultipliers(uint16[11] calldata bps) external onlyOwner {
        multiplierBps = bps;
        emit MultipliersSet(bps);
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

    /// @notice Sweeps tokens not tracked by `bonusPool`, outstanding sponsor
    ///         balances, or outstanding referral earnings. Recovers stray
    ///         deposits sent directly to the contract.
    /// @dev For the collateral token, refuses to touch tracked balances;
    ///      for other tokens, transfers `amount` in full.
    function rescueTokens(IERC20 token, address to, uint256 amount)
        external
        onlyOwner
    {
        if (address(token) == address(collateralToken)) {
            uint256 balance = token.balanceOf(address(this));
            uint256 reserved = bonusPool + outstandingSponsorBalance
                + outstandingReferralEarnings;
            if (balance < reserved || amount > balance - reserved) {
                revert InsufficientBonusPool();
            }
        }
        token.safeTransfer(to, amount);
    }

    // ============ Referrers ============

    /// @notice First-come-first-served: any address may claim an unused code.
    function registerCode(bytes32 code) external {
        if (code == bytes32(0)) revert InvalidCode();
        if (referrerOf[code] != address(0)) revert CodeTaken();
        referrerOf[code] = msg.sender;
        emit CodeRegistered(code, msg.sender);
    }

    /// @notice Referrer claims accrued earnings to `to`.
    function claimReferralEarnings(address to) external {
        uint256 amount = referralEarnings[msg.sender];
        if (amount == 0) revert NothingToClaim();
        referralEarnings[msg.sender] = 0;
        outstandingReferralEarnings -= amount;
        collateralToken.safeTransfer(to, amount);
        emit ReferralEarningsClaimed(msg.sender, to, amount);
    }

    // ============ Mint ============

    /// @notice Pyth Entropy fee currently required for a mint, in wei.
    function entropyFee() external view returns (uint128) {
        return entropy.getFeeV2(entropyProvider);
    }

    /// @notice Mint a new card. Pulls `cardPrice` collateral from `msg.sender`
    ///         (must be pre-approved) and pays the Pyth Entropy fee out of
    ///         `msg.value`. Excess ETH is refunded. Returns the cardId.
    /// @param refCode Optional referral code; pass bytes32(0) for none.
    function mintCard(bytes32 refCode) external payable returns (uint256) {
        if (cardPrice < LINES_PER_CARD) revert CardPriceTooLow();
        uint256 size = poolConditionIds.length;
        if (size < CELLS_PER_CARD) revert PoolTooSmall();

        uint128 fee = entropy.getFeeV2(entropyProvider);
        if (msg.value < fee) revert InsufficientEntropyFee();

        uint256 cardId = ++nextCardId;
        uint256 price = cardPrice;
        uint16 bps = referralBps;

        Card storage c = _cards[cardId];
        c.player = msg.sender;
        c.refCode = refCode;
        c.poolVersion = poolVersion;
        c.mintedAt = uint64(block.timestamp);
        c.expiresAt = uint64(block.timestamp) + cardExpirySeconds;
        c.sponsorBalance = price;
        c.cardPriceAtMint = price;
        c.referralBpsAtMint = bps;

        outstandingSponsorBalance += price;

        // Snapshot the pool so reveal is independent of later admin changes.
        bytes32[] storage condIds = _cardPoolCondIds[cardId];
        address[] storage resolvers = _cardPoolResolvers[cardId];
        for (uint256 i = 0; i < size; i++) {
            condIds.push(poolConditionIds[i]);
            resolvers.push(poolResolvers[i]);
        }

        collateralToken.safeTransferFrom(msg.sender, address(this), price);

        uint64 seq = entropy.requestWithCallback{ value: fee }(
            entropyProvider, bytes32(cardId)
        );
        pendingReveal[seq] = cardId;

        emit CardMinted(cardId, msg.sender, refCode, seq);

        if (msg.value > fee) {
            (bool ok,) = msg.sender.call{ value: msg.value - fee }("");
            if (!ok) revert RefundFailed();
        }

        return cardId;
    }

    // ============ IMintSponsor ============

    /// @inheritdoc IMintSponsor
    /// @dev `sponsorData` is the abi-encoded `uint256 cardId`. The bingo
    ///      contract derives the line index from `request.picks` by matching
    ///      against the card's revealed cell layout.
    function fundMint(address escrow_, IV2Types.MintRequest calldata request)
        external
        override
    {
        if (msg.sender != escrow) revert UnauthorizedEscrow();
        if (request.predictorSponsorData.length != 32) {
            revert InvalidSponsorData();
        }
        uint256 cardId = abi.decode(request.predictorSponsorData, (uint256));

        Card storage c = _cards[cardId];
        if (c.player == address(0)) revert CardNotFound();
        if (!c.revealed) revert CardNotRevealed();
        if (request.predictor != c.player) revert PlayerMismatch();

        if (!c.sidesDeclared) revert SidesNotDeclared();

        uint256 stake = c.cardPriceAtMint / LINES_PER_CARD;
        if (request.predictorCollateral != stake) revert StakeMismatch();
        if (request.picks.length != CELLS_PER_LINE) revert NoMatchingLine();

        uint8 lineIndex = _matchLine(c, request.picks);
        uint16 lineBit = uint16(1 << lineIndex);
        if (c.filledLineBitmap & lineBit != 0) revert LineAlreadyFilled();

        // Each pick must match the side the player declared for that cell.
        uint8[CELLS_PER_LINE] memory cells = _lineCells(lineIndex);
        for (uint256 i = 0; i < CELLS_PER_LINE; i++) {
            bool storedYes = (c.cellSides & uint16(1 << cells[i])) != 0;
            bool predictedYes =
                request.picks[i].predictedOutcome == IV2Types.OutcomeSide.YES;
            if (storedYes != predictedYes) revert SideMismatch();
        }

        c.sponsorBalance -= stake;
        outstandingSponsorBalance -= stake;
        c.filledLineBitmap |= lineBit;

        collateralToken.safeTransfer(escrow_, stake);

        emit LineFunded(cardId, lineIndex, stake, c.filledLineBitmap);

        if (c.filledLineBitmap == COMPLETE_BITMAP) {
            _onCardCompleted(cardId, c);
        }
    }

    /// @dev Find which of the 10 canonical lines the supplied picks describe,
    ///      in cell order. Reverts if no line matches in the given order.
    function _matchLine(Card storage c, IV2Types.Pick[] calldata picks)
        internal
        view
        returns (uint8)
    {
        for (uint8 line = 0; line < LINES_PER_CARD; line++) {
            uint8[CELLS_PER_LINE] memory cells = _lineCells(line);
            bool ok = true;
            for (uint256 i = 0; i < CELLS_PER_LINE; i++) {
                uint8 cell = cells[i];
                if (picks[i].conditionResolver != c.resolvers[cell]) {
                    ok = false;
                    break;
                }
                if (!_bytesEqBytes32(
                        picks[i].conditionId, c.conditionIds[cell]
                    )) {
                    ok = false;
                    break;
                }
            }
            if (ok) return line;
        }
        revert NoMatchingLine();
    }

    /// @notice Public view of the canonical 4x4 bingo grid lines.
    function lineCells(uint8 lineIndex)
        external
        pure
        returns (uint8[CELLS_PER_LINE] memory)
    {
        return _lineCells(lineIndex);
    }

    function _lineCells(uint8 lineIndex)
        internal
        pure
        returns (uint8[CELLS_PER_LINE] memory cells)
    {
        // Lines 0..3: rows (left-to-right). Line k = cells [4k .. 4k+3].
        // Lines 4..7: cols (top-to-bottom). Line 4+k = cells [k, k+4, k+8, k+12].
        // Line 8: TL-to-BR diagonal [0, 5, 10, 15].
        // Line 9: TR-to-BL diagonal [3, 6, 9, 12].
        if (lineIndex < 4) {
            uint8 b = lineIndex * 4;
            cells[0] = b;
            cells[1] = b + 1;
            cells[2] = b + 2;
            cells[3] = b + 3;
        } else if (lineIndex < 8) {
            uint8 b = lineIndex - 4;
            cells[0] = b;
            cells[1] = b + 4;
            cells[2] = b + 8;
            cells[3] = b + 12;
        } else if (lineIndex == 8) {
            cells[0] = 0;
            cells[1] = 5;
            cells[2] = 10;
            cells[3] = 15;
        } else {
            cells[0] = 3;
            cells[1] = 6;
            cells[2] = 9;
            cells[3] = 12;
        }
    }

    function _bytesEqBytes32(bytes calldata a, bytes32 b)
        internal
        pure
        returns (bool)
    {
        if (a.length != 32) return false;
        return bytes32(a) == b;
    }

    /// @dev Credits the referrer (if any) from the bonus pool. Silently skips
    ///      if the refCode was empty, the bps was zero, or the pool is
    ///      under-funded — sponsors should keep the pool topped up.
    function _onCardCompleted(uint256 cardId, Card storage c) internal {
        address ref =
            c.refCode == bytes32(0) ? address(0) : referrerOf[c.refCode];
        emit CardCompleted(cardId, ref);

        if (ref == address(0)) return;
        if (c.referralBpsAtMint == 0) return;

        uint256 payout = (c.cardPriceAtMint * c.referralBpsAtMint) / BPS;
        if (payout == 0 || payout > bonusPool) return;

        bonusPool -= payout;
        referralEarnings[ref] += payout;
        outstandingReferralEarnings += payout;
        c.referrerPaid = true;
        emit ReferralCredited(ref, cardId, payout);
    }

    // ============ IEntropyConsumer ============

    function getEntropy() public view override returns (address) {
        return address(entropy);
    }

    function _entropyCallback(
        uint64 sequenceNumber,
        address, /* provider */
        bytes32 randomNumber
    ) internal override {
        uint256 cardId = pendingReveal[sequenceNumber];
        if (cardId == 0) revert UnknownSequence();
        delete pendingReveal[sequenceNumber];

        _revealCard(cardId, randomNumber);
    }

    function _revealCard(uint256 cardId, bytes32 randomNumber) internal {
        Card storage c = _cards[cardId];
        if (c.revealed) revert AlreadyRevealed();

        // Fisher-Yates partial shuffle over the per-card snapshot. We re-hash
        // the seed each step so a single bytes32 yields well-distributed
        // picks rather than reusing one number mod-N.
        bytes32[] storage poolIds = _cardPoolCondIds[cardId];
        address[] storage poolResolvers_ = _cardPoolResolvers[cardId];
        uint256 n = poolIds.length;
        uint256 seed = uint256(randomNumber);

        for (uint256 i = 0; i < CELLS_PER_CARD; i++) {
            seed = uint256(keccak256(abi.encode(seed, i)));
            uint256 j = i + (seed % (n - i));
            // swap pool[i] <-> pool[j] in-place
            (poolIds[i], poolIds[j]) = (poolIds[j], poolIds[i]);
            (poolResolvers_[i], poolResolvers_[j]) =
            (poolResolvers_[j], poolResolvers_[i]);
            c.conditionIds[i] = poolIds[i];
            c.resolvers[i] = poolResolvers_[i];
        }

        c.revealed = true;
        delete _cardPoolCondIds[cardId];
        delete _cardPoolResolvers[cardId];

        emit CardRevealed(cardId, randomNumber);
    }

    // ============ Bonus: preview + claim ============

    /// @notice Compute what `claimBonus` would pay right now based on current
    ///         resolver state and the current multiplier table. Requires the
    ///         card to be fully funded (all 10 lines), same as `claimBonus`.
    function previewBonus(uint256 cardId)
        external
        view
        returns (uint8 wins, uint256 payout)
    {
        Card storage c = _cards[cardId];
        if (c.player == address(0)) revert CardNotFound();
        if (!c.revealed) revert CardNotRevealed();
        if (c.filledLineBitmap != COMPLETE_BITMAP) revert CardNotComplete();

        wins = _countWinningLines(c);
        payout = (c.cardPriceAtMint * uint256(multiplierBps[wins])) / BPS;
        if (payout > bonusPool) payout = bonusPool;
    }

    /// @notice Pays the player's bonus from the bonus pool, based on the
    ///         number of lines that resolved as all-YES. Requires all 10 lines
    ///         to be funded — otherwise a player could fund a single
    ///         high-confidence line and skim the multiplier off a tiny stake.
    ///         Player-only: claim is one-shot, so a third party could otherwise
    ///         lock the player into a sub-optimal payout by claiming before
    ///         late-resolving cells settle. Idempotent.
    function claimBonus(uint256 cardId) external {
        Card storage c = _cards[cardId];
        if (c.player == address(0)) revert CardNotFound();
        if (!c.revealed) revert CardNotRevealed();
        if (msg.sender != c.player) revert PlayerMismatch();
        if (c.filledLineBitmap != COMPLETE_BITMAP) revert CardNotComplete();
        if (bonusClaimed[cardId]) revert BonusAlreadyClaimed();
        bonusClaimed[cardId] = true;

        uint8 wins = _countWinningLines(c);
        uint256 payout =
            (c.cardPriceAtMint * uint256(multiplierBps[wins])) / BPS;
        if (payout > bonusPool) payout = bonusPool;

        if (payout > 0) {
            bonusPool -= payout;
            collateralToken.safeTransfer(c.player, payout);
        }

        emit BonusClaimed(cardId, c.player, wins, payout);
    }

    /// @dev For each funded line, returns whether every cell resolved
    ///      decisively in agreement with the player's declared side.
    function _countWinningLines(Card storage c)
        internal
        view
        returns (uint8 wins)
    {
        uint16 bitmap = c.filledLineBitmap;
        for (uint8 line = 0; line < LINES_PER_CARD; line++) {
            if (bitmap & uint16(1 << line) == 0) continue;
            if (_lineWins(c, line)) wins++;
        }
    }

    function _lineWins(Card storage c, uint8 lineIndex)
        internal
        view
        returns (bool)
    {
        uint8[CELLS_PER_LINE] memory cells = _lineCells(lineIndex);
        for (uint256 i = 0; i < CELLS_PER_LINE; i++) {
            uint8 cell = cells[i];
            bool predictedYes = (c.cellSides & uint16(1 << cell)) != 0;
            // A misbehaving resolver shouldn't be able to brick the bonus
            // claim. Treat any revert as "not decisive yet" — same as ok=false.
            try IConditionResolver(c.resolvers[cell])
                .getResolution(abi.encodePacked(c.conditionIds[cell])) returns (
                bool ok, IV2Types.OutcomeVector memory v
            ) {
                if (!ok) return false;
                if (predictedYes) {
                    if (v.yesWeight == 0 || v.noWeight != 0) return false;
                } else {
                    if (v.noWeight == 0 || v.yesWeight != 0) return false;
                }
            } catch {
                return false;
            }
        }
        return true;
    }

    // ============ Player: declare sides ============

    /// @notice Declare YES/NO on each of the 16 cells. One-shot; reverts if
    ///         already declared. Must be called between reveal and the first
    ///         `fundMint` — the 10 line submissions read their per-cell side
    ///         from this mask.
    /// @param yesMask Bit i: 1 = YES, 0 = NO for cell i (0..15). Bits 16..255
    ///        are ignored.
    function setCellSides(uint256 cardId, uint16 yesMask) external {
        Card storage c = _cards[cardId];
        if (c.player == address(0)) revert CardNotFound();
        if (msg.sender != c.player) revert PlayerMismatch();
        if (!c.revealed) revert CardNotRevealed();
        if (c.sidesDeclared) revert SidesAlreadyDeclared();
        c.cellSides = yesMask;
        c.sidesDeclared = true;
        emit SidesDeclared(cardId, yesMask);
    }

    // ============ Player: withdraw unused ============

    /// @notice After a card expires, the player can sweep any remaining
    ///         per-line sponsor balance that wasn't spent on mints. Useful
    ///         when a card was minted but the player didn't fill all 10 lines.
    function withdrawUnused(uint256 cardId) external {
        Card storage c = _cards[cardId];
        if (c.player == address(0)) revert CardNotFound();
        if (msg.sender != c.player) revert PlayerMismatch();
        if (block.timestamp < c.expiresAt) revert CardNotExpired();

        uint256 amount = c.sponsorBalance;
        if (amount == 0) revert NothingToWithdraw();

        c.sponsorBalance = 0;
        outstandingSponsorBalance -= amount;
        collateralToken.safeTransfer(c.player, amount);

        emit UnusedWithdrawn(cardId, c.player, amount);
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
