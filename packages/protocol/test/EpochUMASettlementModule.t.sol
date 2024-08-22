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

    address lp1;
    address trader1;
    uint256 epochId;
    address pool;
    address tokenA;
    address tokenB;

    function setUp() public {
        collateralAsset = IMintableToken(
            vm.getAddress("CollateralAsset.Token")
        );
        foil = IFoil(vm.getAddress("Foil"));

        uint160 startingSqrtPriceX96 = 250541448375047931186413801569; // 10
        (foil, ) = createEpoch(16000, 29800, startingSqrtPriceX96);

        lp1 = TestUser.createUser("LP1", 10_000_000 ether);
        trader1 = TestUser.createUser("Trader1", 10_000_000 ether);

        (epochId, , , pool, tokenA, tokenB, , , , ) = foil.getLatestEpoch();
    }

    function test_settle_in_range_Only() public {
        /*
        uint256 collateralAmount = 10 ether;
        int24 lowerTick = 19400;
        int24 upperTick = 23000;
        (
            uint256 loanAmount0,
            uint256 loanAmount1,

        ) = getTokenAmountsForCollateralAmount(
                collateralAmount,
                lowerTick,
                upperTick
            );

        console2.log("loanAmount0", loanAmount0);
        console2.log("loanAmount1", loanAmount1);
        */
    }

    function test_settle_above_range_Only() public {}
    function test_settle_below_range_Only() public {}

    function test_settle_too_early_Only() public {}

    function test_settle_too_late_Only() public {}

}
