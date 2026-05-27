// SPDX-License-Identifier: MIT
pragma solidity ^0.8.19;

import "./BingoCardTestBase.sol";

contract BingoCardMintTest is BingoCardTestBase {
    event CardMinted(
        uint256 indexed cardId,
        address indexed player,
        bytes32 refCode,
        uint64 sequenceNumber
    );
    event CardRevealed(uint256 indexed cardId, bytes32 randomNumber);

    function setUp() public override {
        super.setUp();
        _seedDefaultPool();
        _configureDefaults();
        collateral.mint(player, 100 * DECIMALS);
        vm.prank(player);
        collateral.approve(address(bingo), type(uint256).max);
    }

    function _mint(bytes32 refCode) internal returns (uint256 cardId) {
        vm.prank(player);
        cardId = bingo.mintCard{ value: ENTROPY_FEE }(refCode);
    }

    // ---- mintCard ----

    function test_mintCard_pullsCollateral() public {
        uint256 before = collateral.balanceOf(player);
        _mint(bytes32(0));
        assertEq(collateral.balanceOf(player), before - CARD_PRICE);
        assertEq(collateral.balanceOf(address(bingo)), CARD_PRICE);
    }

    function test_mintCard_stampsFields() public {
        vm.warp(1_700_000_000);
        uint256 cardId = _mint(bytes32("CODE"));
        BingoCard.Card memory c = bingo.cardOf(cardId);

        assertEq(c.player, player);
        assertEq(c.refCode, bytes32("CODE"));
        assertEq(c.poolVersion, bingo.poolVersion());
        assertEq(uint256(c.mintedAt), block.timestamp);
        assertEq(uint256(c.expiresAt), block.timestamp + CARD_EXPIRY);
        assertEq(c.sponsorBalance, CARD_PRICE);
        assertEq(c.cardPriceAtMint, CARD_PRICE);
        assertEq(uint256(c.referralBpsAtMint), REFERRAL_BPS);
        assertEq(c.revealed, false);
        assertEq(uint256(c.filledLineBitmap), 0);
    }

    function test_mintCard_tracksOutstandingSponsorBalance() public {
        _mint(bytes32(0));
        _mint(bytes32(0));
        assertEq(bingo.outstandingSponsorBalance(), CARD_PRICE * 2);
    }

    function test_mintCard_assignsIncrementingIds() public {
        uint256 a = _mint(bytes32(0));
        uint256 b = _mint(bytes32(0));
        assertEq(a, 1);
        assertEq(b, 2);
    }

    function test_mintCard_emitsCardMinted() public {
        vm.expectEmit(true, true, false, true);
        emit CardMinted(1, player, bytes32("X"), 1);
        _mint(bytes32("X"));
    }

    function test_mintCard_storesPendingReveal() public {
        uint256 cardId = _mint(bytes32(0));
        assertEq(bingo.pendingReveal(1), cardId);
    }

    function test_mintCard_revertsIfPoolTooSmall() public {
        BingoCard fresh = new BingoCard(
            address(collateral), address(entropy), entropyProvider, owner
        );
        vm.startPrank(owner);
        fresh.setCardPrice(CARD_PRICE);
        vm.stopPrank();
        collateral.mint(player, CARD_PRICE);
        vm.startPrank(player);
        collateral.approve(address(fresh), type(uint256).max);
        vm.expectRevert(BingoCard.PoolTooSmall.selector);
        fresh.mintCard{ value: ENTROPY_FEE }(bytes32(0));
        vm.stopPrank();
    }

    function test_mintCard_revertsIfCardPriceUnset() public {
        BingoCard fresh = new BingoCard(
            address(collateral), address(entropy), entropyProvider, owner
        );
        // Seed pool only — leave cardPrice at zero.
        bytes32[] memory ids = new bytes32[](20);
        address[] memory resolvers = new address[](20);
        for (uint256 i = 0; i < 20; i++) {
            ids[i] = keccak256(abi.encode("c", i));
            resolvers[i] = address(uint160(i + 1));
        }
        vm.prank(owner);
        fresh.setPool(ids, resolvers);
        vm.expectRevert(BingoCard.CardPriceTooLow.selector);
        vm.prank(player);
        fresh.mintCard{ value: ENTROPY_FEE }(bytes32(0));
    }

    // ---- entropyCallback (reveal) ----

    function _reveal(uint64 seq, bytes32 random) internal {
        entropy.pushCallback(seq, entropyProvider, random);
    }

    function test_reveal_marksRevealedAndFillsCells() public {
        uint256 cardId = _mint(bytes32(0));
        _reveal(1, bytes32(uint256(0xABCD)));

        BingoCard.Card memory c = bingo.cardOf(cardId);
        assertTrue(c.revealed);
        for (uint256 i = 0; i < 16; i++) {
            assertTrue(c.conditionIds[i] != bytes32(0));
            assertTrue(c.resolvers[i] != address(0));
        }
    }

    function test_reveal_cellsAreUnique() public {
        uint256 cardId = _mint(bytes32(0));
        _reveal(1, bytes32(uint256(0xDEADBEEF)));

        BingoCard.Card memory c = bingo.cardOf(cardId);
        for (uint256 i = 0; i < 16; i++) {
            for (uint256 j = i + 1; j < 16; j++) {
                assertTrue(c.conditionIds[i] != c.conditionIds[j], "dup cell");
            }
        }
    }

    function test_reveal_pairsConditionWithItsResolver() public {
        uint256 cardId = _mint(bytes32(0));
        _reveal(1, bytes32(uint256(0x42)));
        BingoCard.Card memory c = bingo.cardOf(cardId);

        for (uint256 i = 0; i < 16; i++) {
            // Pool was seeded with deterministic pairs: ids[k] = hash("cond",k),
            // resolvers[k] = 0xC0DE000 + k. The reveal must keep each cell's
            // resolver aligned to its conditionId.
            bool found;
            for (uint256 k = 0; k < 20; k++) {
                if (c.conditionIds[i] == keccak256(abi.encode("cond", k))) {
                    assertEq(c.resolvers[i], address(uint160(0xC0DE000 + k)));
                    found = true;
                    break;
                }
            }
            assertTrue(found, "cell not from pool");
        }
    }

    function test_reveal_deterministicFromRandom() public {
        uint256 cardA = _mint(bytes32(0));
        uint256 cardB = _mint(bytes32(0));
        _reveal(1, bytes32(uint256(0x1234)));
        _reveal(2, bytes32(uint256(0x1234)));

        BingoCard.Card memory a = bingo.cardOf(cardA);
        BingoCard.Card memory b = bingo.cardOf(cardB);
        for (uint256 i = 0; i < 16; i++) {
            assertEq(a.conditionIds[i], b.conditionIds[i]);
        }
    }

    function test_reveal_emitsCardRevealed() public {
        uint256 cardId = _mint(bytes32(0));
        vm.expectEmit(true, false, false, true);
        emit CardRevealed(cardId, bytes32(uint256(0x99)));
        _reveal(1, bytes32(uint256(0x99)));
    }

    function test_reveal_clearsPendingReveal() public {
        _mint(bytes32(0));
        _reveal(1, bytes32(uint256(0x99)));
        assertEq(bingo.pendingReveal(1), 0);
    }

    function test_entropyCallback_revertsIfNotEntropyContract() public {
        _mint(bytes32(0));
        vm.expectRevert(IEntropyConsumer.NotEntropyContract.selector);
        bingo.entropyCallback(1, entropyProvider, bytes32(uint256(1)));
    }

    function test_entropyCallback_revertsOnUnknownSequence() public {
        // Bypass MockEntropy's own bookkeeping by calling the consumer directly
        // as the entropy contract would.
        vm.prank(address(entropy));
        vm.expectRevert(BingoCard.UnknownSequence.selector);
        bingo.entropyCallback(99, entropyProvider, bytes32(uint256(1)));
    }
}
