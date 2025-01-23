// SPDX-License-Identifier: MIT
pragma solidity >=0.8.2 <0.9.0;

import "forge-std/Test.sol";
import "cannon-std/Cannon.sol";
import {IFoil} from "../../src/market/interfaces/IFoil.sol";
import {IMintableToken} from "../../src/market/external/IMintableToken.sol";
import {TestVault} from "../helpers/TestVault.sol";
import {TestUser} from "../helpers/TestUser.sol";
import {IVault} from "../../src/vault/interfaces/IVault.sol";
import {IFoilStructs} from "../../src/market/interfaces/IFoilStructs.sol";

contract VaultFailureTest is TestVault {
    using Cannon for Vm;

    IFoil foil;
    IVault vault;
    IMintableToken collateralAsset;

    uint160 initialSqrtPriceX96 = 250541448375047946302209916928; // 10
    uint256 epochStartTime;

    address lp1;
    address lp2;
    address lp3;

    address trader1;

    function setUp() public {
        lp1 = TestUser.createUser("LP1", 100_000 ether);
        lp2 = TestUser.createUser("LP2", 100_000 ether);
        lp3 = TestUser.createUser("LP3", 100_000 ether);
        trader1 = TestUser.createUser("Trader1", 100 ether);

        (foil, vault, collateralAsset) = initializeVault(
            new address[](0),
            100 ether,
            10_000
        );

        vm.prank(lp1);
        vault.requestDeposit(10 ether);

        vm.prank(lp3);
        vault.requestDeposit(15 ether);

        epochStartTime = block.timestamp + 60;
        vm.prank(vaultOwner);
        vault.initializeFirstEpoch(initialSqrtPriceX96, block.timestamp);

        vault.deposit(0, lp1);

        vm.prank(lp1);
        vault.requestRedeem(5 ether);

        vm.prank(lp2);
        vault.requestDeposit(10 ether);

        vm.mockCallRevert(
            address(vault),
            abi.encodeWithSelector(IVault.createNewEpochAndPosition.selector),
            "Forced revert"
        );

        vm.warp(epochStartTime + 30 days);
        settleEpoch(1, initialSqrtPriceX96, address(vault));
    }

    function test_haltsVault_whenCreateNewEpochAndPositionReverts() public {
        // Verify vault is halted
        assertTrue(vault.isHalted(), "Vault should be halted");

        // ensure share price is still set
        assertApproxEqAbs(
            vault.epochSharePrice(1),
            1e18,
            1e3,
            "Share price should be within 1e3 of 1e18"
        );
    }

    function test_haltedVault_canRedeem() public {
        uint256 balanceBefore = collateralAsset.balanceOf(lp1);

        vm.startPrank(lp1);
        vault.redeem(lp1); // redeem original request

        vault.requestRedeem(5 ether); // add 5 eth to the previous redeem request
        vault.redeem(lp1); // can redeem in same epoch since vault is halted

        vm.stopPrank();

        // Verify lp1 collateral balance is back to original
        assertApproxEqAbs(
            collateralAsset.balanceOf(lp1),
            balanceBefore + 10 ether,
            1e3,
            "LP1 should have original collateral back"
        );
    }

    function test_haltedVault_canWithdrawDeposit() public {
        uint256 balanceBefore = collateralAsset.balanceOf(lp2);

        vm.prank(lp2);
        vault.withdrawRequestDeposit(10 ether);

        assertEq(
            collateralAsset.balanceOf(lp2),
            balanceBefore + 10 ether,
            "LP2 should have original collateral back"
        );
    }

    function test_vaultHalted_onlyVaultInitializerCanResume() public {
        vm.clearMockedCalls();

        vm.prank(lp1);
        vm.expectRevert("Action not allowed");
        vault.createNewEpochAndPosition(
            block.timestamp,
            initialSqrtPriceX96,
            9 ether
        );

        vm.prank(vaultOwner);
        vault.createNewEpochAndPosition(
            block.timestamp,
            initialSqrtPriceX96,
            9 ether
        );
    }

    function test_vaultResumed_cannotRedeemInSameEpoch() public {
        vm.clearMockedCalls();

        vm.prank(vaultOwner);
        vault.createNewEpochAndPosition(
            block.timestamp,
            initialSqrtPriceX96,
            9 ether
        );

        vm.startPrank(lp1);
        vault.redeem(lp1);
        vault.requestRedeem(5 ether);

        vm.expectRevert("Previous withdraw request is in the current epoch");
        vault.redeem(lp1);

        vm.stopPrank();
    }

    function traderBuysGas(
        address trader,
        uint256 amount
    ) internal returns (uint256 traderPositionId) {
        (IFoilStructs.EpochData memory epochData, ) = foil.getLatestEpoch();

        vm.startPrank(trader);
        traderPositionId = addTraderPosition(
            foil,
            epochData.epochId,
            int256(amount)
        );
        vm.stopPrank();
    }

    function test_reverts_when_not_settlement_price_submitter() public {
        vm.clearMockedCalls();

        vm.prank(lp1);
        vm.expectRevert("Not authorized");
        vault.createNewEpochAndPosition(
            block.timestamp,
            initialSqrtPriceX96,
            9 ether
        );
    }

    function test_vaultResumed_futureEpochsWorkProperly() public {
        vm.clearMockedCalls();

        vm.prank(vaultOwner);
        vault.createNewEpochAndPosition(
            block.timestamp,
            initialSqrtPriceX96,
            9 ether
        );

        vm.prank(lp1);
        vault.redeem(lp1);

        vm.prank(lp2);
        vault.deposit(0, lp2);

        vm.prank(lp1);
        vault.requestRedeem(5 ether);

        (uint256 pendingDeposits, uint256 pendingWithdrawals, ) = vault
            .pendingValues();

        assertEq(pendingDeposits, 0, "Pending deposits should be 0");
        assertEq(
            pendingWithdrawals,
            5 ether,
            "Pending withdrawals should be 5 ether"
        );

        // next epoch
        traderBuysGas(trader1, 0.1 ether);

        vm.warp(block.timestamp + 30 days);
        settleEpoch(2, initialSqrtPriceX96, address(vault));

        vault.redeem(lp1);
        vault.deposit(0, lp3);

        assertEq(
            vault.balanceOf(lp3),
            15 ether,
            "LP3 shares should be 15 ether"
        );
    }
}
