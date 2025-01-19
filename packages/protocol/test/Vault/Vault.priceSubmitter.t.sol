// SPDX-License-Identifier: MIT
pragma solidity >=0.8.2 <0.9.0;

import "forge-std/Test.sol";
import "cannon-std/Cannon.sol";
import {IFoil} from "../../src/market/interfaces/IFoil.sol";
import {IMintableToken} from "../../src/market/external/IMintableToken.sol";
import {IUMASettlementModule} from "../../src/market/interfaces/IUMASettlementModule.sol";
import {TestVault} from "../helpers/TestVault.sol";
import {TestUser} from "../helpers/TestUser.sol";
import {IVault} from "../../src/vault/interfaces/IVault.sol";
import {IFoilStructs} from "../../src/market/interfaces/IFoilStructs.sol";

contract VaultPriceSubmitterTest is TestVault {
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
        vault.initializeFirstEpoch(initialSqrtPriceX96);

        vault.deposit(0, lp1);
        vault.deposit(0, lp2);

        vm.prank(lp1);
        vault.requestRedeem(5 ether);

        vm.warp(epochStartTime + 30 days);
    }

    function test_reverts_when_not_settlement_price_submitter() public {
        (, , , , IFoilStructs.MarketParams memory marketParams) = foil
            .getMarket();

        IMintableToken bondCurrency = IMintableToken(
            vm.getAddress("BondCurrency.Token")
        );
        bondCurrency.mint(marketParams.bondAmount * 2, lp1);

        bondCurrency.approve(address(vault), marketParams.bondAmount);
        vm.expectRevert("Not authorized");
        vm.prank(lp1);
        vault.submitMarketSettlementPrice(1, initialSqrtPriceX96);
    }

    function test_works_when_settlement_price_submitter() public {
        (, , , , IFoilStructs.MarketParams memory marketParams) = foil
            .getMarket();

        IMintableToken bondCurrency = IMintableToken(
            vm.getAddress("BondCurrency.Token")
        );
        bondCurrency.mint(marketParams.bondAmount * 2, vaultOwner);
        vm.startPrank(vaultOwner);
        bondCurrency.approve(address(vault), marketParams.bondAmount);
        vm.expectEmit(true, true, true, true, address(foil));
        emit IUMASettlementModule.SettlementSubmitted(
            1,
            vaultOwner,
            initialSqrtPriceX96,
            block.timestamp
        );
        vault.submitMarketSettlementPrice(1, initialSqrtPriceX96);
        vm.stopPrank();
    }
}
