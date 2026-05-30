// SPDX-License-Identifier: MIT
pragma solidity ^0.8.19;

import "./BingoCardTestBase.sol";

contract BingoCardMintTest is BingoCardTestBase {
    event CardMinted(
        uint256 indexed cardId, address indexed player, bytes32 refCode
    );
    event CardRevealed(uint256 indexed cardId, bytes32 seed);

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
        cardId = bingo.mintCard(refCode, CARD_PRICE);
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
        // cardId is known (nextCardId starts at 0 → first mint is 1); match all.
        vm.expectEmit(true, true, false, true);
        emit CardMinted(1, player, bytes32("X"));
        _mint(bytes32("X"));
    }

    function test_mintCard_revertsIfPoolTooSmall() public {
        BingoCard fresh = new BingoCard(address(collateral), owner);
        vm.startPrank(owner);
        fresh.setMinCardPrice(CARD_PRICE);
        vm.stopPrank();
        collateral.mint(player, CARD_PRICE);
        vm.startPrank(player);
        collateral.approve(address(fresh), type(uint256).max);
        vm.expectRevert(BingoCard.PoolTooSmall.selector);
        fresh.mintCard(bytes32(0), CARD_PRICE);
        vm.stopPrank();
    }

    function test_mintCard_revertsIfBelowMinCardPrice() public {
        // Configure minCardPrice = CARD_PRICE; minting at half that must revert.
        vm.prank(player);
        vm.expectRevert(BingoCard.CardPriceTooLow.selector);
        bingo.mintCard(bytes32(0), CARD_PRICE / 2);
    }

    function test_mintCard_revertsIfNotDivisibleByLines() public {
        // Per-line stake math requires cardPrice_ % LINES_PER_CARD == 0.
        vm.prank(player);
        vm.expectRevert(BingoCard.CardPriceTooLow.selector);
        bingo.mintCard(bytes32(0), CARD_PRICE + 1);
    }

    function test_mintCard_acceptsAboveMinimum() public {
        // Any multiple-of-LINES_PER_CARD price >= minCardPrice succeeds.
        uint256 customPrice = CARD_PRICE * 5;
        collateral.mint(player, customPrice);
        vm.prank(player);
        uint256 cardId = bingo.mintCard(bytes32(0), customPrice);
        BingoCard.Card memory c = bingo.cardOf(cardId);
        assertEq(c.cardPriceAtMint, customPrice);
        assertEq(c.sponsorBalance, customPrice);
    }

    // ---- draw (cells assigned synchronously at mint) ----

    function test_mint_fillsAll16Cells() public {
        uint256 cardId = _mint(bytes32(0));

        BingoCard.Card memory c = bingo.cardOf(cardId);
        for (uint256 i = 0; i < 16; i++) {
            assertTrue(c.conditionIds[i] != bytes32(0));
            assertTrue(c.resolvers[i] != address(0));
        }
    }

    function test_mint_cellsAreUnique() public {
        uint256 cardId = _mint(bytes32(0));

        BingoCard.Card memory c = bingo.cardOf(cardId);
        for (uint256 i = 0; i < 16; i++) {
            for (uint256 j = i + 1; j < 16; j++) {
                assertTrue(c.conditionIds[i] != c.conditionIds[j], "dup cell");
            }
        }
    }

    function test_mint_pairsConditionWithItsResolver() public {
        uint256 cardId = _mint(bytes32(0));
        BingoCard.Card memory c = bingo.cardOf(cardId);

        for (uint256 i = 0; i < 16; i++) {
            // Pool was seeded with deterministic pairs: ids[k] = hash("cond",k),
            // resolvers[k] = 0xC0DE000 + k. The draw must keep each cell's
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

    function test_mint_doesNotMutateSharedPool() public {
        // Drawing copies the pool into memory; the live pool is untouched so
        // later cards still draw from the full set.
        _mint(bytes32(0));
        assertEq(bingo.poolSize(), 20, "pool size unchanged");
        assertEq(
            bingo.poolConditionIds(0),
            keccak256(abi.encode("cond", 0)),
            "pool[0] intact"
        );
    }

    function test_mint_differentCardsDrawDifferentLayouts() public {
        // Seed contributes block.timestamp + cardId + player; two cards minted
        // in different blocks should not be forced to share a layout.
        uint256 a = _mint(bytes32(0));
        vm.warp(block.timestamp + 12);
        vm.roll(block.number + 1);
        uint256 b = _mint(bytes32(0));

        BingoCard.Card memory ca = bingo.cardOf(a);
        BingoCard.Card memory cb = bingo.cardOf(b);
        bool anyDiff;
        for (uint256 i = 0; i < 16; i++) {
            if (ca.conditionIds[i] != cb.conditionIds[i]) {
                anyDiff = true;
                break;
            }
        }
        assertTrue(anyDiff, "layouts should differ across blocks");
    }
}
