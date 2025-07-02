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

contract LiquidityFeeCollectorTest is TestTrade {
    using Cannon for Vm;

    ISapience sapience;
    IMintableToken collateralAsset;

    address feeCollector;
    address regularLp;
    uint256 marketId;
    address pool;
    address tokenA;
    address tokenB;
    int24 constant MIN_TICK = 16000;
    int24 constant MAX_TICK = 29800;
    uint256 constant INITIAL_BALANCE = 100_000_000 ether;
    uint256 constant DUST = 1e5;
    address trader1;
    address trader2;
    uint256 feeCollectorId;
    uint256 regularLpId;

    uint256 constant COLLATERAL_AMOUNT = 10 ether;
    int24 constant LOWER_TICK = 19400;
    int24 constant UPPER_TICK = 24800;
    uint256 constant MIN_TRADE_SIZE = 10_000; // 10,000 vBase

    function setUp() public {
        collateralAsset = IMintableToken(
            vm.getAddress("CollateralAsset.Token")
        );
        sapience = ISapience(vm.getAddress("Sapience"));

        feeCollector = TestUser.createUser("FeeCollector", 0); // no balance
        regularLp = TestUser.createUser("RegularLP", INITIAL_BALANCE);
        trader1 = TestUser.createUser("Trader1", INITIAL_BALANCE);
        trader2 = TestUser.createUser("Trader2", INITIAL_BALANCE);

        uint160 startingSqrtPriceX96 = 250541448375047931186413801569; // 10
        address[] memory feeCollectors = new address[](1);
        feeCollectors[0] = feeCollector;
        (sapience, ) = createMarketWithFeeCollectors(
            MIN_TICK,
            MAX_TICK,
            startingSqrtPriceX96,
            feeCollectors,
            MIN_TRADE_SIZE,
            "wstGwei/quote",
            ""
        );

        (ISapienceStructs.MarketData memory marketData, ) = sapience.getLatestMarket();
        marketId = marketData.marketId;
        pool = marketData.pool;
        tokenA = marketData.quoteToken;
        tokenB = marketData.baseToken;

        // create liquidity position
        (
            uint256 loanAmount0,
            uint256 loanAmount1,

        ) = getTokenAmountsForCollateralAmount(
                COLLATERAL_AMOUNT,
                LOWER_TICK,
                UPPER_TICK
            );

        // Fee collector opens position
        vm.startPrank(feeCollector);
        (feeCollectorId, , , , , , ) = sapience.createLiquidityPosition(
            ISapienceStructs.LiquidityMintParams({
                marketId: marketId,
                amountBaseToken: loanAmount0,
                amountQuoteToken: loanAmount1,
                collateralAmount: 0, // Fee collector doesn't need to provide collateral
                lowerTick: LOWER_TICK,
                upperTick: UPPER_TICK,
                minAmountBaseToken: 0,
                minAmountQuoteToken: 0,
                deadline: block.timestamp + 30 minutes
            })
        );
        vm.stopPrank();

        // Regular LP opens position
        vm.startPrank(regularLp);
        (regularLpId, , , , , , ) = sapience.createLiquidityPosition(
            ISapienceStructs.LiquidityMintParams({
                marketId: marketId,
                amountBaseToken: loanAmount0,
                amountQuoteToken: loanAmount1,
                collateralAmount: COLLATERAL_AMOUNT + DUST,
                lowerTick: LOWER_TICK,
                upperTick: UPPER_TICK,
                minAmountBaseToken: 0,
                minAmountQuoteToken: 0,
                deadline: block.timestamp + 30 minutes
            })
        );
        vm.stopPrank();
    }

    function test_newPosition_feeCollectorNoCollateralRequired() public {
        // Get the position for the fee collector
        Position.Data memory feeCollectorPosition = sapience.getPosition(
            feeCollectorId
        );

        // Check that deposited collateral is 0
        assertEq(
            feeCollectorPosition.depositedCollateralAmount,
            0,
            "Fee collector's deposited collateral should be 0"
        );

        // Check that loan amounts are greater than 0
        assertTrue(
            feeCollectorPosition.borrowedVBase > 0,
            "Fee collector's borrowed vBase should be greater than 0"
        );
        assertTrue(
            feeCollectorPosition.borrowedVQuote > 0,
            "Fee collector's borrowed vQuote should be greater than 0"
        );
    }

    function test_feeCollectorDecreaseLiquidity_noCollateralRequired() public {
        // Get the current liquidity for the fee collector's position
        Position.Data memory feeCollectorPosition = sapience.getPosition(
            feeCollectorId
        );
        uint256 uniswapNftId = feeCollectorPosition.uniswapPositionId;

        (, , , , uint128 initialLiquidity) = getCurrentPositionTokenAmounts(
            uniswapNftId,
            MIN_TICK,
            MAX_TICK
        );

        // Calculate the liquidity to decrease (25% of current liquidity)
        uint128 liquidityToDecrease = initialLiquidity / 4;
        vm.startPrank(feeCollector);
        sapience.decreaseLiquidityPosition(
            ISapienceStructs.LiquidityDecreaseParams({
                positionId: feeCollectorId,
                liquidity: liquidityToDecrease,
                minBaseAmount: 0,
                minQuoteAmount: 0,
                deadline: block.timestamp + 30 minutes
            })
        );
        vm.stopPrank();

        // Get the updated position for the fee collector
        Position.Data memory updatedFeeCollectorPosition = sapience.getPosition(
            feeCollectorId
        );

        // Assert that the deposited collateral is still 0
        assertEq(
            updatedFeeCollectorPosition.depositedCollateralAmount,
            0,
            "Fee collector's deposited collateral should remain 0 after decreasing liquidity"
        );

        // Assert that the borrowed token amounts are still greater than 0
        assertTrue(
            updatedFeeCollectorPosition.borrowedVBase > 0,
            "Fee collector's borrowed vBase should still be greater than 0 after decreasing liquidity"
        );
        assertTrue(
            updatedFeeCollectorPosition.borrowedVQuote > 0,
            "Fee collector's borrowed vQuote should still be greater than 0 after decreasing liquidity"
        );
    }

    function test_feeCollectorIncreaseLiquidity_noCollateralRequired() public {
        // Get the current liquidity for the fee collector's position
        Position.Data memory feeCollectorPosition = sapience.getPosition(
            feeCollectorId
        );
        uint256 uniswapNftId = feeCollectorPosition.uniswapPositionId;

        (
            uint256 initialGasTokenAmount,
            uint256 initialEthTokenAmount,
            ,
            ,

        ) = getCurrentPositionTokenAmounts(uniswapNftId, MIN_TICK, MAX_TICK);

        // Calculate the token amounts to increase (double the initial amounts)
        uint256 baseTokenAmountToAdd = initialGasTokenAmount * 2;
        uint256 quoteTokenAmountToAdd = initialEthTokenAmount * 2;

        vm.startPrank(feeCollector);
        sapience.increaseLiquidityPosition(
            ISapienceStructs.LiquidityIncreaseParams({
                positionId: feeCollectorId,
                collateralAmount: 0, // No collateral for fee collector
                baseTokenAmount: baseTokenAmountToAdd,
                quoteTokenAmount: quoteTokenAmountToAdd,
                minBaseAmount: 0,
                minQuoteAmount: 0,
                deadline: block.timestamp + 30 minutes
            })
        );
        vm.stopPrank();

        // Get the updated position for the fee collector
        Position.Data memory updatedFeeCollectorPosition = sapience.getPosition(
            feeCollectorId
        );

        // Assert that the deposited collateral is still 0
        assertEq(
            updatedFeeCollectorPosition.depositedCollateralAmount,
            0,
            "Fee collector's deposited collateral should remain 0 after increasing liquidity"
        );

        // Assert that the borrowed token amounts have increased
        assertTrue(
            updatedFeeCollectorPosition.borrowedVBase >
                feeCollectorPosition.borrowedVBase,
            "Fee collector's borrowed vBase should increase after increasing liquidity"
        );
        assertTrue(
            updatedFeeCollectorPosition.borrowedVQuote >
                feeCollectorPosition.borrowedVQuote,
            "Fee collector's borrowed vQuote should increase after increasing liquidity"
        );
    }
}
