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
import {IFoilStructs} from "../src/contracts/interfaces/IFoilStructs.sol";
import "forge-std/console2.sol";

contract CreateLiquidityPosition is TestEpoch {
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

        (epochId, , , pool, tokenA, tokenB, , , , , ) = foil.getLatestEpoch();
    }

    function test_newPosition() public {
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

        (
            uint256 id,
            uint256 uniswapNftId,
            uint128 liquidity,
            uint256 addedAmount0,
            uint256 addedAmount1
        ) = foil.createLiquidityPosition(
                IFoilStructs.LiquidityPositionParams({
                    epochId: epochId,
                    amountTokenA: loanAmount0,
                    amountTokenB: loanAmount1,
                    collateralAmount: collateralAmount,
                    lowerTick: lowerTick,
                    upperTick: upperTick,
                    minAmountTokenA: 0,
                    minAmountTokenB: 0
                })
            );

        console2.log("addedAmount0", addedAmount0);
        console2.log("addedAmount1", addedAmount1);
    }
}
