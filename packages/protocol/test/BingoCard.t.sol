// SPDX-License-Identifier: MIT
pragma solidity ^0.8.19;

import "forge-std/Test.sol";

import "../src/bingo/BingoCard.sol";
import "./mocks/MockEntropy.sol";

contract BingoCardTest is Test {
    BingoCard internal card;
    MockEntropy internal entropy;

    address internal owner = address(0xA11CE);
    address internal user = address(0xB0B);
    address internal provider = address(0xBEEF);
    uint128 internal constant FEE = 1 wei;

    function setUp() public {
        entropy = new MockEntropy();
        entropy.setFee(FEE);
        card = new BingoCard(address(entropy), provider, owner);
        vm.deal(user, 10 ether);
    }

    function test_mint_assignsTokenAndRequestsEntropy() public {
        vm.prank(user);
        uint256 tokenId = card.mint{ value: FEE }(bytes32(uint256(0x1)));

        assertEq(tokenId, 1);
        assertEq(card.ownerOf(tokenId), user);
        assertEq(entropy.consumerOf(1), address(card));
        assertEq(card.randomNumberOf(tokenId), bytes32(0));
    }

    function test_mint_refundsExcessFee() public {
        uint256 before = user.balance;
        vm.prank(user);
        card.mint{ value: FEE + 5 wei }(bytes32(uint256(0x1)));
        assertEq(user.balance, before - FEE);
    }

    function test_mint_revertWhenFeeUnderpaid() public {
        vm.prank(user);
        vm.expectRevert(BingoCard.InsufficientEntropyFee.selector);
        card.mint{ value: 0 }(bytes32(uint256(0x1)));
    }

    function test_entropyCallback_setsRandomNumber() public {
        vm.prank(user);
        uint256 tokenId = card.mint{ value: FEE }(bytes32(uint256(0x1)));

        bytes32 randomNumber = keccak256("roll");
        entropy.pushCallback(1, provider, randomNumber);

        assertEq(card.randomNumberOf(tokenId), randomNumber);
    }

    function test_entropyCallback_revertWhenAlreadyRolled() public {
        vm.prank(user);
        card.mint{ value: FEE }(bytes32(uint256(0x1)));
        entropy.pushCallback(1, provider, keccak256("first"));

        // Forging a second callback for the same sequence: mock allows it,
        // but contract should reject because the slot is gone.
        vm.expectRevert(BingoCard.UnknownSequence.selector);
        entropy.pushCallback(1, provider, keccak256("second"));
    }

    function test_entropyCallback_revertWhenWrongCaller() public {
        vm.prank(user);
        card.mint{ value: FEE }(bytes32(uint256(0x1)));

        vm.expectRevert(IEntropyConsumer.NotEntropyContract.selector);
        card.entropyCallback(1, provider, keccak256("roll"));
    }

    function test_cardIsTransferable() public {
        vm.prank(user);
        uint256 tokenId = card.mint{ value: FEE }(bytes32(uint256(0x1)));

        address recipient = address(0xCAFE);
        vm.prank(user);
        card.transferFrom(user, recipient, tokenId);

        assertEq(card.ownerOf(tokenId), recipient);
    }
}
