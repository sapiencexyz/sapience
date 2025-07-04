// SPDX-License-Identifier: MIT
pragma solidity >=0.8.2 <0.9.0;

import "forge-std/Test.sol";
import "cannon-std/Cannon.sol";
import {ISapience} from "../../src/market/interfaces/ISapience.sol";
import {IMintableToken} from "../../src/market/external/IMintableToken.sol";
import {TickMath} from "../../src/market/external/univ3/TickMath.sol";
import {TestMarket} from "../helpers/TestMarket.sol";
import {Market} from "../../src/market/storage/Market.sol";
import {TestUser} from "../helpers/TestUser.sol";
import {DecimalPrice} from "../../src/market/libraries/DecimalPrice.sol";
import {ISapienceStructs} from "../../src/market/interfaces/ISapienceStructs.sol";
import {Errors} from "../../src/market/storage/Errors.sol";
import {IUniswapV3Pool} from "@uniswap/v3-core/contracts/interfaces/IUniswapV3Pool.sol";
import {ILiquidityModule} from "../../src/market/interfaces/ILiquidityModule.sol";
import {Position} from "../../src/market/storage/Position.sol";

contract CreateLiquidityPosition is TestMarket {
    using Cannon for Vm;

    ISapience sapience;
    IMintableToken collateralAsset;

    address lp1;
    address trader1;
    uint256 marketId;
    address pool;
    address tokenA;
    address tokenB;
    int24 constant MIN_TICK = 16000;
    int24 constant MAX_TICK = 29800;
    uint256 constant dust = 1e8;
    uint256 constant INITIAL_LP_BALANCE = 100_000_000 ether;
    uint256 constant MIN_TRADE_SIZE = 10_000; // 10,000 vBase

    function setUp() public {
        collateralAsset = IMintableToken(vm.getAddress("CollateralAsset.Token"));
        sapience = ISapience(vm.getAddress("Sapience"));

        uint160 startingSqrtPriceX96 = 250541448375047931186413801569; // 10
        (sapience,) = createMarket(MIN_TICK, MAX_TICK, startingSqrtPriceX96, MIN_TRADE_SIZE, "wstGwei/quote");

        lp1 = TestUser.createUser("LP1", INITIAL_LP_BALANCE);

        (ISapienceStructs.MarketData memory marketData,) = sapience.getLatestMarket();
        marketId = marketData.marketId;
        pool = marketData.pool;
        tokenA = marketData.quoteToken;
        tokenB = marketData.baseToken;
    }

    function test_revertWhen_invalidMarket() public {
        vm.expectRevert(abi.encodeWithSelector(Errors.InvalidMarket.selector));
        vm.startPrank(lp1);
        sapience.createLiquidityPosition(
            ISapienceStructs.LiquidityMintParams({
                marketId: marketId + 1,
                amountBaseToken: 1000,
                amountQuoteToken: 1000,
                collateralAmount: 10 ether,
                lowerTick: 16000,
                upperTick: 29800,
                minAmountBaseToken: 0,
                minAmountQuoteToken: 0,
                deadline: block.timestamp + 30 minutes
            })
        );
    }

    function test_revertWhen_tickUnderMin() public {
        int24 lowerTick = 16000 - 200;

        vm.expectRevert(abi.encodeWithSelector(Errors.InvalidRange.selector, lowerTick, MIN_TICK));
        vm.startPrank(lp1);
        sapience.createLiquidityPosition(
            ISapienceStructs.LiquidityMintParams({
                marketId: marketId,
                amountBaseToken: 1000,
                amountQuoteToken: 1000,
                collateralAmount: 10 ether,
                lowerTick: lowerTick,
                upperTick: MAX_TICK,
                minAmountBaseToken: 0,
                minAmountQuoteToken: 0,
                deadline: block.timestamp + 30 minutes
            })
        );
    }

    function test_revertWhen_tickOverMax() public {
        int24 upperTick = MAX_TICK + 200;

        vm.expectRevert(abi.encodeWithSelector(Errors.InvalidRange.selector, upperTick, MAX_TICK));
        vm.startPrank(lp1);
        sapience.createLiquidityPosition(
            ISapienceStructs.LiquidityMintParams({
                marketId: marketId,
                amountBaseToken: 1000,
                amountQuoteToken: 1000,
                collateralAmount: 10 ether,
                lowerTick: MIN_TICK,
                upperTick: upperTick,
                minAmountBaseToken: 0,
                minAmountQuoteToken: 0,
                deadline: block.timestamp + 30 minutes
            })
        );
    }

    function test_revertWhen_marketExpired() public {
        // Fast forward to after the market end time
        (ISapienceStructs.MarketData memory marketData,) = sapience.getMarket(marketId);
        vm.warp(marketData.endTime + 1);

        vm.expectRevert(Errors.ExpiredMarket.selector);
        vm.prank(lp1);
        sapience.createLiquidityPosition(
            ISapienceStructs.LiquidityMintParams({
                marketId: marketId,
                amountBaseToken: 1000,
                amountQuoteToken: 1000,
                collateralAmount: 10 ether,
                lowerTick: MIN_TICK,
                upperTick: MAX_TICK,
                minAmountBaseToken: 0,
                minAmountQuoteToken: 0,
                deadline: block.timestamp + 30 minutes
            })
        );
    }

    uint256 constant COLLATERAL_AMOUNT = 100 ether;
    int24 constant LOWER_TICK = 19400;
    int24 constant UPPER_TICK = 24800;

    function test_newPosition_withinRange() public {
        (uint256 loanAmount0, uint256 loanAmount1,) =
            getTokenAmountsForCollateralAmount(COLLATERAL_AMOUNT, LOWER_TICK, UPPER_TICK);

        uint256 sapienceInitialBalance = collateralAsset.balanceOf(address(sapience));
        uint256 lpInitialBalance = collateralAsset.balanceOf(lp1);

        vm.prank(lp1);
        (
            uint256 id,
            ,
            uint256 totalDepositedCollateralAmount,
            uint256 uniswapNftId,
            uint128 liquidity,
            uint256 addedAmount0,
            uint256 addedAmount1
        ) = sapience.createLiquidityPosition(
            ISapienceStructs.LiquidityMintParams({
                marketId: marketId,
                amountBaseToken: loanAmount0,
                amountQuoteToken: loanAmount1,
                collateralAmount: COLLATERAL_AMOUNT + dust,
                lowerTick: LOWER_TICK,
                upperTick: UPPER_TICK,
                minAmountBaseToken: 0,
                minAmountQuoteToken: 0,
                deadline: block.timestamp + 30 minutes
            })
        );
        id;
        uniswapNftId;
        liquidity;

        uint256 sapienceFinalBalance = collateralAsset.balanceOf(address(sapience));
        uint256 lpFinalBalance = collateralAsset.balanceOf(lp1);

        assertEq(
            sapienceFinalBalance,
            sapienceInitialBalance + totalDepositedCollateralAmount,
            "Sapience balance should increase by the deposited collateral amount"
        );
        assertEq(
            lpFinalBalance,
            lpInitialBalance - totalDepositedCollateralAmount,
            "LP balance should decrease by the deposited collateral amount"
        );

        assertApproxEqAbs(
            addedAmount0, loanAmount0, dust, "Added amount of token A should be within 0.00001 of loan amount"
        );
        assertApproxEqAbs(
            addedAmount1, loanAmount1, dust, "Added amount of token B should be within 0.00001 of loan amount"
        );
    }

    function test_revertWhen_insufficientCollateral() public {
        uint256 collateralAmount = 100 ether;
        int24 lowerTick = 19400;
        int24 upperTick = 24800;
        (uint256 loanAmount0, uint256 loanAmount1,) =
            getTokenAmountsForCollateralAmount(collateralAmount, lowerTick, upperTick);

        // Approve less collateral than required
        uint256 insufficientCollateral = collateralAmount - 1 ether;
        vm.startPrank(lp1);
        collateralAsset.approve(address(sapience), insufficientCollateral);

        // Can't check revert message without arguments.  and for argument, we'd need exact value from uniswap
        vm.expectRevert();
        sapience.createLiquidityPosition(
            ISapienceStructs.LiquidityMintParams({
                marketId: marketId,
                amountBaseToken: loanAmount0,
                amountQuoteToken: loanAmount1,
                collateralAmount: insufficientCollateral,
                lowerTick: lowerTick,
                upperTick: upperTick,
                minAmountBaseToken: 0,
                minAmountQuoteToken: 0,
                deadline: block.timestamp + 30 minutes
            })
        );
        vm.stopPrank();
    }

    function test_fuzz_newPosition_withinRange(int24 lowerTick, int24 upperTick, uint256 collateralAmount) public {
        // Limit the range of ticks to reduce possibilities
        lowerTick = int24(int256(bound(uint24(lowerTick), uint24(MIN_TICK), uint24(MAX_TICK - 400))));
        upperTick = int24(int256(bound(uint24(upperTick), uint24(lowerTick + 400), uint24(MAX_TICK))));

        // Ensure ticks are multiples of 400 to further reduce possibilities
        lowerTick = lowerTick - (lowerTick % 400);
        upperTick = upperTick - (upperTick % 400);

        // Bound collateral amount between 1 ether and 100 ether, with steps of 1 ether
        collateralAmount = bound(collateralAmount, 1 ether, 100 ether);
        collateralAmount = collateralAmount - (collateralAmount % 1 ether);

        (uint256 loanAmount0, uint256 loanAmount1,) =
            getTokenAmountsForCollateralAmount(collateralAmount, lowerTick, upperTick);

        vm.startPrank(lp1);
        (
            uint256 id,
            ,
            uint256 totalDepositedCollateralAmount,
            uint256 uniswapNftId,
            uint128 liquidity,
            uint256 addedAmount0,
            uint256 addedAmount1
        ) = sapience.createLiquidityPosition(
            ISapienceStructs.LiquidityMintParams({
                marketId: marketId,
                amountBaseToken: loanAmount0,
                amountQuoteToken: loanAmount1,
                collateralAmount: collateralAmount + dust,
                lowerTick: lowerTick,
                upperTick: upperTick,
                minAmountBaseToken: 0,
                minAmountQuoteToken: 0,
                deadline: block.timestamp + 30 minutes
            })
        );
        vm.stopPrank();

        assertGt(id, 0, "Position ID should be greater than 0");
        assertGt(uniswapNftId, 0, "Uniswap NFT ID should be greater than 0");
        assertGt(liquidity, 0, "Liquidity should be greater than 0");
        assertApproxEqAbs(
            addedAmount0, loanAmount0, dust, "Added amount of token A should be within dust of loan amount"
        );
        assertApproxEqAbs(
            addedAmount1, loanAmount1, dust, "Added amount of token B should be within dust of loan amount"
        );

        // Check if collateral amount was transferred to Sapience contract
        uint256 sapienceCollateralBalance = collateralAsset.balanceOf(address(sapience));
        assertEq(
            sapienceCollateralBalance,
            totalDepositedCollateralAmount,
            "Collateral amount should be transferred to Sapience contract"
        );

        // Optionally, check if LP's balance decreased by the correct amount
        uint256 lpCollateralBalance = collateralAsset.balanceOf(lp1);
        assertEq(
            lpCollateralBalance,
            INITIAL_LP_BALANCE - totalDepositedCollateralAmount,
            "LP's collateral balance should decrease by the correct amount"
        );

        // Check that the loan amount stored on position is equal to the added amounts
        Position.Data memory position = sapience.getPosition(id);
        assertEq(position.borrowedVBase, addedAmount0, "Borrowed vBase should equal added amount of token A");
        assertEq(position.borrowedVQuote, addedAmount1, "Borrowed vQuote should equal added amount of token B");
    }
}
