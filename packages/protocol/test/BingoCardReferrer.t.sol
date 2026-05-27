// SPDX-License-Identifier: MIT
pragma solidity ^0.8.19;

import "forge-std/StdStorage.sol";

import "./BingoCardTestBase.sol";

contract BingoCardReferrerTest is BingoCardTestBase {
    using stdStorage for StdStorage;

    bytes32 internal constant CODE = bytes32("BINGO");

    event CodeRegistered(bytes32 indexed code, address indexed referrer);
    event ReferralEarningsClaimed(address indexed referrer, uint256 amount);

    function test_registerCode_storesReferrer() public {
        vm.prank(referrer);
        bingo.registerCode(CODE);
        assertEq(bingo.referrerOf(CODE), referrer);
    }

    function test_registerCode_emitsEvent() public {
        vm.expectEmit(true, true, false, false);
        emit CodeRegistered(CODE, referrer);
        vm.prank(referrer);
        bingo.registerCode(CODE);
    }

    function test_registerCode_revertsIfTaken() public {
        vm.prank(referrer);
        bingo.registerCode(CODE);

        vm.prank(address(0xD00D));
        vm.expectRevert(BingoCard.CodeTaken.selector);
        bingo.registerCode(CODE);
    }

    function test_registerCode_revertsOnZeroCode() public {
        vm.prank(referrer);
        vm.expectRevert(BingoCard.InvalidCode.selector);
        bingo.registerCode(bytes32(0));
    }

    function test_claimReferralEarnings_revertsIfZero() public {
        vm.prank(referrer);
        vm.expectRevert(BingoCard.NothingToClaim.selector);
        bingo.claimReferralEarnings(referrer);
    }

    function _seedEarnings(address who, uint256 amount) internal {
        stdstore.target(address(bingo)).sig("referralEarnings(address)")
            .with_key(who).checked_write(amount);
        stdstore.target(address(bingo)).sig("outstandingReferralEarnings()")
            .checked_write(bingo.outstandingReferralEarnings() + amount);
        collateral.mint(address(bingo), amount);
    }

    function test_claimReferralEarnings_paysAndZeros() public {
        uint256 amount = 1000;
        _seedEarnings(referrer, amount);

        vm.prank(referrer);
        bingo.claimReferralEarnings(referrer);

        assertEq(collateral.balanceOf(referrer), amount);
        assertEq(bingo.referralEarnings(referrer), 0);
        assertEq(bingo.outstandingReferralEarnings(), 0);
    }

    function test_claimReferralEarnings_paysCustomRecipient() public {
        uint256 amount = 500;
        _seedEarnings(referrer, amount);

        address payout = address(0xFEED);
        vm.prank(referrer);
        bingo.claimReferralEarnings(payout);

        assertEq(collateral.balanceOf(payout), amount);
        assertEq(collateral.balanceOf(referrer), 0);
    }
}
