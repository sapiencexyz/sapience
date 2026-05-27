// SPDX-License-Identifier: MIT
pragma solidity ^0.8.19;

import "./BingoCardTestBase.sol";
import "../src/interfaces/IMintSponsor.sol";
import "../src/interfaces/IV2Types.sol";
import "../src/interfaces/IConditionResolver.sol";
import "../src/resolvers/mocks/ManualConditionResolver.sol";

/// @dev Always reverts on `getResolution`. Used to verify `claimBonus` can't
///      be bricked by a misbehaving resolver.
contract RevertingResolver is IConditionResolver {
    function isValidCondition(bytes calldata) external pure returns (bool) {
        return true;
    }

    function getResolution(bytes calldata)
        external
        pure
        returns (bool, IV2Types.OutcomeVector memory)
    {
        revert("boom");
    }

    function isFinalized(bytes calldata) external pure returns (bool) {
        return false;
    }

    function getResolutions(bytes[] calldata ids)
        external
        pure
        returns (bool[] memory, IV2Types.OutcomeVector[] memory)
    {
        return
            (new bool[](ids.length), new IV2Types.OutcomeVector[](ids.length));
    }
}

contract BingoCardSettleTest is BingoCardTestBase {
    bytes32 internal constant REFCODE = bytes32("REF");

    event MultipliersSet(uint16[11] bps);
    event SidesDeclared(uint256 indexed cardId, uint16 yesMask);
    event BonusClaimed(
        uint256 indexed cardId,
        address indexed player,
        uint8 winCount,
        uint256 payout
    );

    ManualConditionResolver internal resolver;
    bytes32[] internal seededIds;

    function setUp() public override {
        super.setUp();

        resolver = new ManualConditionResolver(address(this));
        resolver.approveSettler(address(this));

        // Build a pool of 20 conditions backed by the real ManualConditionResolver.
        bytes32[] memory ids = new bytes32[](20);
        address[] memory resolvers = new address[](20);
        for (uint256 i = 0; i < 20; i++) {
            ids[i] = keccak256(abi.encode("settle-cond", i));
            resolvers[i] = address(resolver);
        }
        seededIds = ids;
        vm.prank(owner);
        bingo.setPool(ids, resolvers);

        _configureDefaults();

        // Multipliers in bps, indexed by winning-line count (0..10).
        // uint16 caps multipliers at ~6.55x — plenty for a bingo bonus.
        uint16[11] memory mults = [
            uint16(0), //     0 wins → no bonus
            uint16(0), //     1 win  → no bonus
            uint16(11_000), // 2     → 1.1x
            uint16(12_500), // 3
            uint16(15_000), // 4
            uint16(20_000), // 5
            uint16(30_000), // 6
            uint16(40_000), // 7
            uint16(50_000), // 8
            uint16(60_000), // 9
            uint16(65_000) //  10
        ];
        vm.prank(owner);
        bingo.setMultipliers(mults);

        collateral.mint(player, 100 * DECIMALS);
        vm.prank(player);
        collateral.approve(address(bingo), type(uint256).max);

        vm.prank(owner);
        bingo.setEscrow(escrow);

        // Generously seed the bonus pool.
        collateral.mint(address(this), 1000 * DECIMALS);
        collateral.approve(address(bingo), type(uint256).max);
        bingo.depositBonus(500 * DECIMALS);
    }

    // ---------- helpers ----------

    function _lineCells(uint8 lineIndex)
        internal
        pure
        returns (uint8[4] memory cells)
    {
        if (lineIndex < 4) {
            uint8 b = lineIndex * 4;
            cells = [b, b + 1, b + 2, b + 3];
        } else if (lineIndex < 8) {
            uint8 b = lineIndex - 4;
            cells = [b, b + 4, b + 8, b + 12];
        } else if (lineIndex == 8) {
            cells = [0, 5, 10, 15];
        } else {
            cells = [3, 6, 9, 12];
        }
    }

    function _mintAndReveal() internal returns (uint256 cardId) {
        vm.prank(player);
        cardId = bingo.mintCard{ value: ENTROPY_FEE }(REFCODE);
        entropy.pushCallback(
            uint64(cardId), entropyProvider, bytes32(uint256(0xA))
        );
    }

    function _declareSides(uint256 cardId, uint16 yesMask) internal {
        vm.prank(player);
        bingo.setCellSides(cardId, yesMask);
    }

    /// @dev Picks for a line are derived from the card's stored cell sides —
    ///      whatever the player declared via `setCellSides`.
    function _buildPicks(uint256 cardId, uint8 lineIndex)
        internal
        view
        returns (IV2Types.Pick[] memory picks)
    {
        BingoCard.Card memory c = bingo.cardOf(cardId);
        uint8[4] memory cells = _lineCells(lineIndex);
        picks = new IV2Types.Pick[](4);
        for (uint256 i = 0; i < 4; i++) {
            bool yes = (c.cellSides & (uint16(1) << cells[i])) != 0;
            picks[i] = IV2Types.Pick({
                conditionResolver: c.resolvers[cells[i]],
                conditionId: abi.encodePacked(c.conditionIds[cells[i]]),
                predictedOutcome: yes
                    ? IV2Types.OutcomeSide.YES
                    : IV2Types.OutcomeSide.NO
            });
        }
    }

    function _fundLine(uint256 cardId, uint8 lineIndex) internal {
        IV2Types.MintRequest memory req;
        req.picks = _buildPicks(cardId, lineIndex);
        req.predictorCollateral = CARD_PRICE / bingo.LINES_PER_CARD();
        req.counterpartyCollateral = req.predictorCollateral;
        req.predictor = player;
        req.predictorSponsor = address(bingo);
        req.predictorSponsorData = abi.encode(cardId);
        vm.prank(escrow);
        bingo.fundMint(escrow, req);
    }

    function _settleCellYes(bytes32 conditionId) internal {
        resolver.settleCondition(
            conditionId, IV2Types.OutcomeVector({ yesWeight: 1, noWeight: 0 })
        );
    }

    function _settleCellNo(bytes32 conditionId) internal {
        resolver.settleCondition(
            conditionId, IV2Types.OutcomeVector({ yesWeight: 0, noWeight: 1 })
        );
    }

    function _settleCellTie(bytes32 conditionId) internal {
        resolver.settleCondition(
            conditionId, IV2Types.OutcomeVector({ yesWeight: 1, noWeight: 1 })
        );
    }

    function _settleLineCellsYes(uint256 cardId, uint8 lineIndex) internal {
        BingoCard.Card memory c = bingo.cardOf(cardId);
        uint8[4] memory cells = _lineCells(lineIndex);
        for (uint256 i = 0; i < 4; i++) {
            bytes32 cid = c.conditionIds[cells[i]];
            if (!resolver.isSettled(cid)) _settleCellYes(cid);
        }
    }

    function _settleLineCellsNo(uint256 cardId, uint8 lineIndex) internal {
        BingoCard.Card memory c = bingo.cardOf(cardId);
        uint8[4] memory cells = _lineCells(lineIndex);
        for (uint256 i = 0; i < 4; i++) {
            bytes32 cid = c.conditionIds[cells[i]];
            if (!resolver.isSettled(cid)) _settleCellNo(cid);
        }
    }

    function _settleLineWithOneNo(uint256 cardId, uint8 lineIndex) internal {
        BingoCard.Card memory c = bingo.cardOf(cardId);
        uint8[4] memory cells = _lineCells(lineIndex);
        for (uint256 i = 0; i < 4; i++) {
            bytes32 cid = c.conditionIds[cells[i]];
            if (resolver.isSettled(cid)) continue;
            if (i == 0) _settleCellNo(cid);
            else _settleCellYes(cid);
        }
    }

    /// @dev Declares all-YES sides then funds all 10 lines.
    function _fundAll(uint256 cardId) internal {
        _fundAllWithCellSides(cardId, 0xFFFF);
    }

    /// @dev Declares `cellSides` (16-bit, bit i = YES for cell i) then funds
    ///      every line.
    function _fundAllWithCellSides(uint256 cardId, uint16 cellSides) internal {
        _declareSides(cardId, cellSides);
        for (uint8 line = 0; line < 10; line++) {
            _fundLine(cardId, line);
        }
    }

    // ---------- admin: setMultipliers ----------

    function test_setMultipliers_storesAndEmits() public {
        uint16[11] memory mults;
        for (uint256 i = 0; i < 11; i++) {
            mults[i] = uint16(1000 * (i + 1));
        }
        vm.expectEmit(false, false, false, true);
        emit MultipliersSet(mults);
        vm.prank(owner);
        bingo.setMultipliers(mults);
        for (uint256 i = 0; i < 11; i++) {
            assertEq(uint256(bingo.multiplierBps(i)), 1000 * (i + 1));
        }
    }

    function test_setMultipliers_revertsIfNotOwner() public {
        uint16[11] memory mults;
        vm.expectRevert();
        bingo.setMultipliers(mults);
    }

    // ---------- setCellSides + fundMint ----------

    function test_setCellSides_storesMaskAndEmits() public {
        uint256 cardId = _mintAndReveal();
        vm.expectEmit(true, false, false, true);
        emit SidesDeclared(cardId, uint16(0xABCD));
        vm.prank(player);
        bingo.setCellSides(cardId, uint16(0xABCD));

        BingoCard.Card memory c = bingo.cardOf(cardId);
        assertTrue(c.sidesDeclared);
        assertEq(uint256(c.cellSides), 0xABCD);
    }

    function test_setCellSides_revertsIfNotPlayer() public {
        uint256 cardId = _mintAndReveal();
        vm.expectRevert(BingoCard.PlayerMismatch.selector);
        bingo.setCellSides(cardId, 0xFFFF);
    }

    function test_setCellSides_revertsIfNotRevealed() public {
        vm.prank(player);
        uint256 cardId = bingo.mintCard{ value: ENTROPY_FEE }(REFCODE);
        vm.prank(player);
        vm.expectRevert(BingoCard.CardNotRevealed.selector);
        bingo.setCellSides(cardId, 0xFFFF);
    }

    function test_setCellSides_revertsIfAlreadyDeclared() public {
        uint256 cardId = _mintAndReveal();
        _declareSides(cardId, 0xFFFF);
        vm.prank(player);
        vm.expectRevert(BingoCard.SidesAlreadyDeclared.selector);
        bingo.setCellSides(cardId, 0x0000);
    }

    function test_fundMint_revertsIfSidesNotDeclared() public {
        uint256 cardId = _mintAndReveal();
        IV2Types.MintRequest memory req;
        req.picks = _buildPicks(cardId, 0); // picks are all-NO because cellSides=0
        req.predictorCollateral = CARD_PRICE / bingo.LINES_PER_CARD();
        req.predictor = player;
        req.predictorSponsor = address(bingo);
        req.predictorSponsorData = abi.encode(cardId);
        vm.prank(escrow);
        vm.expectRevert(BingoCard.SidesNotDeclared.selector);
        bingo.fundMint(escrow, req);
    }

    function test_fundMint_revertsIfPickDisagreesWithDeclaredSide() public {
        // Declare all-YES, then submit a fundMint pick where one cell is NO.
        uint256 cardId = _mintAndReveal();
        _declareSides(cardId, 0xFFFF);
        IV2Types.MintRequest memory req;
        req.picks = _buildPicks(cardId, 0);
        req.picks[2].predictedOutcome = IV2Types.OutcomeSide.NO;
        req.predictorCollateral = CARD_PRICE / bingo.LINES_PER_CARD();
        req.predictor = player;
        req.predictorSponsor = address(bingo);
        req.predictorSponsorData = abi.encode(cardId);
        vm.prank(escrow);
        vm.expectRevert(BingoCard.SideMismatch.selector);
        bingo.fundMint(escrow, req);
    }

    // ---------- settle: counting + payout ----------

    function test_previewBonus_returnsLiveWinsAndPayout() public {
        uint256 cardId = _mintAndReveal();
        _fundAll(cardId);
        _settleLineCellsYes(cardId, 0);
        _settleLineCellsYes(cardId, 1);

        (uint8 wins, uint256 payout) = bingo.previewBonus(cardId);
        assertEq(uint256(wins), 2);
        assertEq(payout, (CARD_PRICE * 11_000) / 10_000);
    }

    function test_previewBonus_doesNotMarkClaimed() public {
        uint256 cardId = _mintAndReveal();
        _fundAll(cardId);
        _settleLineCellsYes(cardId, 0);
        _settleLineCellsYes(cardId, 1);
        bingo.previewBonus(cardId);
        assertEq(bingo.bonusClaimed(cardId), false);
    }

    function test_claimBonus_zeroWinsPaysNothing() public {
        uint256 cardId = _mintAndReveal();
        _fundAll(cardId);
        // No cells settled YES — every line loses.

        uint256 before = collateral.balanceOf(player);
        vm.prank(player);
        bingo.claimBonus(cardId);
        assertEq(collateral.balanceOf(player), before);
    }

    function test_claimBonus_unresolvedCellsAreNotWins() public {
        uint256 cardId = _mintAndReveal();
        _fundAll(cardId);
        // Settle only some, but not enough to complete any line.
        BingoCard.Card memory c = bingo.cardOf(cardId);
        _settleCellYes(c.conditionIds[0]);

        uint256 before = collateral.balanceOf(player);
        vm.prank(player);
        bingo.claimBonus(cardId);
        assertEq(collateral.balanceOf(player), before);
    }

    function test_claimBonus_tiedCellsAreNotWins() public {
        uint256 cardId = _mintAndReveal();
        _fundAll(cardId);
        // Settle 3 cells of line 0 YES, 1 cell TIE → line 0 doesn't win.
        BingoCard.Card memory c = bingo.cardOf(cardId);
        _settleCellYes(c.conditionIds[0]);
        _settleCellYes(c.conditionIds[1]);
        _settleCellYes(c.conditionIds[2]);
        _settleCellTie(c.conditionIds[3]);

        uint256 before = collateral.balanceOf(player);
        vm.prank(player);
        bingo.claimBonus(cardId);
        assertEq(collateral.balanceOf(player), before);
    }

    function test_claimBonus_paysMultiplierForTwoWins() public {
        uint256 cardId = _mintAndReveal();
        _fundAll(cardId);
        _settleLineCellsYes(cardId, 0);
        _settleLineCellsYes(cardId, 1);

        // 2 wins → 1.1x multiplier on $5 card = $5.50
        uint256 expected = (CARD_PRICE * 11_000) / 10_000;
        uint256 before = collateral.balanceOf(player);

        vm.prank(player);
        bingo.claimBonus(cardId);

        assertEq(collateral.balanceOf(player), before + expected);
    }

    function test_claimBonus_revertsIfCardNotComplete() public {
        // Partial-funding exploit guard: a player who funds only 1 high-
        // confidence YES line shouldn't be able to skim the multiplier off a
        // tiny stake. claimBonus requires all 10 lines funded.
        uint256 cardId = _mintAndReveal();
        _declareSides(cardId, 0xFFFF);
        _fundLine(cardId, 0);
        _settleLineCellsYes(cardId, 0);

        vm.prank(player);
        vm.expectRevert(BingoCard.CardNotComplete.selector);
        bingo.claimBonus(cardId);
    }

    function test_previewBonus_revertsIfCardNotComplete() public {
        uint256 cardId = _mintAndReveal();
        _declareSides(cardId, 0xFFFF);
        _fundLine(cardId, 0);
        vm.expectRevert(BingoCard.CardNotComplete.selector);
        bingo.previewBonus(cardId);
    }

    function test_claimBonus_payoutCapsAtBonusPool() public {
        // Drain bonus to a small remaining amount.
        uint256 keep = (CARD_PRICE * 11_000) / 10_000 - 1; // less than expected payout
        uint256 pool = bingo.bonusPool();
        vm.prank(owner);
        bingo.withdrawBonus(pool - keep, owner);

        uint256 cardId = _mintAndReveal();
        _fundAll(cardId);
        _settleLineCellsYes(cardId, 0);
        _settleLineCellsYes(cardId, 1);

        uint256 before = collateral.balanceOf(player);
        vm.prank(player);
        bingo.claimBonus(cardId);
        assertEq(collateral.balanceOf(player), before + keep);
        assertEq(bingo.bonusPool(), 0);
    }

    function test_claimBonus_revertsIfAlreadySettled() public {
        uint256 cardId = _mintAndReveal();
        _fundAll(cardId);

        vm.prank(player);
        bingo.claimBonus(cardId);
        vm.prank(player);
        vm.expectRevert(BingoCard.BonusAlreadyClaimed.selector);
        bingo.claimBonus(cardId);
    }

    function test_claimBonus_marksSettled() public {
        uint256 cardId = _mintAndReveal();
        _fundAll(cardId);
        vm.prank(player);
        bingo.claimBonus(cardId);
        assertTrue(bingo.bonusClaimed(cardId));
    }

    function test_claimBonus_emitsBonusClaimed() public {
        uint256 cardId = _mintAndReveal();
        _fundAll(cardId);
        _settleLineCellsYes(cardId, 0);
        _settleLineCellsYes(cardId, 1);

        uint256 expected = (CARD_PRICE * 11_000) / 10_000;
        vm.expectEmit(true, true, false, true);
        emit BonusClaimed(cardId, player, 2, expected);
        vm.prank(player);
        bingo.claimBonus(cardId);
    }

    function test_claimBonus_usesCurrentMultipliers() public {
        uint256 cardId = _mintAndReveal();
        _fundAll(cardId);
        _settleLineCellsYes(cardId, 0);
        _settleLineCellsYes(cardId, 1);

        // Admin halves the 2-win multiplier post-mint. Bonus payout follows
        // the current table — multipliers are NOT stamped at mint, since the
        // bonus pool itself is admin-controlled and stamping would be theater.
        uint16[11] memory next;
        next[2] = 5500;
        vm.prank(owner);
        bingo.setMultipliers(next);

        uint256 expected = (CARD_PRICE * 5500) / 10_000;
        uint256 before = collateral.balanceOf(player);
        vm.prank(player);
        bingo.claimBonus(cardId);
        assertEq(collateral.balanceOf(player), before + expected);
    }

    function test_claimBonus_revertsIfCardNotFound() public {
        vm.expectRevert(BingoCard.CardNotFound.selector);
        bingo.claimBonus(999);
    }

    function test_claimBonus_revertsIfNotRevealed() public {
        vm.prank(player);
        uint256 cardId = bingo.mintCard{ value: ENTROPY_FEE }(REFCODE);
        // Don't push the entropy callback.
        vm.expectRevert(BingoCard.CardNotRevealed.selector);
        bingo.claimBonus(cardId);
    }

    function test_claimBonus_revertsIfNotPlayer() public {
        // Player-only gate prevents a third party from front-running an
        // optimistic claim and locking the player into a sub-optimal payout.
        uint256 cardId = _mintAndReveal();
        _fundAll(cardId);
        _settleLineCellsYes(cardId, 0);
        _settleLineCellsYes(cardId, 1);

        vm.prank(address(0xDA));
        vm.expectRevert(BingoCard.PlayerMismatch.selector);
        bingo.claimBonus(cardId);
    }

    function test_lineWins_predictedNoResolvedNo() public {
        // Cells 0..3 picked NO across every line that contains them; rest YES.
        // Line 0 (row 0) covers exactly cells 0..3, so it wins on all-NO
        // resolutions.
        uint256 cardId = _mintAndReveal();
        _fundAllWithCellSides(cardId, 0xFFF0);
        _settleLineCellsNo(cardId, 0);

        (uint8 wins,) = bingo.previewBonus(cardId);
        assertEq(uint256(wins), 1);
    }

    function test_lineWins_predictedNoButResolvedYes() public {
        // Same setup, but resolutions go YES → line 0 doesn't win.
        uint256 cardId = _mintAndReveal();
        _fundAllWithCellSides(cardId, 0xFFF0);
        _settleLineCellsYes(cardId, 0);

        (uint8 wins,) = bingo.previewBonus(cardId);
        assertEq(uint256(wins), 0);
    }

    function test_claimBonus_payoutForMixedSideWins() public {
        // Cells 0..3 picked NO across every line that contains them
        // (lines 0, 4, 5, 6, 7, 8, 9), rest YES. Line 0 wins on all-NO
        // resolutions, line 1 wins on all-YES resolutions (its cells 4..7
        // were picked YES). 2 wins → 1.1x multiplier.
        uint256 cardId = _mintAndReveal();
        _fundAllWithCellSides(cardId, 0xFFF0);
        _settleLineCellsNo(cardId, 0);
        _settleLineCellsYes(cardId, 1);

        uint256 expected = (CARD_PRICE * 11_000) / 10_000;
        uint256 before = collateral.balanceOf(player);
        vm.prank(player);
        bingo.claimBonus(cardId);
        assertEq(collateral.balanceOf(player), before + expected);
    }

    function test_claimBonus_revertingResolverDoesNotBrick() public {
        // Swap in a pool entirely backed by a resolver that reverts on
        // getResolution. fundMint doesn't touch the resolver, so it succeeds,
        // but claimBonus must not propagate the revert — every line just
        // counts as non-winning.
        RevertingResolver bad = new RevertingResolver();
        bytes32[] memory ids = new bytes32[](20);
        address[] memory resolvers = new address[](20);
        for (uint256 i = 0; i < 20; i++) {
            ids[i] = keccak256(abi.encode("bad-cond", i));
            resolvers[i] = address(bad);
        }
        vm.prank(owner);
        bingo.setPool(ids, resolvers);

        uint256 cardId = _mintAndReveal();
        _fundAll(cardId);

        (uint8 wins, uint256 payout) = bingo.previewBonus(cardId);
        assertEq(uint256(wins), 0);
        assertEq(payout, 0);

        uint256 before = collateral.balanceOf(player);
        vm.prank(player);
        bingo.claimBonus(cardId);
        assertEq(collateral.balanceOf(player), before);
        assertTrue(bingo.bonusClaimed(cardId));
    }

    function test_claimBonus_handlesPartiallySettledLine() public {
        uint256 cardId = _mintAndReveal();
        _fundAll(cardId);
        // Line 0 fully YES (1 win), Line 1 has one NO (not a win).
        _settleLineCellsYes(cardId, 0);
        _settleLineWithOneNo(cardId, 1);

        uint256 before = collateral.balanceOf(player);
        vm.prank(player);
        bingo.claimBonus(cardId);
        // 1 win → multiplier[1] = 0 → no payout.
        assertEq(collateral.balanceOf(player), before);
    }
}
