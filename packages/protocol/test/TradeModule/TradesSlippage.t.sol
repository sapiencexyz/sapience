// SPDX-License-Identifier: MIT
pragma solidity >=0.8.2 <0.9.0;

import "forge-std/Test.sol";
import "cannon-std/Cannon.sol";
import {ISapience} from "../../src/market/interfaces/ISapience.sol";
import {IMintableToken} from "../../src/market/external/IMintableToken.sol";
import {TestTrade} from "../helpers/TestTrade.sol";
import {TestUser} from "../helpers/TestUser.sol";
import {SafeCastI256, SafeCastU256} from "@synthetixio/core-contracts/contracts/utils/SafeCast.sol";
import {Errors} from "../../src/market/storage/Errors.sol";
import {ISapienceStructs} from "../../src/market/interfaces/ISapienceStructs.sol";

import {DecimalMath} from "../../src/market/libraries/DecimalMath.sol";
import "@uniswap/v3-core/contracts/interfaces/IUniswapV3Pool.sol";

contract TradePositionSlippage is TestTrade {
    using Cannon for Vm;
    using DecimalMath for uint256;
    using DecimalMath for int256;
    using SafeCastI256 for int256;
    using SafeCastU256 for uint256;

    // helper struct
    struct StateData {
        uint256 userCollateral;
        uint256 sapienceCollateral;
        uint256 borrowedVQuote;
        uint256 borrowedVBase;
        uint256 vQuoteAmount;
        uint256 vBaseAmount;
        int256 positionSize;
        uint256 depositedCollateralAmount;
    }

    ISapience sapience;
    IMintableToken collateralAsset;

    address lp1;
    address trader1;
    uint256 marketId;
    address pool;
    address tokenA;
    address tokenB;
    IUniswapV3Pool uniCastedPool;
    uint256 feeRate;
    int24 MARKET_LOWER_TICK = 16000; //5 (4.952636224061651)
    int24 MARKET_UPPER_TICK = 29800; //20 (19.68488357413147)
    int24 LP_LOWER_TICK = 16000;
    int24 LP_UPPER_TICK = 29800;
    uint256 COLLATERAL_FOR_ORDERS = 10 ether;
    uint160 INITIAL_PRICE_SQRT = 250541448375047931186413801569; // 10 (9999999999999999999)
    uint256 INITIAL_PRICE_D18 = 10 ether;
    uint256 INITIAL_PRICE_PLUS_FEE_D18 = 10.1 ether;
    uint256 INITIAL_PRICE_MINUS_FEE_D18 = 9.9 ether;
    uint256 PLUS_FEE_MULTIPLIER_D18 = 1.01 ether;
    uint256 MINUS_FEE_MULTIPLIER_D18 = 0.99 ether;

    int256 SLIPPAGE_MULTIPLIER_INCREASE = 1.02 ether;
    int256 SLIPPAGE_MULTIPLIER_DECREASE = 0.98 ether;
    uint256 constant MIN_TRADE_SIZE = 10_000; // 10,000 vBase

    function setUp() public {
        collateralAsset = IMintableToken(vm.getAddress("CollateralAsset.Token"));

        uint160 startingSqrtPriceX96 = INITIAL_PRICE_SQRT;

        (sapience,) =
            createMarket(MARKET_LOWER_TICK, MARKET_UPPER_TICK, startingSqrtPriceX96, MIN_TRADE_SIZE, "wstGwei/quote");

        lp1 = TestUser.createUser("LP1", 10_000_000_000 ether);
        trader1 = TestUser.createUser("Trader1", 10_000_000 ether);

        (ISapienceStructs.MarketData memory marketData,) = sapience.getLatestMarket();
        marketId = marketData.marketId;
        pool = marketData.pool;
        tokenA = marketData.quoteToken;
        tokenB = marketData.baseToken;

        uniCastedPool = IUniswapV3Pool(pool);
        feeRate = uint256(uniCastedPool.fee()) * 1e12;

        // Add liquidity
        vm.startPrank(lp1);
        addLiquidity(sapience, pool, marketId, COLLATERAL_FOR_ORDERS * 10_000_000, LP_LOWER_TICK, LP_UPPER_TICK); // enough to keep price stable (no slippage)
        vm.stopPrank();
    }

    function test_revertIfCollateralLimitIsReached_create_long() public {
        int256 positionSize = 1 ether;
        vm.startPrank(trader1);

        (uint256 requiredCollateral,,) = sapience.quoteCreateTraderPosition(marketId, positionSize);

        // Expect revert
        vm.expectPartialRevert(Errors.CollateralLimitReached.selector);
        sapience.createTraderPosition(
            ISapienceStructs.TraderPositionCreateParams({
                marketId: marketId,
                size: positionSize,
                maxCollateral: requiredCollateral - 100,
                deadline: block.timestamp + 30 minutes
            })
        );

        // Now attempt to create the position without reverting
        uint256 positionId = sapience.createTraderPosition(
            ISapienceStructs.TraderPositionCreateParams({
                marketId: marketId,
                size: positionSize,
                maxCollateral: requiredCollateral.mulDecimal(SLIPPAGE_MULTIPLIER_INCREASE.toUint()),
                deadline: block.timestamp + 30 minutes
            })
        );
        vm.stopPrank();

        assertEq(sapience.getPositionSize(positionId), positionSize);
    }

    function test_revertIfCollateralLimitIsReached_create_short() public {
        int256 positionSize = -1 ether;
        vm.startPrank(trader1);

        (uint256 requiredCollateral,,) = sapience.quoteCreateTraderPosition(marketId, positionSize);

        // Expect revert
        vm.expectPartialRevert(Errors.CollateralLimitReached.selector);
        sapience.createTraderPosition(
            ISapienceStructs.TraderPositionCreateParams({
                marketId: marketId,
                size: positionSize,
                maxCollateral: requiredCollateral - 100,
                deadline: block.timestamp + 30 minutes
            })
        );

        // Now attempt to create the position without reverting
        uint256 positionId = sapience.createTraderPosition(
            ISapienceStructs.TraderPositionCreateParams({
                marketId: marketId,
                size: positionSize,
                maxCollateral: requiredCollateral.mulDecimal(SLIPPAGE_MULTIPLIER_INCREASE.toUint()),
                deadline: block.timestamp + 30 minutes
            })
        );
        vm.stopPrank();

        assertEq(sapience.getPositionSize(positionId), positionSize);
    }

    function test_revertIfCollateralLimitIsReached_increase_long() public {
        int256 positionSize = 1 ether;
        int256 updatedPositionSize = 2 ether;
        vm.startPrank(trader1);

        (uint256 requiredCollateral,,) = sapience.quoteCreateTraderPosition(marketId, positionSize);

        uint256 positionId = sapience.createTraderPosition(
            ISapienceStructs.TraderPositionCreateParams({
                marketId: marketId,
                size: positionSize,
                maxCollateral: requiredCollateral.mulDecimal(SLIPPAGE_MULTIPLIER_INCREASE.toUint()),
                deadline: block.timestamp + 30 minutes
            })
        );

        (int256 requiredCollateralForUpdate,,,) = sapience.quoteModifyTraderPosition(positionId, updatedPositionSize);

        // Expect revert
        vm.expectPartialRevert(Errors.CollateralLimitReached.selector);
        sapience.modifyTraderPosition(
            ISapienceStructs.TraderPositionModifyParams({
                positionId: positionId,
                size: updatedPositionSize,
                deltaCollateralLimit: requiredCollateralForUpdate - 100,
                deadline: block.timestamp + 30 minutes
            })
        );

        // Now attempt to create the position without reverting
        sapience.modifyTraderPosition(
            ISapienceStructs.TraderPositionModifyParams({
                positionId: positionId,
                size: updatedPositionSize,
                deltaCollateralLimit: requiredCollateralForUpdate.mulDecimal(SLIPPAGE_MULTIPLIER_INCREASE),
                deadline: block.timestamp + 30 minutes
            })
        );

        vm.stopPrank();

        assertEq(sapience.getPositionSize(positionId), updatedPositionSize);
    }

    function test_revertIfCollateralLimitIsReached_decrease_long() public {
        int256 positionSize = 1 ether;
        int256 updatedPositionSize = 0.5 ether;
        vm.startPrank(trader1);

        (uint256 requiredCollateral,,) = sapience.quoteCreateTraderPosition(marketId, positionSize);

        uint256 positionId = sapience.createTraderPosition(
            ISapienceStructs.TraderPositionCreateParams({
                marketId: marketId,
                size: positionSize,
                maxCollateral: requiredCollateral.mulDecimal(SLIPPAGE_MULTIPLIER_INCREASE.toUint()),
                deadline: block.timestamp + 30 minutes
            })
        );

        (int256 requiredCollateralForUpdate,,,) = sapience.quoteModifyTraderPosition(positionId, updatedPositionSize);

        // Expect revert
        vm.expectPartialRevert(Errors.CollateralLimitReached.selector);
        sapience.modifyTraderPosition(
            ISapienceStructs.TraderPositionModifyParams({
                positionId: positionId,
                size: updatedPositionSize,
                deltaCollateralLimit: requiredCollateralForUpdate - 100,
                deadline: block.timestamp + 30 minutes
            })
        );

        // Now attempt to create the position without reverting
        sapience.modifyTraderPosition(
            ISapienceStructs.TraderPositionModifyParams({
                positionId: positionId,
                size: updatedPositionSize,
                deltaCollateralLimit: requiredCollateralForUpdate.mulDecimal(SLIPPAGE_MULTIPLIER_DECREASE),
                deadline: block.timestamp + 30 minutes
            })
        );

        vm.stopPrank();

        assertEq(sapience.getPositionSize(positionId), updatedPositionSize);
    }

    function test_revertIfCollateralLimitIsReached_increase_short() public {
        int256 positionSize = -1 ether;
        int256 updatedPositionSize = -2 ether;
        vm.startPrank(trader1);

        (uint256 requiredCollateral,,) = sapience.quoteCreateTraderPosition(marketId, positionSize);

        uint256 positionId = sapience.createTraderPosition(
            ISapienceStructs.TraderPositionCreateParams({
                marketId: marketId,
                size: positionSize,
                maxCollateral: requiredCollateral.mulDecimal(SLIPPAGE_MULTIPLIER_INCREASE.toUint()),
                deadline: block.timestamp + 30 minutes
            })
        );

        (int256 requiredCollateralForUpdate,,,) = sapience.quoteModifyTraderPosition(positionId, updatedPositionSize);

        // Expect revert
        vm.expectPartialRevert(Errors.CollateralLimitReached.selector);
        sapience.modifyTraderPosition(
            ISapienceStructs.TraderPositionModifyParams({
                positionId: positionId,
                size: updatedPositionSize,
                deltaCollateralLimit: requiredCollateralForUpdate - 100,
                deadline: block.timestamp + 30 minutes
            })
        );

        // Now attempt to create the position without reverting
        sapience.modifyTraderPosition(
            ISapienceStructs.TraderPositionModifyParams({
                positionId: positionId,
                size: updatedPositionSize,
                deltaCollateralLimit: requiredCollateralForUpdate.mulDecimal(SLIPPAGE_MULTIPLIER_INCREASE),
                deadline: block.timestamp + 30 minutes
            })
        );

        vm.stopPrank();

        assertEq(sapience.getPositionSize(positionId), updatedPositionSize);
    }

    function test_revertIfCollateralLimitIsReached_decrease_short() public {
        int256 positionSize = -1 ether;
        int256 updatedPositionSize = -0.5 ether;
        vm.startPrank(trader1);

        (uint256 requiredCollateral,,) = sapience.quoteCreateTraderPosition(marketId, positionSize);

        uint256 positionId = sapience.createTraderPosition(
            ISapienceStructs.TraderPositionCreateParams({
                marketId: marketId,
                size: positionSize,
                maxCollateral: requiredCollateral.mulDecimal(SLIPPAGE_MULTIPLIER_INCREASE.toUint()),
                deadline: block.timestamp + 30 minutes
            })
        );

        (int256 requiredCollateralForUpdate,,,) = sapience.quoteModifyTraderPosition(positionId, updatedPositionSize);

        // Expect revert
        vm.expectPartialRevert(Errors.CollateralLimitReached.selector);
        sapience.modifyTraderPosition(
            ISapienceStructs.TraderPositionModifyParams({
                positionId: positionId,
                size: updatedPositionSize,
                deltaCollateralLimit: requiredCollateralForUpdate - 100,
                deadline: block.timestamp + 30 minutes
            })
        );

        // Now attempt to create the position without reverting
        sapience.modifyTraderPosition(
            ISapienceStructs.TraderPositionModifyParams({
                positionId: positionId,
                size: updatedPositionSize,
                deltaCollateralLimit: requiredCollateralForUpdate.mulDecimal(SLIPPAGE_MULTIPLIER_DECREASE),
                deadline: block.timestamp + 30 minutes
            })
        );

        vm.stopPrank();

        assertEq(sapience.getPositionSize(positionId), updatedPositionSize);
    }

    function test_revertIfCollateralLimitIsReached_close_long() public {
        int256 positionSize = 1 ether;
        int256 updatedPositionSize = 0;
        vm.startPrank(trader1);

        (uint256 requiredCollateral,,) = sapience.quoteCreateTraderPosition(marketId, positionSize);

        uint256 positionId = sapience.createTraderPosition(
            ISapienceStructs.TraderPositionCreateParams({
                marketId: marketId,
                size: positionSize,
                maxCollateral: requiredCollateral.mulDecimal(SLIPPAGE_MULTIPLIER_INCREASE.toUint()),
                deadline: block.timestamp + 30 minutes
            })
        );

        (int256 requiredCollateralForUpdate,,,) = sapience.quoteModifyTraderPosition(positionId, updatedPositionSize);

        // Expect revert
        vm.expectPartialRevert(Errors.CollateralLimitReached.selector);
        sapience.modifyTraderPosition(
            ISapienceStructs.TraderPositionModifyParams({
                positionId: positionId,
                size: updatedPositionSize,
                deltaCollateralLimit: requiredCollateralForUpdate - 100,
                deadline: block.timestamp + 30 minutes
            })
        );

        // Now attempt to create the position without reverting
        sapience.modifyTraderPosition(
            ISapienceStructs.TraderPositionModifyParams({
                positionId: positionId,
                size: updatedPositionSize,
                deltaCollateralLimit: requiredCollateralForUpdate.mulDecimal(SLIPPAGE_MULTIPLIER_DECREASE),
                deadline: block.timestamp + 30 minutes
            })
        );

        vm.stopPrank();

        assertEq(sapience.getPositionSize(positionId), updatedPositionSize);
    }

    function test_revertIfCollateralLimitIsReached_close_short() public {
        int256 positionSize = 1 ether;
        int256 updatedPositionSize = 0;
        vm.startPrank(trader1);

        (uint256 requiredCollateral,,) = sapience.quoteCreateTraderPosition(marketId, positionSize);

        uint256 positionId = sapience.createTraderPosition(
            ISapienceStructs.TraderPositionCreateParams({
                marketId: marketId,
                size: positionSize,
                maxCollateral: requiredCollateral.mulDecimal(SLIPPAGE_MULTIPLIER_INCREASE.toUint()),
                deadline: block.timestamp + 30 minutes
            })
        );

        (int256 requiredCollateralForUpdate,,,) = sapience.quoteModifyTraderPosition(positionId, updatedPositionSize);

        // Expect revert
        vm.expectPartialRevert(Errors.CollateralLimitReached.selector);
        sapience.modifyTraderPosition(
            ISapienceStructs.TraderPositionModifyParams({
                positionId: positionId,
                size: updatedPositionSize,
                deltaCollateralLimit: requiredCollateralForUpdate - 100,
                deadline: block.timestamp + 30 minutes
            })
        );

        // Now attempt to create the position without reverting
        sapience.modifyTraderPosition(
            ISapienceStructs.TraderPositionModifyParams({
                positionId: positionId,
                size: updatedPositionSize,
                deltaCollateralLimit: requiredCollateralForUpdate.mulDecimal(SLIPPAGE_MULTIPLIER_DECREASE),
                deadline: block.timestamp + 30 minutes
            })
        );

        vm.stopPrank();

        assertEq(sapience.getPositionSize(positionId), updatedPositionSize);
    }
}
