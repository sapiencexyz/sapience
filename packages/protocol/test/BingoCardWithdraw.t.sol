// SPDX-License-Identifier: MIT
pragma solidity ^0.8.19;

import "./BingoCardTestBase.sol";

contract BingoCardWithdrawTest is BingoCardTestBase {
    event UnusedWithdrawn(
        uint256 indexed cardId, address indexed to, uint256 amount
    );

    function setUp() public override {
        super.setUp();
        _seedDefaultPool();
        _configureDefaults();
        collateral.mint(player, 100 * DECIMALS);
        vm.prank(player);
        collateral.approve(address(bingo), type(uint256).max);
    }

    function _mintCard() internal returns (uint256 cardId) {
        vm.prank(player);
        cardId = bingo.mintCard(bytes32(0), CARD_PRICE);
    }

    function test_withdrawUnused_revertsBeforeExpiry() public {
        uint256 cardId = _mintCard();
        vm.prank(player);
        vm.expectRevert(BingoCard.CardNotExpired.selector);
        bingo.withdrawUnused(cardId);
    }

    function test_withdrawUnused_revertsIfNotPlayer() public {
        uint256 cardId = _mintCard();
        vm.warp(block.timestamp + CARD_EXPIRY + 1);
        vm.prank(address(0xBEEF));
        vm.expectRevert(BingoCard.PlayerMismatch.selector);
        bingo.withdrawUnused(cardId);
    }

    function test_withdrawUnused_paysOutAndZerosSponsorBalance() public {
        uint256 cardId = _mintCard();
        vm.warp(block.timestamp + CARD_EXPIRY + 1);

        uint256 before = collateral.balanceOf(player);
        vm.prank(player);
        bingo.withdrawUnused(cardId);

        assertEq(collateral.balanceOf(player), before + CARD_PRICE);
        BingoCard.Card memory c = bingo.cardOf(cardId);
        assertEq(c.sponsorBalance, 0);
        assertEq(bingo.outstandingSponsorBalance(), 0);
    }

    function test_withdrawUnused_revertsIfAlreadyZero() public {
        uint256 cardId = _mintCard();
        vm.warp(block.timestamp + CARD_EXPIRY + 1);
        vm.prank(player);
        bingo.withdrawUnused(cardId);

        vm.prank(player);
        vm.expectRevert(BingoCard.NothingToWithdraw.selector);
        bingo.withdrawUnused(cardId);
    }

    function test_withdrawUnused_emitsEvent() public {
        uint256 cardId = _mintCard();
        vm.warp(block.timestamp + CARD_EXPIRY + 1);

        vm.expectEmit(true, true, false, true);
        emit UnusedWithdrawn(cardId, player, CARD_PRICE);
        vm.prank(player);
        bingo.withdrawUnused(cardId);
    }

    function test_withdrawUnused_revertsOnUnknownCard() public {
        vm.prank(player);
        vm.expectRevert(BingoCard.CardNotFound.selector);
        bingo.withdrawUnused(999);
    }
}
