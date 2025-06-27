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

contract DecreaseLiquidityPosition is TestTrade {
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
    uint256 constant INITIAL_COLLATERAL_AMOUNT = 100 ether;
    uint256 constant MIN_TRADE_SIZE = 10_000; // 10,000 vBase
    uint256 positionId;

    function setUp() public {
        collateralAsset = IMintableToken(
            vm.getAddress("CollateralAsset.Token")
        );
        sapience = ISapience(vm.getAddress("Sapience"));

        uint160 startingSqrtPriceX96 = 250541448375047931186413801569; // 10
        (sapience, ) = createMarket(
            MIN_TICK,
            MAX_TICK,
            startingSqrtPriceX96,
            MIN_TRADE_SIZE,
            "wstGwei/quote"
        );

        lp1 = TestUser.createUser("LP1", INITIAL_LP_BALANCE);

        (ISapienceStructs.MarketData memory marketData, ) = sapience.getLatestMarket();
        marketId = marketData.marketId;
        pool = marketData.pool;
        tokenA = marketData.quoteToken;
        tokenB = marketData.baseToken;

        // Get token amounts for collateral using TestMarket's method
        (
            uint256 baseTokenAmount,
            uint256 quoteTokenAmount,

        ) = getTokenAmountsForCollateralAmount(
                INITIAL_COLLATERAL_AMOUNT,
                MIN_TICK,
                MAX_TICK
            );

        // Create initial position
        vm.startPrank(lp1);
        (positionId, , , , , , ) = sapience.createLiquidityPosition(
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

    function test_revertWhen_decreasingPositionWithInvalidId() public {
        uint256 invalidPositionId = 999; // An ID that doesn't exist

        vm.startPrank(lp1);
        vm.expectRevert(
            abi.encodeWithSelector(
                Errors.InvalidPositionId.selector,
                invalidPositionId
            )
        );
        sapience.decreaseLiquidityPosition(
            ISapienceStructs.LiquidityDecreaseParams({
                positionId: invalidPositionId,
                liquidity: 500,
                minBaseAmount: 0,
                minQuoteAmount: 0,
                deadline: block.timestamp + 30 minutes
            })
        );
        vm.stopPrank();
    }

    function test_revertWhen_decreasingPositionAfterMarketSettlement() public {
        // Settle the market
        (ISapienceStructs.MarketData memory marketData, ) = sapience.getLatestMarket();
        vm.warp(marketData.endTime + 1);

        // Try to decrease position after settlement
        vm.expectRevert(Errors.ExpiredMarket.selector);
        vm.prank(lp1);
        sapience.decreaseLiquidityPosition(
            ISapienceStructs.LiquidityDecreaseParams({
                positionId: positionId,
                liquidity: 500,
                minBaseAmount: 0,
                minQuoteAmount: 0,
                deadline: block.timestamp + 30 minutes
            })
        );
    }

    function traderSellsGas() public {
        // Create a trader position before each test
        address trader = createUser("Trader", 1000 ether);
        vm.startPrank(trader);

        // TODO notice this is a long position, not short => is buying bas
        addTraderPosition(sapience, marketId, 1 ether);

        vm.stopPrank();
    }

    struct InitialValues {
        uint256 initialGasTokenAmount;
        uint256 initialEthTokenAmount;
        uint256 initialOwedTokens0;
        uint256 initialOwedTokens1;
        uint128 initialLiquidity;
        uint256 initialLpBalance;
        uint256 initialSapienceBalance;
    }

    function test_decreaseLiquidityPosition() public {
        // Get the initial position data
        Position.Data memory initialPosition = sapience.getPosition(positionId);

        InitialValues memory initialValues;
        (
            initialValues.initialGasTokenAmount,
            initialValues.initialEthTokenAmount,
            ,
            ,
            initialValues.initialLiquidity
        ) = getCurrentPositionTokenAmounts(
            initialPosition.uniswapPositionId,
            MIN_TICK,
            MAX_TICK
        );

        // Calculate 30% of the initial liquidity
        uint128 liquidityToDecrease = uint128(
            (initialValues.initialLiquidity * 30) / 100
        );

        vm.startPrank(lp1);

        // Check initial balances
        initialValues.initialLpBalance = collateralAsset.balanceOf(lp1);
        initialValues.initialSapienceBalance = collateralAsset.balanceOf(
            address(sapience)
        );

        (uint256 amount0, uint256 amount1, uint256 newCollateralAmount) = sapience
            .decreaseLiquidityPosition(
                ISapienceStructs.LiquidityDecreaseParams({
                    positionId: positionId,
                    liquidity: liquidityToDecrease,
                    minBaseAmount: 0,
                    minQuoteAmount: 0,
                    deadline: block.timestamp + 30 minutes
                })
            );

        // Get the updated position data
        Position.Data memory updatedPosition = sapience.getPosition(positionId);

        // Assert that the proper collateral amount was returned to lp
        assertEq(
            collateralAsset.balanceOf(lp1),
            initialValues.initialLpBalance +
                (initialPosition.depositedCollateralAmount -
                    newCollateralAmount),
            "Incorrect amount of collateral returned to LP"
        );

        // Assert that the proper collateral amount was reduced from sapience balance
        assertEq(
            collateralAsset.balanceOf(address(sapience)),
            initialValues.initialSapienceBalance -
                (initialPosition.depositedCollateralAmount -
                    newCollateralAmount),
            "Incorrect amount of collateral reduced from Sapience balance"
        );

        // Check that owed tokens have increased correctly
        (
            ,
            ,
            uint256 newTokensOwed0,
            uint256 newTokensOwed1,

        ) = getCurrentPositionTokenAmounts(
                updatedPosition.uniswapPositionId,
                MIN_TICK,
                MAX_TICK
            );

        assertEq(
            newTokensOwed0,
            amount0,
            "Owed token0 should increase by 30% of removed amount"
        );
        assertEq(
            newTokensOwed1,
            amount1,
            "Owed token1 should increase by 30% of removed amount"
        );

        // Assertions
        assertGt(
            amount0,
            0,
            "Amount of token0 removed should be greater than 0"
        );
        assertGt(
            amount1,
            0,
            "Amount of token1 removed should be greater than 0"
        );

        assertEq(
            updatedPosition.depositedCollateralAmount,
            newCollateralAmount,
            "Collateral amount should be decreased to 70% of initial amount"
        );

        vm.stopPrank();
    }

    function increaseLiquidityPosition() internal {
        traderSellsGas();

        vm.startPrank(lp1);

        // Get initial position details
        (
            uint256 initialAmount0,
            uint256 initialAmount1,
            ,
            ,
            uint128 initialLiquidity
        ) = getCurrentPositionTokenAmounts(positionId, MIN_TICK, MAX_TICK);
        initialLiquidity;

        // Calculate amounts to increase
        uint256 increaseAmount0 = initialAmount0 / 2; // Increase by 50%
        uint256 increaseAmount1 = initialAmount1 / 2; // Increase by 50%

        // Increase the liquidity position
        sapience.increaseLiquidityPosition(
            ISapienceStructs.LiquidityIncreaseParams({
                positionId: positionId,
                collateralAmount: 1000 ether,
                baseTokenAmount: increaseAmount0,
                quoteTokenAmount: increaseAmount1,
                minBaseAmount: 0,
                minQuoteAmount: 0,
                deadline: block.timestamp + 30 minutes
            })
        );
        vm.stopPrank();
    }

    function test_decreaseLiquidityPosition_after_trade() public {
        traderSellsGas();

        vm.startPrank(lp1);

        Position.Data memory initialPosition = sapience.getPosition(positionId);

        // Get initial position details
        (, , , , uint128 initialLiquidity) = getCurrentPositionTokenAmounts(
            initialPosition.uniswapPositionId,
            MIN_TICK,
            MAX_TICK
        );

        // Calculate 20% of initial liquidity
        uint128 newLiquidity = uint128((uint256(initialLiquidity) * 80) / 100);

        uint256 requiredCollateral = sapience.quoteRequiredCollateral(
            positionId,
            newLiquidity
        );

        console2.log("requiredCollateral", requiredCollateral);

        assertGt(
            requiredCollateral,
            2,
            "Quoted collateral should be greater than 0"
        );

        vm.stopPrank();
    }

    function test_decreaseLiquidityPosition_closePosition() public {
        traderSellsGas();
        increaseLiquidityPosition(); // this collects fees from trader

        vm.startPrank(lp1);

        Position.Data memory initialPosition = sapience.getPosition(positionId);

        // Get initial position details
        (
            uint256 initialAmount0,
            uint256 initialAmount1,
            uint256 initialOwedTokens0,
            uint256 initialOwedTokens1,
            uint128 initialLiquidity
        ) = getCurrentPositionTokenAmounts(
                initialPosition.uniswapPositionId,
                MIN_TICK,
                MAX_TICK
            );

        // Close the position
        (uint256 amount0, uint256 amount1, uint256 collateralAmount) = sapience
            .decreaseLiquidityPosition(
                ISapienceStructs.LiquidityDecreaseParams({
                    positionId: positionId,
                    liquidity: initialLiquidity,
                    minBaseAmount: 0,
                    minQuoteAmount: 0,
                    deadline: block.timestamp + 30 minutes
                })
            );

        collateralAmount;

        // Get updated position
        Position.Data memory updatedPosition = sapience.getPosition(positionId);

        assertEq(
            updatedPosition.uniswapPositionId,
            0,
            "Uniswap position ID should be 0"
        );
        int256 vQuoteLoan = int256(initialPosition.borrowedVQuote) -
            int256(amount1);
        assertEq(
            updatedPosition.depositedCollateralAmount,
            uint256(
                int256(initialPosition.depositedCollateralAmount) - vQuoteLoan
            ),
            "Deposited collateral amount shouldn't change"
        );
        assertEq(updatedPosition.borrowedVQuote, 0, "Borrowed vQuote should be 0");

        if (amount0 + initialOwedTokens0 > initialPosition.borrowedVBase) {
            assertEq(
                updatedPosition.vBaseAmount,
                initialPosition.borrowedVBase - (initialOwedTokens0 + amount0),
                "vBase amount should be equal to borrowed vBase minus owed tokens and decreased amount"
            );
        } else {
            assertEq(
                updatedPosition.borrowedVBase,
                initialPosition.borrowedVBase - (initialOwedTokens0 + amount0),
                "vBase amount should be equal to borrowed vBase minus owed tokens and decreased amount"
            );
        }

        // Notice +/- 1 due to rounding errors
        assertApproxEqAbs(
            amount0,
            initialAmount0 + initialOwedTokens0,
            1,
            "All token0 should be collected"
        );
        assertApproxEqAbs(
            amount1,
            initialAmount1 + initialOwedTokens1,
            1,
            "All token1 should be collected"
        );

        // Check that the Uniswap position is burned
        // vm.expectRevert("Invalid token ID");
        // uniswapV3PositionManager.positions(initialPosition.uniswapPositionId);

        vm.stopPrank();
    }
}
