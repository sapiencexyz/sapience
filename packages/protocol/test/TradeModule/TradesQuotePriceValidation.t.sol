// SPDX-License-Identifier: MIT
pragma solidity >=0.8.25 <0.9.0;

import "forge-std/Test.sol";
import "cannon-std/Cannon.sol";
import {IFoil} from "../../src/market/interfaces/IFoil.sol";
import {TickMath} from "../../src/market/external/univ3/TickMath.sol";
import {TestTrade} from "../helpers/TestTrade.sol";
import {TestUser} from "../helpers/TestUser.sol";
import {SafeCastI256, SafeCastU256} from "@synthetixio/core-contracts/contracts/utils/SafeCast.sol";
import {IFoilStructs} from "../../src/market/interfaces/IFoilStructs.sol";
import {DecimalMath} from "../../src/market/libraries/DecimalMath.sol";

contract TradesQuotePriceValidationTest is TestTrade {
    using Cannon for Vm;
    using SafeCastI256 for int256;
    using SafeCastU256 for uint256;
    using DecimalMath for uint256;

    IFoil public foil;
    uint256 public epochId;
    address mockQuoter;
    address foilAddress;
    address owner;
    address lp;
    address trader;
    uint160 sqrtPriceMinX96;
    uint160 sqrtPriceMaxX96;
    uint256 positionId;
    function setUp() public {
        // Create an epoch with narrow price bounds for testing
        int24 minTick = 5000;
        int24 maxTick = 25000;
        uint160 startingSqrtPriceX96 = TickMath.getSqrtRatioAtTick(
            (minTick + maxTick) / 2
        );
        uint256 minTradeSize = 0.001 ether;

        // Setup price bounds for tests
        sqrtPriceMinX96 = TickMath.getSqrtRatioAtTick(minTick);
        sqrtPriceMaxX96 = TickMath.getSqrtRatioAtTick(maxTick);

        (foil, owner) = createEpoch(
            minTick,
            maxTick,
            startingSqrtPriceX96,
            minTradeSize,
            "" // empty claim statement, will default to market claim statement
        );
        foilAddress = address(foil);

        // Get the epochId
        (IFoilStructs.EpochData memory epochData, ) = foil.getLatestEpoch();
        epochId = epochData.epochId;

        lp = TestUser.createUser("RegularLP", 50 ether);
        trader = TestUser.createUser("Trader", 100 ether);

        (
            uint256 loanAmount0,
            uint256 loanAmount1,

        ) = getTokenAmountsForCollateralAmount(1 ether, minTick, maxTick);

        // Fee collector opens position
        vm.startPrank(lp);
        (positionId, , , , , , ) = foil.createLiquidityPosition(
            IFoilStructs.LiquidityMintParams({
                epochId: epochId,
                amountTokenA: loanAmount0,
                amountTokenB: loanAmount1,
                collateralAmount: 1.1 ether,
                lowerTick: minTick,
                upperTick: maxTick,
                minAmountTokenA: 0,
                minAmountTokenB: 0,
                deadline: block.timestamp + 30 minutes
            })
        );
        vm.stopPrank();
    }

    function test_validatePriceInRange_CreatePosition_Normal() public {
        (uint256 requiredCollateral, , ) = foil.quoteCreateTraderPosition(
            epochId,
            -0.1 ether
        );

        vm.prank(trader);
        // Create the trader position
        uint256 traderPositionId = foil.createTraderPosition(
            epochId,
            -0.1 ether, // Same size as quoted
            requiredCollateral, // Use the quoted collateral amount
            block.timestamp + 30 minutes // Set a reasonable deadline
        );

        // Verify the position was created successfully
        assertTrue(
            traderPositionId > 0,
            "Position ID should be greater than 0"
        );

        vm.stopPrank();
    }

    function test_validatePriceInRange_CreatePosition_OutOfRange() public {
        // This should revert with PoolPriceOutOfRange because the post-trade price would be out of range
        vm.expectRevert();
        // Attempt to quote a position with a size that would push the price out of range
        foil.quoteCreateTraderPosition(epochId, -0.35 ether);
    }

    function test_validatePriceInRange_ModifyPosition_Normal() public {
        // First create a small position
        (uint256 requiredCollateral, , ) = foil.quoteCreateTraderPosition(
            epochId,
            -0.05 ether
        );

        vm.startPrank(trader);
        // Create the initial trader position
        uint256 traderPositionId = foil.createTraderPosition(
            epochId,
            -0.05 ether,
            requiredCollateral,
            block.timestamp + 30 minutes
        );

        // Now modify the position
        (int256 expectedCollateralDelta, , , ) = foil.quoteModifyTraderPosition(
            traderPositionId,
            -0.1 ether // Increase size from -0.05 to -0.1
        );

        // Modify the trader position
        foil.modifyTraderPosition(
            traderPositionId,
            -0.1 ether, // New size
            expectedCollateralDelta,
            block.timestamp + 30 minutes
        );

        vm.stopPrank();
    }

    function test_validatePriceInRange_ModifyPosition_OutOfRange() public {
        // First create a small position
        (uint256 requiredCollateral, , ) = foil.quoteCreateTraderPosition(
            epochId,
            -0.05 ether
        );

        vm.startPrank(trader);
        // Create the initial trader position
        uint256 traderPositionId = foil.createTraderPosition(
            epochId,
            -0.05 ether,
            requiredCollateral,
            block.timestamp + 30 minutes
        );

        // This should revert with PoolPriceOutOfRange because the post-trade price would be out of range
        vm.expectRevert();
        // Attempt to quote a position modification with a size that would push the price out of range
        foil.quoteModifyTraderPosition(
            traderPositionId,
            -0.35 ether // Try to increase size too much
        );

        vm.stopPrank();
    }
}
