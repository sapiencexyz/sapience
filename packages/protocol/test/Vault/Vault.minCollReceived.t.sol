// SPDX-License-Identifier: MIT
pragma solidity >=0.8.2 <0.9.0;

import "forge-std/Test.sol";
import "cannon-std/Cannon.sol";
import {IFoil} from "../../src/market/interfaces/IFoil.sol";
import {IMintableToken} from "../../src/market/external/IMintableToken.sol";
import {TestVault} from "../helpers/TestVault.sol";
import {TestUser} from "../helpers/TestUser.sol";
import {ISettlementModule} from "../../src/market/interfaces/ISettlementModule.sol";
import {IVault} from "../../src/vault/interfaces/IVault.sol";
import {IFoilStructs} from "../../src/market/interfaces/IFoilStructs.sol";

contract VaultMinimumCollateralReceived is TestVault {
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
        vault.initializeFirstEpoch(initialSqrtPriceX96);

        vault.deposit(0, lp1);

        vm.prank(lp1);
        vault.requestRedeem(5 ether);

        vm.mockCall(
            address(foil),
            abi.encodeWithSelector(ISettlementModule.settlePosition.selector),
            abi.encode(1e7)
        );

        // since we mock call, send collateral to vault for redemption
        collateralAsset.mint(1e7, address(vault));

        vm.warp(epochStartTime + 30 days);
        settleEpoch(1, initialSqrtPriceX96, address(vault));
    }

    function test_haltsVault_whenLowerThanMinimumIsReturned() public view {
        // Verify vault is halted
        assertTrue(vault.isHalted(), "Vault should be halted");
    }

    function test_haltedVault_canRedeemAtSharePrice() public {
        // Get share price for epoch 1
        uint256 sharePrice = vault.epochSharePrice(1);

        // Share price should reflect the 1e7 collateral received divided by total supply
        assertEq(
            sharePrice,
            (1e7 * 1e18) / vault.totalSupply(),
            "Share price should reflect collateral received"
        );

        vm.prank(lp1);
        vault.redeem(lp1);
    }

    function test_haltedVault_canRedeemAtSharePrice_afterManualStart() public {
        vm.prank(lp2);
        vault.requestDeposit(1e9);

        vm.prank(vaultOwner);
        vault.createNewEpochAndPosition(
            block.timestamp + 1 days,
            initialSqrtPriceX96,
            1e7
        );

        assertEq(
            vault.getCurrentEpoch().startTime,
            block.timestamp + 1 days,
            "New epoch start time should equal block.timestamp"
        );

        vm.prank(lp1);
        vault.redeem(lp1);
    }
}
