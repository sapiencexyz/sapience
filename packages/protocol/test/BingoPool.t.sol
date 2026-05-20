// SPDX-License-Identifier: MIT
pragma solidity ^0.8.19;

import "forge-std/Test.sol";

import "../src/bingo/BingoPool.sol";
import "./mocks/MockERC20.sol";

contract BingoPoolTest is Test {
    BingoPool internal pool;
    MockERC20 internal token;

    address internal owner = address(0xA11CE);
    address internal stranger = address(0xB0B);

    function setUp() public {
        token = new MockERC20("USDe", "USDe", 18);
        pool = new BingoPool(address(token), owner);
    }

    // ============ conditions ============

    function test_addCondition_appendsAndIndexes() public {
        bytes memory cid = hex"deadbeef";
        address resolver = address(0xAA);

        vm.prank(owner);
        pool.addCondition(resolver, cid);

        assertEq(pool.conditionCount(), 1);
        (address gotResolver, bytes memory gotId) = pool.conditionAt(0);
        assertEq(gotResolver, resolver);
        assertEq(gotId, cid);
        assertTrue(pool.hasCondition(resolver, cid));
    }

    function test_addCondition_revertWhenDuplicate() public {
        bytes memory cid = hex"01";
        vm.startPrank(owner);
        pool.addCondition(address(0xAA), cid);
        vm.expectRevert(BingoPool.ConditionAlreadyExists.selector);
        pool.addCondition(address(0xAA), cid);
        vm.stopPrank();
    }

    function test_addCondition_revertWhenNotOwner() public {
        vm.prank(stranger);
        vm.expectRevert();
        pool.addCondition(address(0xAA), hex"01");
    }

    function test_removeCondition_swapPopMiddle() public {
        vm.startPrank(owner);
        pool.addCondition(address(0xA1), hex"01");
        pool.addCondition(address(0xA2), hex"02");
        pool.addCondition(address(0xA3), hex"03");
        pool.removeCondition(address(0xA2), hex"02");
        vm.stopPrank();

        assertEq(pool.conditionCount(), 2);
        // index 1 should now hold the old last entry (0xA3)
        (address resolver, bytes memory cid) = pool.conditionAt(1);
        assertEq(resolver, address(0xA3));
        assertEq(cid, hex"03");
        assertFalse(pool.hasCondition(address(0xA2), hex"02"));
        assertTrue(pool.hasCondition(address(0xA1), hex"01"));
        assertTrue(pool.hasCondition(address(0xA3), hex"03"));
    }

    function test_removeCondition_revertWhenMissing() public {
        vm.prank(owner);
        vm.expectRevert(BingoPool.ConditionNotFound.selector);
        pool.removeCondition(address(0xAA), hex"01");
    }

    function test_conditionAt_revertWhenOutOfBounds() public {
        vm.expectRevert(BingoPool.IndexOutOfBounds.selector);
        pool.conditionAt(0);
    }

    // ============ bonus reserve ============

    function test_depositBonus_pullsTokens() public {
        token.mint(stranger, 100 ether);
        vm.prank(stranger);
        token.approve(address(pool), 100 ether);

        vm.prank(stranger);
        pool.depositBonus(40 ether);

        assertEq(pool.bonusBalance(), 40 ether);
        assertEq(token.balanceOf(stranger), 60 ether);
    }

    function test_withdrawBonus_ownerOnly() public {
        token.mint(address(pool), 100 ether);

        vm.prank(stranger);
        vm.expectRevert();
        pool.withdrawBonus(10 ether, stranger);

        vm.prank(owner);
        pool.withdrawBonus(30 ether, stranger);

        assertEq(pool.bonusBalance(), 70 ether);
        assertEq(token.balanceOf(stranger), 30 ether);
    }
}
