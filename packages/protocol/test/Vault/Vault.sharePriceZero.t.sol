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

contract VaultSharePriceZero is TestVault {
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

        vm.prank(lp2);
        vault.requestDeposit(15 ether);

        epochStartTime = block.timestamp + 60;
        vm.prank(vaultOwner);
        vault.initializeFirstEpoch(initialSqrtPriceX96, block.timestamp);

        vault.deposit(0, lp1);
        vault.deposit(0, lp2);

        vm.mockCall(
            address(foil),
            abi.encodeWithSelector(ISettlementModule.settlePosition.selector),
            abi.encode(10)
        );

        // since we mock call, send collateral to vault for redemption
        collateralAsset.mint(10, address(vault));

        vm.prank(lp3);
        vault.requestDeposit(10 ether);

        vm.warp(epochStartTime + 30 days);
        settleEpoch(1, initialSqrtPriceX96, address(vault));
    }

    function test_epochStaysSame_whenSharePriceIsZero() public view {
        assertEq(vault.getCurrentEpoch().epochId, 1);
    }

    function test_canCancelDeposit_whenSharePriceIsZero() public {
        vm.prank(lp3);
        vault.withdrawRequestDeposit(10 ether);

        assertEq(vault.balanceOf(lp3), 0);
    }
}
