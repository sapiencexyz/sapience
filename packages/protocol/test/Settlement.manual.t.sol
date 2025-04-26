// SPDX-License-Identifier: MIT
pragma solidity >=0.8.2 <0.9.0;

import "forge-std/Test.sol";
import "cannon-std/Cannon.sol";
import {IFoil} from "../src/market/interfaces/IFoil.sol";
import {IFoilStructs} from "../src/market/interfaces/IFoilStructs.sol";
import {IMintableToken} from "../src/market/external/IMintableToken.sol";
import {TickMath} from "../src/market/external/univ3/TickMath.sol";
import {TestTrade} from "./helpers/TestTrade.sol";
import {TestUser} from "./helpers/TestUser.sol";
import {DecimalPrice} from "../src/market/libraries/DecimalPrice.sol";
import {IUniswapV3Pool} from "@uniswap/v3-core/contracts/interfaces/IUniswapV3Pool.sol";
import {Errors} from "../src/market/storage/Errors.sol";

contract ManualSettlementTest is TestTrade {
    using Cannon for Vm;

    IFoil foil;
    uint256 epochId;
    uint256 endTime;
    uint160 SQRT_PRICE_10Eth = 250541448375047931186413801569;

    address trader1;
    address lp1;

    uint256 lpPositionId;

    function setUp() public {
        lp1 = TestUser.createUser("LP1", 100_000 ether);
        trader1 = TestUser.createUser("Trader1", 100 ether);
        uint160 startingSqrtPriceX96 = SQRT_PRICE_10Eth;
        int24 minTick = 16000;
        int24 maxTick = 29800;
        (foil, ) = createEpoch(minTick, maxTick, startingSqrtPriceX96, 10_000, "wstGwei/gas");

        (IFoilStructs.EpochData memory epochData, ) = foil.getLatestEpoch();
        epochId = epochData.epochId;
        endTime = epochData.endTime;

        (
            uint256 gasTokenAmount,
            uint256 ethTokenAmount,

        ) = getTokenAmountsForCollateralAmount(10 ether, minTick, maxTick);

        // Create initial position
        vm.startPrank(lp1);
        (lpPositionId, , , , , , ) = foil.createLiquidityPosition(
            IFoilStructs.LiquidityMintParams({
                epochId: epochId,
                amountTokenA: gasTokenAmount,
                amountTokenB: ethTokenAmount,
                collateralAmount: 11 ether,
                lowerTick: minTick,
                upperTick: maxTick,
                minAmountTokenA: 0,
                minAmountTokenB: 0,
                deadline: block.timestamp + 30 minutes
            })
        );
        vm.stopPrank();
    }

    function buyGas() internal returns (uint256 traderPositionId) {
        vm.startPrank(trader1);
        traderPositionId = addTraderPosition(foil, epochId, int256(0.1 ether));
        vm.stopPrank();
    }

    function test_manual_settlement() public {
        buyGas();
        // Get epoch duration and calculate required delay
        uint256 epochDuration = endTime - block.timestamp;
        uint256 requiredDelay = epochDuration * 2;

        // Warp to after required delay
        vm.warp(endTime + requiredDelay + 1);

        // Get current pool price before settlement
        (IFoilStructs.EpochData memory epochData, ) = foil.getLatestEpoch();
        (uint160 sqrtPriceX96, , , , , , ) = IUniswapV3Pool(epochData.pool)
            .slot0();

        // Call manual settlement
        foil.__manual_setSettlementPrice();

        // Verify settlement occurred
        (epochData, ) = foil.getLatestEpoch();
        assertTrue(epochData.settled, "Epoch should be settled");
        assertEq(
            epochData.settlementPriceD18,
            DecimalPrice.sqrtRatioX96ToPrice(sqrtPriceX96),
            "Settlement price should match"
        );

        // Attempt to settle again should revert
        vm.expectRevert(Errors.EpochSettled.selector);
        foil.__manual_setSettlementPrice();

        vm.prank(lp1);
        foil.settlePosition(lpPositionId);
    }

    function test_manual_settlement_reverts_if_too_early() public {
        uint256 epochDuration = endTime - block.timestamp;
        uint256 requiredDelay = epochDuration * 2;
        // Warp to just after epoch end but before required delay
        vm.warp(requiredDelay - 1);

        // Expect revert when trying to settle too early
        vm.expectRevert();
        foil.__manual_setSettlementPrice();
    }
}
