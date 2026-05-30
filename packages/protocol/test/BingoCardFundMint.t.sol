// SPDX-License-Identifier: MIT
pragma solidity ^0.8.19;

import "./BingoCardTestBase.sol";
import "../src/interfaces/IMintSponsor.sol";
import "../src/interfaces/IV2Types.sol";

contract BingoCardFundMintTest is BingoCardTestBase {
    using stdStorage for StdStorage;

    bytes32 internal constant REFCODE = bytes32("REF");

    event LineFunded(
        uint256 indexed cardId,
        uint8 indexed lineIndex,
        uint256 stake,
        uint16 filledBitmap
    );
    event CardCompleted(uint256 indexed cardId, address indexed referrer);

    BingoCard.Card internal _revealedCard;

    function setUp() public override {
        super.setUp();
        _seedDefaultPool();
        _configureDefaults();
        collateral.mint(player, 100 * DECIMALS);
        vm.prank(player);
        collateral.approve(address(bingo), type(uint256).max);

        vm.prank(owner);
        bingo.setEscrow(escrow);

        // Referrer registers code so completion path can credit them.
        vm.prank(referrer);
        bingo.registerCode(REFCODE);

        // Seed bonusPool so referrer payouts can happen.
        collateral.mint(address(this), 100 * DECIMALS);
        collateral.approve(address(bingo), type(uint256).max);
        bingo.depositBonus(10 * DECIMALS);
    }

    function _mintAndReveal(bytes32 refCode, bytes32 random)
        internal
        returns (uint256 cardId)
    {
        random; // cells are drawn on-chain at mint; no external randomness
        vm.prank(player);
        cardId = bingo.mintCard(refCode, CARD_PRICE);
        // These tests build all-YES picks via `_buildPicksForLine`; declare
        // matching sides up front so fundMint accepts them.
        vm.prank(player);
        bingo.setCellSides(cardId, 0xFFFF);
        _revealedCard = bingo.cardOf(cardId);
    }

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

    function _buildPicksForLine(uint256 cardId, uint8 lineIndex)
        internal
        view
        returns (IV2Types.Pick[] memory picks)
    {
        BingoCard.Card memory c = bingo.cardOf(cardId);
        uint8[4] memory cells = _lineCells(lineIndex);
        picks = new IV2Types.Pick[](4);
        for (uint256 i = 0; i < 4; i++) {
            picks[i] = IV2Types.Pick({
                conditionResolver: c.resolvers[cells[i]],
                conditionId: abi.encodePacked(c.conditionIds[cells[i]]),
                predictedOutcome: IV2Types.OutcomeSide.YES
            });
        }
    }

    function _buildRequest(uint256 cardId, uint8 lineIndex)
        internal
        view
        returns (IV2Types.MintRequest memory req)
    {
        req.picks = _buildPicksForLine(cardId, lineIndex);
        req.predictorCollateral = CARD_PRICE / bingo.LINES_PER_CARD();
        req.counterpartyCollateral = req.predictorCollateral; // not used
        req.predictor = player;
        req.predictorSponsor = address(bingo);
        req.predictorSponsorData = abi.encode(cardId);
    }

    // ---- access + setup reverts ----

    function test_fundMint_revertsIfNotEscrow() public {
        uint256 cardId = _mintAndReveal(REFCODE, bytes32(uint256(0xA)));
        IV2Types.MintRequest memory req = _buildRequest(cardId, 0);
        vm.expectRevert(BingoCard.UnauthorizedEscrow.selector);
        bingo.fundMint(escrow, req);
    }

    function test_fundMint_revertsIfSidesNotDeclared() public {
        // Cells are drawn at mint, but fundMint still requires the player to
        // have declared their YES/NO sides first.
        vm.prank(player);
        uint256 cardId = bingo.mintCard(REFCODE, CARD_PRICE);
        IV2Types.MintRequest memory req = _buildRequest(cardId, 0);

        vm.prank(escrow);
        vm.expectRevert(BingoCard.SidesNotDeclared.selector);
        bingo.fundMint(escrow, req);
    }

    function test_fundMint_revertsIfPlayerMismatch() public {
        uint256 cardId = _mintAndReveal(REFCODE, bytes32(uint256(0xA)));
        IV2Types.MintRequest memory req = _buildRequest(cardId, 0);
        req.predictor = address(0xBAD);

        vm.prank(escrow);
        vm.expectRevert(BingoCard.PlayerMismatch.selector);
        bingo.fundMint(escrow, req);
    }

    function test_fundMint_revertsIfStakeMismatch() public {
        uint256 cardId = _mintAndReveal(REFCODE, bytes32(uint256(0xA)));
        IV2Types.MintRequest memory req = _buildRequest(cardId, 0);
        req.predictorCollateral = req.predictorCollateral + 1;

        vm.prank(escrow);
        vm.expectRevert(BingoCard.StakeMismatch.selector);
        bingo.fundMint(escrow, req);
    }

    function test_fundMint_revertsIfPicksDontMatch() public {
        uint256 cardId = _mintAndReveal(REFCODE, bytes32(uint256(0xA)));
        IV2Types.MintRequest memory req = _buildRequest(cardId, 0);
        // Scramble one pick's conditionId
        req.picks[2].conditionId = abi.encodePacked(bytes32(uint256(0xDEAD)));

        vm.prank(escrow);
        vm.expectRevert(BingoCard.NoMatchingLine.selector);
        bingo.fundMint(escrow, req);
    }

    function test_fundMint_revertsIfLineAlreadyFilled() public {
        uint256 cardId = _mintAndReveal(REFCODE, bytes32(uint256(0xA)));
        IV2Types.MintRequest memory req = _buildRequest(cardId, 0);

        vm.prank(escrow);
        bingo.fundMint(escrow, req);

        vm.prank(escrow);
        vm.expectRevert(BingoCard.LineAlreadyFilled.selector);
        bingo.fundMint(escrow, req);
    }

    // ---- happy path ----

    function test_fundMint_transfersStakeToEscrow() public {
        uint256 cardId = _mintAndReveal(REFCODE, bytes32(uint256(0xA)));
        IV2Types.MintRequest memory req = _buildRequest(cardId, 0);

        uint256 escrowBefore = collateral.balanceOf(escrow);
        vm.prank(escrow);
        bingo.fundMint(escrow, req);
        assertEq(
            collateral.balanceOf(escrow),
            escrowBefore + CARD_PRICE / bingo.LINES_PER_CARD()
        );
    }

    function test_fundMint_decrementsSponsorBalance() public {
        uint256 cardId = _mintAndReveal(REFCODE, bytes32(uint256(0xA)));
        IV2Types.MintRequest memory req = _buildRequest(cardId, 0);
        vm.prank(escrow);
        bingo.fundMint(escrow, req);

        BingoCard.Card memory c = bingo.cardOf(cardId);
        assertEq(
            c.sponsorBalance, CARD_PRICE - CARD_PRICE / bingo.LINES_PER_CARD()
        );
        assertEq(
            bingo.outstandingSponsorBalance(),
            CARD_PRICE - CARD_PRICE / bingo.LINES_PER_CARD()
        );
    }

    function test_fundMint_setsBitmap() public {
        uint256 cardId = _mintAndReveal(REFCODE, bytes32(uint256(0xA)));
        for (uint8 i = 0; i < 3; i++) {
            IV2Types.MintRequest memory req = _buildRequest(cardId, i);
            vm.prank(escrow);
            bingo.fundMint(escrow, req);
        }
        BingoCard.Card memory c = bingo.cardOf(cardId);
        assertEq(uint256(c.filledLineBitmap), 0x7); // lines 0,1,2 set
    }

    function test_fundMint_emitsLineFunded() public {
        uint256 cardId = _mintAndReveal(REFCODE, bytes32(uint256(0xA)));
        IV2Types.MintRequest memory req = _buildRequest(cardId, 5);
        uint256 stake = CARD_PRICE / bingo.LINES_PER_CARD();
        vm.expectEmit(true, true, false, true);
        emit LineFunded(cardId, 5, stake, uint16(1 << 5));
        vm.prank(escrow);
        bingo.fundMint(escrow, req);
    }

    function test_fundMint_acceptsAnyLineOrder() public {
        uint256 cardId = _mintAndReveal(REFCODE, bytes32(uint256(0xA)));
        uint8[10] memory order = [9, 8, 0, 7, 2, 5, 1, 4, 3, 6];
        uint16 expected;
        for (uint256 i = 0; i < 10; i++) {
            IV2Types.MintRequest memory req = _buildRequest(cardId, order[i]);
            vm.prank(escrow);
            bingo.fundMint(escrow, req);
            expected |= uint16(1 << order[i]);
            BingoCard.Card memory c = bingo.cardOf(cardId);
            assertEq(uint256(c.filledLineBitmap), uint256(expected));
        }
    }

    function _reversePicks(IV2Types.Pick[] memory picks)
        internal
        pure
        returns (IV2Types.Pick[] memory out)
    {
        out = new IV2Types.Pick[](picks.length);
        for (uint256 i = 0; i < picks.length; i++) {
            out[i] = picks[picks.length - 1 - i];
        }
    }

    function test_fundMint_acceptsPicksInAnyOrder() public {
        // The real PredictionMarketEscrow requires picks in canonical
        // (resolver, conditionId-hash) order and forwards that same array to
        // fundMint — which is NOT cell order. Matching must be
        // order-independent. Reverse the cell-order picks to prove it.
        uint256 cardId = _mintAndReveal(REFCODE, bytes32(uint256(0xA)));
        IV2Types.MintRequest memory req = _buildRequest(cardId, 5);
        req.picks = _reversePicks(req.picks);

        uint256 stake = CARD_PRICE / bingo.LINES_PER_CARD();
        vm.expectEmit(true, true, false, true);
        emit LineFunded(cardId, 5, stake, uint16(1 << 5));
        vm.prank(escrow);
        bingo.fundMint(escrow, req);

        BingoCard.Card memory c = bingo.cardOf(cardId);
        assertEq(uint256(c.filledLineBitmap), uint256(1 << 5));
    }

    function test_fundMint_revertsIfPicksAreNotAFullLine() public {
        // Four valid card cells that don't form a line must not match.
        uint256 cardId = _mintAndReveal(REFCODE, bytes32(uint256(0xA)));
        BingoCard.Card memory c = bingo.cardOf(cardId);
        IV2Types.Pick[] memory picks = new IV2Types.Pick[](4);
        // cells 0,1,2,4 — a partial row plus a stray cell, not any line.
        uint8[4] memory cells = [0, 1, 2, 4];
        for (uint256 i = 0; i < 4; i++) {
            picks[i] = IV2Types.Pick({
                conditionResolver: c.resolvers[cells[i]],
                conditionId: abi.encodePacked(c.conditionIds[cells[i]]),
                predictedOutcome: IV2Types.OutcomeSide.YES
            });
        }
        IV2Types.MintRequest memory req = _buildRequest(cardId, 0);
        req.picks = picks;

        vm.prank(escrow);
        vm.expectRevert(BingoCard.NoMatchingLine.selector);
        bingo.fundMint(escrow, req);
    }

    // ---- referral payout on completion ----

    function _fillAllLines(uint256 cardId) internal {
        for (uint8 i = 0; i < 10; i++) {
            IV2Types.MintRequest memory req = _buildRequest(cardId, i);
            vm.prank(escrow);
            bingo.fundMint(escrow, req);
        }
    }

    function test_completion_creditsReferrerEarnings() public {
        uint256 cardId = _mintAndReveal(REFCODE, bytes32(uint256(0xA)));
        uint256 bonusBefore = bingo.bonusPool();
        _fillAllLines(cardId);

        uint256 expectedPayout = (CARD_PRICE * REFERRAL_BPS) / 10_000;
        assertEq(bingo.referralEarnings(referrer), expectedPayout);
        assertEq(bingo.outstandingReferralEarnings(), expectedPayout);
        assertEq(bingo.bonusPool(), bonusBefore - expectedPayout);
    }

    function test_completion_emitsCardCompleted() public {
        uint256 cardId = _mintAndReveal(REFCODE, bytes32(uint256(0xA)));
        // Fill lines 0..8 directly, then expect the event on the 10th.
        for (uint8 i = 0; i < 9; i++) {
            IV2Types.MintRequest memory req = _buildRequest(cardId, i);
            vm.prank(escrow);
            bingo.fundMint(escrow, req);
        }

        IV2Types.MintRequest memory last = _buildRequest(cardId, 9);
        vm.expectEmit(true, true, false, false);
        emit CardCompleted(cardId, referrer);
        vm.prank(escrow);
        bingo.fundMint(escrow, last);
    }

    function test_completion_noCreditWithoutRefCode() public {
        uint256 cardId = _mintAndReveal(bytes32(0), bytes32(uint256(0xA)));
        _fillAllLines(cardId);

        assertEq(bingo.referralEarnings(referrer), 0);
        assertEq(bingo.outstandingReferralEarnings(), 0);
    }

    function test_completion_noCreditWhenBpsZero() public {
        // Reset referral bps before mint so the card stamps 0.
        vm.prank(owner);
        bingo.setReferralBps(0);
        uint256 cardId = _mintAndReveal(REFCODE, bytes32(uint256(0xA)));
        _fillAllLines(cardId);

        assertEq(bingo.referralEarnings(referrer), 0);
    }

    function test_completion_noCreditWhenBonusInsufficient() public {
        // Drain bonus below the payout amount.
        uint256 pool = bingo.bonusPool();
        vm.prank(owner);
        bingo.withdrawBonus(pool, owner);
        uint256 cardId = _mintAndReveal(REFCODE, bytes32(uint256(0xA)));
        _fillAllLines(cardId);

        assertEq(bingo.referralEarnings(referrer), 0);
        BingoCard.Card memory c = bingo.cardOf(cardId);
        assertEq(c.referrerPaid, false);
    }

    function test_completion_setsReferrerPaidFlag() public {
        uint256 cardId = _mintAndReveal(REFCODE, bytes32(uint256(0xA)));
        _fillAllLines(cardId);
        BingoCard.Card memory c = bingo.cardOf(cardId);
        assertTrue(c.referrerPaid);
    }

    function test_completion_usesStampedBpsAfterAdminChange() public {
        // Mint stamps 2%. Admin bumps to 50% post-mint. Payout must still be 2%.
        uint256 cardId = _mintAndReveal(REFCODE, bytes32(uint256(0xA)));
        vm.prank(owner);
        bingo.setReferralBps(5000);
        _fillAllLines(cardId);

        uint256 expected = (CARD_PRICE * REFERRAL_BPS) / 10_000;
        assertEq(bingo.referralEarnings(referrer), expected);
    }
}
