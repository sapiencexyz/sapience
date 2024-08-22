// SPDX-License-Identifier: MIT
pragma solidity >=0.8.2 <0.9.0;

import "forge-std/Test.sol";
import "cannon-std/Cannon.sol";
import {IFoil} from "../src/contracts/interfaces/IFoil.sol";
import {IMintableToken} from "../src/contracts/external/IMintableToken.sol";
import {TickMath} from "../src/contracts/external/univ3/TickMath.sol";
import {TestEpoch} from "./helpers/TestEpoch.sol";
import {TestUser} from "./helpers/TestUser.sol";
import {DecimalPrice} from "../src/contracts/libraries/DecimalPrice.sol";

import "forge-std/console2.sol";

contract UmaSettleMarket is TestEpoch {
    using Cannon for Vm;

    IFoil foil;
    IMintableToken collateralAsset;

    address owner;
    address optimisticOracleV3;
    uint256 endTime;
    uint256 minPriceD18;
    uint256 maxPriceD18;
    bool settled;
    uint256 settlementPriceD18;

    function setUp() public {
        collateralAsset = IMintableToken(
            vm.getAddress("CollateralAsset.Token")
        );
        foil = IFoil(vm.getAddress("Foil"));

        uint160 startingSqrtPriceX96 = 250541448375047931186413801569; // 10
        (foil, ) = createEpoch(16000, 29800, startingSqrtPriceX96);

        (owner, , , , optimisticOracleV3, ) = foil.getMarket();
        (, , endTime, , , , minPriceD18, maxPriceD18, settled, settlementPriceD18) = foil.getLatestEpoch();
    }

    function test_settle_in_range_Only() public {
        vm.warp(endTime + 1);
        
    }

    function test_settle_above_range() public {
        vm.warp(endTime + 1);
        // should be max, not higher
    }
    
    function test_settle_below_range() public {
        vm.warp(endTime + 1);
        // should be min, not lower
    }

    function test_settle_too_early() public {
        vm.warp(endTime - 1);
    }

    function test_settle_too_late() public {
        vm.warp(endTime + 1);
        // Settle
        // Try settling again
    }

}
