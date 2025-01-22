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
    function setUp() public {
        lp1 = TestUser.createUser("LP1", 100_000 ether);
        lp2 = TestUser.createUser("LP2", 100_000 ether);

        (foil, vault, collateralAsset) = initializeVault(
            new address[](0),
            100 ether,
            10_000
        );

        vm.prank(lp1);
        vault.requestDeposit(10 ether);

        vm.prank(lp2);
        vault.requestDeposit(1 ether);

        epochStartTime = block.timestamp + 60;
        vm.prank(vaultOwner);
        vault.initializeFirstEpoch(initialSqrtPriceX96, block.timestamp);

        vault.deposit(0, lp1);
        vault.deposit(0, lp2);

        vm.prank(lp1);
        vault.requestRedeem(5 ether);

        epochStartTime += 30 days;
        vm.warp(epochStartTime);
        settleEpoch(1, initialSqrtPriceX96, address(vault));

        vm.mockCallRevert(
            address(vault),
            abi.encodeWithSelector(IVault.createNewEpochAndPosition.selector),
            "Forced revert"
        );

        vm.warp(epochStartTime + 30 days);
        settleEpoch(2, initialSqrtPriceX96, address(vault));
    }

    function test_redeemFromPreviousEpoch_whenVaultIsHalted() public {
        vm.prank(lp1);
        vault.redeem(lp1);

        assertEq(vault.balanceOf(lp1), 5 ether);

        vm.startPrank(lp1);
        vault.requestRedeem(5 ether);
        vault.redeem(lp1);

        assertEq(vault.balanceOf(lp1), 0 ether);
    }
}
