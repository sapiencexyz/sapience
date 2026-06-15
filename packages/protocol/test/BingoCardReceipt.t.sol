// SPDX-License-Identifier: MIT
pragma solidity ^0.8.19;

import "forge-std/Test.sol";
import "@openzeppelin/contracts/token/ERC721/IERC721Receiver.sol";

import "../src/bingo/BingoCardReceipt.sol";
import "./mocks/MockERC20.sol";

contract BingoCardReceiptTest is Test {
    BingoCardReceipt internal receipt;
    MockERC20 internal usde;

    address internal owner = address(0xA11CE);
    address internal minter = address(0x5E11E5);
    address internal player = address(0xB0B);
    address internal referrer = address(0xCAFE);

    string internal constant POOL_ID = "world-cup-2026-06-10";
    bytes32 internal constant SEED = keccak256("seed");
    uint16 internal constant YES_MASK = 0xABCD;
    uint256 internal constant CARD_PRICE = 5e18;

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

    function setUp() public {
        usde = new MockERC20("USDe", "USDe", 18);
        receipt = new BingoCardReceipt(address(usde), owner);
        vm.prank(owner);
        receipt.setMinter(minter);

        // Treasury = owner; fund + approve for payout pulls.
        usde.mint(owner, 1000e18);
        vm.prank(owner);
        usde.approve(address(receipt), type(uint256).max);
    }

    function _mint(address to, address ref) internal returns (uint256) {
        return _mintIndexed(to, 0, ref);
    }

    function _mintIndexed(address to, uint32 cardIndex, address ref)
        internal
        returns (uint256)
    {
        vm.prank(minter);
        return
            receipt.mint(
                to, POOL_ID, cardIndex, SEED, YES_MASK, CARD_PRICE, ref
            );
    }

    // ---- mint ----

    function test_mint_stampsMetaAndOwnership() public {
        uint256 id = _mint(player, referrer);
        assertEq(receipt.ownerOf(id), player);
        (
            bytes32 poolHash,
            bytes32 seed,
            address ref,
            uint64 submittedAt,
            uint16 yesMask,
            uint32 cardIndex,
            uint256 cardPrice,
            bool bonusPaid,
            bool referralPaid
        ) = receipt.cardMeta(id);
        assertEq(poolHash, keccak256(bytes(POOL_ID)));
        assertEq(seed, SEED);
        assertEq(ref, referrer);
        assertEq(uint256(submittedAt), block.timestamp);
        assertEq(uint256(yesMask), uint256(YES_MASK));
        assertEq(uint256(cardIndex), 0);
        assertEq(cardPrice, CARD_PRICE);
        assertFalse(bonusPaid);
        assertFalse(referralPaid);
        assertEq(
            receipt.tokenOfPlayerPoolIndex(
                keccak256(bytes(POOL_ID)), player, 0
            ),
            id
        );
        assertEq(receipt.cardCount(keccak256(bytes(POOL_ID)), player), 1);
    }

    function test_mint_emitsEvent() public {
        vm.expectEmit(true, true, true, true);
        emit CardReceiptMinted(
            1,
            player,
            keccak256(bytes(POOL_ID)),
            POOL_ID,
            0,
            SEED,
            YES_MASK,
            CARD_PRICE,
            referrer
        );
        _mint(player, referrer);
    }

    function test_mint_revertsForNonMinter() public {
        vm.prank(player);
        vm.expectRevert(BingoCardReceipt.NotMinter.selector);
        receipt.mint(player, POOL_ID, 0, SEED, YES_MASK, CARD_PRICE, referrer);
    }

    function test_mint_ownerCanMintToo() public {
        vm.prank(owner);
        uint256 id = receipt.mint(
            player, POOL_ID, 0, SEED, YES_MASK, CARD_PRICE, referrer
        );
        assertEq(receipt.ownerOf(id), player);
    }

    function test_mint_retrySameIndexReverts() public {
        // Idempotency backstop: index 0 was minted, replaying it reverts
        // with the next expected index.
        _mint(player, referrer);
        vm.prank(minter);
        vm.expectRevert(
            abi.encodeWithSelector(
                BingoCardReceipt.CardIndexMismatch.selector, uint32(1)
            )
        );
        receipt.mint(player, POOL_ID, 0, SEED, YES_MASK, CARD_PRICE, referrer);
    }

    function test_mint_sequentialIndexes() public {
        bytes32 poolHash = keccak256(bytes(POOL_ID));
        uint256 first = _mintIndexed(player, 0, referrer);
        uint256 second = _mintIndexed(player, 1, address(0));
        assertEq(receipt.cardCount(poolHash, player), 2);
        assertEq(receipt.tokenOfPlayerPoolIndex(poolHash, player, 0), first);
        assertEq(receipt.tokenOfPlayerPoolIndex(poolHash, player, 1), second);
        (,,,,, uint32 idx0,,,) = receipt.cardMeta(first);
        (,,,,, uint32 idx1,,,) = receipt.cardMeta(second);
        assertEq(uint256(idx0), 0);
        assertEq(uint256(idx1), 1);
        assertEq(receipt.ownerOf(first), player);
        assertEq(receipt.ownerOf(second), player);
    }

    function test_mint_skipIndexReverts() public {
        vm.prank(minter);
        vm.expectRevert(
            abi.encodeWithSelector(
                BingoCardReceipt.CardIndexMismatch.selector, uint32(0)
            )
        );
        receipt.mint(player, POOL_ID, 1, SEED, YES_MASK, CARD_PRICE, referrer);
    }

    function test_mint_indexesIndependentPerPool() public {
        _mintIndexed(player, 0, referrer);
        // A different pool starts back at index 0 for the same player.
        vm.prank(minter);
        uint256 id = receipt.mint(
            player, "another-pool", 0, SEED, YES_MASK, CARD_PRICE, referrer
        );
        assertEq(id, 2);
        assertEq(receipt.cardCount(keccak256(bytes("another-pool")), player), 1);
        assertEq(receipt.cardCount(keccak256(bytes(POOL_ID)), player), 1);
    }

    // ---- payBonus ----

    function test_payBonus_paysCurrentOwner() public {
        uint256 id = _mint(player, referrer);
        vm.expectEmit(true, true, false, true);
        emit BonusPaid(id, player, 3, 15e18);
        vm.prank(owner);
        receipt.payBonus(id, 3, 15e18);
        assertEq(usde.balanceOf(player), 15e18);
    }

    function test_payBonus_followsTransfers() public {
        // The bonus claim is transferable: pay whoever holds the NFT now.
        uint256 id = _mint(player, referrer);
        address buyer = address(0xBEEF);
        vm.prank(player);
        receipt.transferFrom(player, buyer, id);

        vm.prank(owner);
        receipt.payBonus(id, 2, 10e18);
        assertEq(usde.balanceOf(buyer), 10e18);
        assertEq(usde.balanceOf(player), 0);
    }

    function test_payBonus_perCardIndependent() public {
        // Paying card 0's bonus must not touch card 1's one-shot flag.
        uint256 first = _mintIndexed(player, 0, referrer);
        uint256 second = _mintIndexed(player, 1, referrer);
        vm.startPrank(owner);
        receipt.payBonus(first, 2, 10e18);
        receipt.payBonus(second, 3, 15e18);
        vm.stopPrank();
        assertEq(usde.balanceOf(player), 25e18);
    }

    function test_payBonus_oneShot() public {
        uint256 id = _mint(player, referrer);
        vm.startPrank(owner);
        receipt.payBonus(id, 2, 10e18);
        vm.expectRevert(BingoCardReceipt.AlreadyPaid.selector);
        receipt.payBonus(id, 2, 10e18);
        vm.stopPrank();
    }

    function test_payBonus_onlyOwner() public {
        uint256 id = _mint(player, referrer);
        vm.prank(minter);
        vm.expectRevert();
        receipt.payBonus(id, 2, 10e18);
    }

    function test_payBonus_revertsForUnknownToken() public {
        vm.prank(owner);
        vm.expectRevert();
        receipt.payBonus(999, 2, 10e18);
    }

    // ---- payReferral ----

    function test_payReferral_paysStampedReferrer() public {
        uint256 id = _mint(player, referrer);
        vm.expectEmit(true, true, false, true);
        emit ReferralPaid(id, referrer, 1e17);
        vm.prank(owner);
        receipt.payReferral(id, 1e17);
        assertEq(usde.balanceOf(referrer), 1e17);
    }

    function test_payReferral_ignoresNftTransfers() public {
        // Referral goes to the stamped address even after the card changes
        // hands — the referral was earned at submission time.
        uint256 id = _mint(player, referrer);
        vm.prank(player);
        receipt.transferFrom(player, address(0xBEEF), id);

        vm.prank(owner);
        receipt.payReferral(id, 1e17);
        assertEq(usde.balanceOf(referrer), 1e17);
    }

    function test_payReferral_revertsWithoutReferrer() public {
        uint256 id = _mint(player, address(0));
        vm.prank(owner);
        vm.expectRevert(BingoCardReceipt.NoReferrer.selector);
        receipt.payReferral(id, 1e17);
    }

    function test_payReferral_oneShot() public {
        uint256 id = _mint(player, referrer);
        vm.startPrank(owner);
        receipt.payReferral(id, 1e17);
        vm.expectRevert(BingoCardReceipt.AlreadyPaid.selector);
        receipt.payReferral(id, 1e17);
        vm.stopPrank();
    }

    // ---- misc ----

    function test_contractNeverHoldsFunds() public {
        uint256 id = _mint(player, referrer);
        vm.startPrank(owner);
        receipt.payBonus(id, 2, 10e18);
        receipt.payReferral(id, 1e17);
        vm.stopPrank();
        assertEq(usde.balanceOf(address(receipt)), 0);
    }

    function test_setMinter_onlyOwner() public {
        vm.prank(player);
        vm.expectRevert();
        receipt.setMinter(player);
    }

    function test_tokenURI_usesBaseURI() public {
        uint256 id = _mint(player, referrer);
        vm.prank(owner);
        receipt.setBaseURI("https://combo.bingo/api/nft/");
        assertEq(receipt.tokenURI(id), "https://combo.bingo/api/nft/1");
    }
}
