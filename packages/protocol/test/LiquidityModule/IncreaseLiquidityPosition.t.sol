// SPDX-License-Identifier: MIT
pragma solidity >=0.8.2 <0.9.0;

import "forge-std/Test.sol";
import "cannon-std/Cannon.sol";
import {ISapience} from "../../src/market/interfaces/ISapience.sol";
import {IMintableToken} from "../../src/market/external/IMintableToken.sol";
import {TickMath} from "../../src/market/external/univ3/TickMath.sol";
import {TestTrade} from "../helpers/TestTrade.sol";
import {Market} from "../../src/market/storage/Market.sol";
import {TestUser} from "../helpers/TestUser.sol";
import {DecimalPrice} from "../../src/market/libraries/DecimalPrice.sol";
import {ISapienceStructs} from "../../src/market/interfaces/ISapienceStructs.sol";
import {Errors} from "../../src/market/storage/Errors.sol";
import {IUniswapV3Pool} from "@uniswap/v3-core/contracts/interfaces/IUniswapV3Pool.sol";
import {ILiquidityModule} from "../../src/market/interfaces/ILiquidityModule.sol";
import {Position} from "../../src/market/storage/Position.sol";

contract IncreaseLiquidityPosition is TestTrade {
    using Cannon for Vm;

    ISapience sapience;
    IMintableToken collateralAsset;

    address lp1;
    uint256 marketId;
    address pool;
    address tokenA;
    address tokenB;
    int24 constant MIN_TICK = 16000;
    int24 constant MAX_TICK = 29800;
    uint256 constant INITIAL_LP_BALANCE = 100_000_000 ether;
    uint256 constant INITIAL_COLLATERAL_AMOUNT = 10 ether;
    uint256 constant MIN_TRADE_SIZE = 10_000; // 10,000 vBase
    uint256 positionId;

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

        // Get token amounts for collateral using TestMarket's method
        (uint256 baseTokenAmount, uint256 quoteTokenAmount,) =
            getTokenAmountsForCollateralAmount(INITIAL_COLLATERAL_AMOUNT, MIN_TICK, MAX_TICK);

        // Create initial position
        vm.startPrank(lp1);
        (positionId,,,,,,) = sapience.createLiquidityPosition(
            ISapienceStructs.LiquidityMintParams({
                marketId: marketId,
                amountBaseToken: baseTokenAmount,
                amountQuoteToken: quoteTokenAmount,
                collateralAmount: INITIAL_COLLATERAL_AMOUNT + dust,
                lowerTick: MIN_TICK,
                upperTick: MAX_TICK,
                minAmountBaseToken: 0,
                minAmountQuoteToken: 0,
                deadline: block.timestamp + 30 minutes
            })
        );
        vm.stopPrank();
    }

    function test_revertWhen_increasingPositionWithInvalidId() public {
        uint256 invalidPositionId = 999; // An ID that doesn't exist

        vm.startPrank(lp1);
        collateralAsset.approve(address(sapience), 5 ether);

        vm.expectRevert(abi.encodeWithSelector(Errors.InvalidPositionId.selector, invalidPositionId));
        sapience.increaseLiquidityPosition(
            ISapienceStructs.LiquidityIncreaseParams({
                positionId: invalidPositionId,
                collateralAmount: 5 ether,
                baseTokenAmount: 500,
                quoteTokenAmount: 500,
                minBaseAmount: 0,
                minQuoteAmount: 0,
                deadline: block.timestamp + 30 minutes
            })
        );
        vm.stopPrank();
    }

    function test_revertWhen_increasingPositionAfterMarketSettlement() public {
        // Settle the market
        (ISapienceStructs.MarketData memory marketData,) = sapience.getLatestMarket();
        vm.warp(marketData.endTime + 1);

        // Try to increase position after settlement
        vm.expectRevert(Errors.ExpiredMarket.selector);
        vm.prank(lp1);
        sapience.increaseLiquidityPosition(
            ISapienceStructs.LiquidityIncreaseParams({
                positionId: positionId,
                collateralAmount: 5 ether,
                baseTokenAmount: 500,
                quoteTokenAmount: 500,
                minBaseAmount: 0,
                minQuoteAmount: 0,
                deadline: block.timestamp + 30 minutes
            })
        );
    }

    function test_revertWhen_increasingPositionWithInsufficientCollateral() public {
        uint256 sufficientCollateral = 1 ether;
        (uint256 loanAmount0, uint256 loanAmount1,) =
            getTokenAmountsForCollateralAmount(sufficientCollateral, MIN_TICK, MAX_TICK);

        uint256 insufficientCollateral = sufficientCollateral / 2; // Use half of the sufficient collateral

        vm.startPrank(lp1);
        collateralAsset.approve(address(sapience), insufficientCollateral);

        vm.expectRevert();
        sapience.increaseLiquidityPosition(
            ISapienceStructs.LiquidityIncreaseParams({
                positionId: positionId,
                collateralAmount: insufficientCollateral,
                baseTokenAmount: loanAmount0,
                quoteTokenAmount: loanAmount1,
                minBaseAmount: 0,
                minQuoteAmount: 0,
                deadline: block.timestamp + 30 minutes
            })
        );
        vm.stopPrank();
    }

    uint256 traderPositionId;

    function traderBuysGas() public {
        // Create a trader position before each test
        address trader = createUser("Trader", 1000 ether);
        vm.startPrank(trader);
        addTraderPosition(sapience, marketId, 1 ether);
        vm.stopPrank();
    }

    function test_doubleLiquidityPosition() public {
        traderBuysGas(); // moves price

        Position.Data memory initialPosition = sapience.getPosition(positionId);
        (uint256 currentGasTokenAmount, uint256 currentEthTokenAmount,,, uint128 currentLiquidity) =
            getCurrentPositionTokenAmounts(initialPosition.uniswapPositionId, MIN_TICK, MAX_TICK);

        uint256 requiredCollateral = sapience.quoteRequiredCollateral(positionId, currentLiquidity * 2);
        uint256 additionalCollateral = requiredCollateral - initialPosition.depositedCollateralAmount;

        vm.startPrank(lp1);
        uint256 initialBalance = collateralAsset.balanceOf(lp1);

        (,,,, uint256 totalDepositedCollateralAmount) = sapience.increaseLiquidityPosition(
            ISapienceStructs.LiquidityIncreaseParams({
                positionId: positionId,
                collateralAmount: additionalCollateral,
                baseTokenAmount: currentGasTokenAmount, // delta so doubling position
                quoteTokenAmount: currentEthTokenAmount, // delta so doubling position
                minBaseAmount: 0,
                minQuoteAmount: 0,
                deadline: block.timestamp + 30 minutes
            })
        );

        uint256 finalBalance = collateralAsset.balanceOf(lp1);
        uint256 actualTransferred = initialBalance - finalBalance;

        assertEq(
            actualTransferred,
            totalDepositedCollateralAmount - initialPosition.depositedCollateralAmount,
            "Only additional collateral should be transferred"
        );

        Position.Data memory updatedPosition = sapience.getPosition(positionId);
        assertEq(
            updatedPosition.depositedCollateralAmount,
            initialPosition.depositedCollateralAmount + additionalCollateral,
            "Collateral amount should equal total collateral"
        );

        vm.stopPrank();
    }
}
