// SPDX-License-Identifier: MIT
pragma solidity >=0.8.2 <0.9.0;

import "forge-std/Test.sol";
import "cannon-std/Cannon.sol";
import {ISapience} from "../../src/market/interfaces/ISapience.sol";
import {IMintableToken} from "../../src/market/external/IMintableToken.sol";
import {TickMath} from "../../src/market/external/univ3/TickMath.sol";
import {TestTrade} from "../helpers/TestTrade.sol";
import {TestMarket} from "../helpers/TestMarket.sol";
import {TestUser} from "../helpers/TestUser.sol";
import {DecimalPrice} from "../../src/market/libraries/DecimalPrice.sol";
import {SafeCastI256, SafeCastU256} from "@synthetixio/core-contracts/contracts/utils/SafeCast.sol";
import {Position} from "../../src/market/storage/Position.sol";
import {Errors} from "../../src/market/storage/Errors.sol";
import {ISapienceStructs} from "../../src/market/interfaces/ISapienceStructs.sol";

import {DecimalMath} from "../../src/market/libraries/DecimalMath.sol";
import "@uniswap/v3-core/contracts/interfaces/IUniswapV3Pool.sol";

contract TradePositionDumb is TestTrade {
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
    address trader2;
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
    uint256 constant MIN_TRADE_SIZE = 10_000; // 10,000 vBase

    function setUp() public {
        collateralAsset = IMintableToken(
            vm.getAddress("CollateralAsset.Token")
        );

        uint160 startingSqrtPriceX96 = INITIAL_PRICE_SQRT;

        (sapience, ) = createMarket(
            MARKET_LOWER_TICK,
            MARKET_UPPER_TICK,
            startingSqrtPriceX96,
            MIN_TRADE_SIZE,
            "wstGwei/quote"
        );

        lp1 = TestUser.createUser("LP1", 10_000_000_000 ether);
        trader1 = TestUser.createUser("Trader1", 10_000_000 ether);
        trader2 = TestUser.createUser("Trader2", 10_000_000 ether);

        // Remove allowance of collateralAsset from trader1 to sapience
        vm.startPrank(trader1);
        collateralAsset.approve(address(sapience), 0);
        vm.stopPrank();

        (ISapienceStructs.MarketData memory marketData, ) = sapience.getLatestMarket();
        marketId = marketData.marketId;
        pool = marketData.pool;
        tokenA = marketData.quoteToken;
        tokenB = marketData.baseToken;

        uniCastedPool = IUniswapV3Pool(pool);
        feeRate = uint256(uniCastedPool.fee()) * 1e12;

        // Add liquidity
        vm.startPrank(lp1);
        addLiquidity(
            sapience,
            pool,
            marketId,
            COLLATERAL_FOR_ORDERS * 10_000_000,
            LP_LOWER_TICK,
            LP_UPPER_TICK
        ); // enough to keep price stable (no slippage)
        vm.stopPrank();
    }

    function test_revertWhen_zeroTradeSize_Create() public {
        vm.startPrank(trader1);

        vm.expectRevert(
            abi.encodeWithSelector(Errors.DeltaTradeIsZero.selector)
        );
        sapience.createTraderPosition(marketId, 0, 0, block.timestamp + 30 minutes);

        vm.stopPrank();
    }

    function test_revertWhen_zeroTradeSize_Modify() public {
        vm.startPrank(trader1);
        int256 initialPositionSize = 1 ether;
        uint256 positionId = addTraderPosition(
            sapience,
            marketId,
            initialPositionSize
        );

        vm.expectRevert(
            abi.encodeWithSelector(Errors.DeltaTradeIsZero.selector)
        );
        sapience.modifyTraderPosition(
            positionId,
            initialPositionSize,
            0,
            block.timestamp + 30 minutes
        );

        vm.stopPrank();
    }

    function test_revertWhen_minTradeSizeNotMet_CreateLong() public {
        vm.startPrank(trader1);

        vm.expectRevert(
            abi.encodeWithSelector(Errors.PositionSizeBelowMin.selector)
        );
        sapience.createTraderPosition(
            marketId,
            (MIN_TRADE_SIZE - 1).toInt(),
            0,
            block.timestamp + 30 minutes
        );

        vm.stopPrank();
    }

    function test_revertWhen_minTradeSizeNotMet_CreateShort() public {
        vm.startPrank(trader1);

        vm.expectRevert(
            abi.encodeWithSelector(Errors.PositionSizeBelowMin.selector)
        );
        sapience.createTraderPosition(
            marketId,
            (MIN_TRADE_SIZE - 1).toInt() * -1,
            0,
            block.timestamp + 30 minutes
        );

        vm.stopPrank();
    }

    function test_revertWhen_minTradeSizeNotMet_ModifyLongToLong() public {
        vm.startPrank(trader1);
        int256 initialPositionSize = 1 ether;
        uint256 positionId = addTraderPosition(
            sapience,
            marketId,
            initialPositionSize
        );

        vm.expectRevert(
            abi.encodeWithSelector(Errors.PositionSizeBelowMin.selector)
        );
        sapience.modifyTraderPosition(
            positionId,
            (MIN_TRADE_SIZE - 1).toInt(),
            0,
            block.timestamp + 30 minutes
        );

        vm.stopPrank();
    }

    function test_revertWhen_minTradeSizeNotMet_ModifyLongToShort() public {
        vm.startPrank(trader1);
        int256 initialPositionSize = 1 ether;
        uint256 positionId = addTraderPosition(
            sapience,
            marketId,
            initialPositionSize
        );

        vm.expectRevert(
            abi.encodeWithSelector(Errors.PositionSizeBelowMin.selector)
        );
        sapience.modifyTraderPosition(
            positionId,
            (MIN_TRADE_SIZE - 1).toInt() * -1,
            0,
            block.timestamp + 30 minutes
        );

        vm.stopPrank();
    }

    function test_revertWhen_minTradeSizeNotMet_ModifyShortToLong() public {
        vm.startPrank(trader1);
        int256 initialPositionSize = -1 ether;
        uint256 positionId = addTraderPosition(
            sapience,
            marketId,
            initialPositionSize
        );

        vm.expectRevert(
            abi.encodeWithSelector(Errors.PositionSizeBelowMin.selector)
        );
        sapience.modifyTraderPosition(
            positionId,
            (MIN_TRADE_SIZE - 1).toInt(),
            0,
            block.timestamp + 30 minutes
        );

        vm.stopPrank();
    }

    function test_revertWhen_minTradeSizeNotMet_ModifyShortToShort() public {
        vm.startPrank(trader1);
        int256 initialPositionSize = -1 ether;
        uint256 positionId = addTraderPosition(
            sapience,
            marketId,
            initialPositionSize
        );

        vm.expectRevert(
            abi.encodeWithSelector(Errors.PositionSizeBelowMin.selector)
        );
        sapience.modifyTraderPosition(
            positionId,
            (MIN_TRADE_SIZE - 1).toInt() * -1,
            0,
            block.timestamp + 30 minutes
        );

        vm.stopPrank();
    }

    function test_revertWhen_modifyPosition_notOwner() public {
        vm.startPrank(trader1);
        uint256 positionId = addTraderPosition(sapience, marketId, 1 ether);
        vm.stopPrank();

        vm.startPrank(trader2);
        vm.expectRevert(
            abi.encodeWithSelector(
                Errors.NotAccountOwner.selector,
                positionId,
                trader2
            )
        );
        sapience.modifyTraderPosition(
            positionId,
            0,
            0,
            block.timestamp + 30 minutes
        );
        vm.stopPrank();
    }

    function test_revertWhen_modifyPosition_wrongId() public {
        vm.startPrank(trader1);
        addTraderPosition(sapience, marketId, 1 ether);

        vm.expectRevert(
            abi.encodeWithSelector(
                Errors.NotAccountOwner.selector,
                1337,
                trader1
            )
        );
        sapience.modifyTraderPosition(1337, 0, 0, block.timestamp + 30 minutes);
        vm.stopPrank();
    }

    function test_revertWhen_modifyPosition_invalidPositionKind() public {
        // add a liquidity position as trader1
        vm.startPrank(trader2);
        uint256 positionId = addLiquidity(
            sapience,
            pool,
            marketId,
            COLLATERAL_FOR_ORDERS * 1_000,
            LP_LOWER_TICK,
            LP_UPPER_TICK
        ); // enough to keep price stable (no slippage)

        // try to modify it as a trader, it should revert
        vm.expectRevert(
            abi.encodeWithSelector(Errors.InvalidPositionKind.selector)
        );
        sapience.modifyTraderPosition(
            positionId,
            0,
            0,
            block.timestamp + 30 minutes
        );

        vm.stopPrank();
    }

    function test_create_Long() public {
        int256 positionSize = 1 ether;
        StateData memory initialStateData;
        fillCollateralStateData(trader1, initialStateData);

        vm.startPrank(trader1);
        // quote and open a long
        (uint256 requiredCollateral, , ) = sapience.quoteCreateTraderPosition(
            marketId,
            positionSize
        );
        collateralAsset.approve(address(sapience), requiredCollateral + 2);
        // Send more collateral than required, just checking the position can be created/modified
        uint256 positionId = sapience.createTraderPosition(
            marketId,
            positionSize,
            requiredCollateral + 2,
            block.timestamp + 30 minutes
        );
        vm.stopPrank();

        // Set expected data
        StateData memory expectedStateData;
        expectedStateData.positionSize = positionSize;
        expectedStateData.vQuoteAmount = 0;
        expectedStateData.vBaseAmount = 1 ether;
        expectedStateData.borrowedVQuote = INITIAL_PRICE_PLUS_FEE_D18.mulDecimal(
            1 ether
        );
        expectedStateData.borrowedVBase = 0;
        expectedStateData.depositedCollateralAmount = requiredCollateral;
        expectedStateData.userCollateral =
            initialStateData.userCollateral -
            requiredCollateral;

        // Check position makes sense
        assertPosition(trader1, positionId, expectedStateData, "Create Long");
    }

    function test_create_Short() public {
        int256 positionSize = -1 ether;
        StateData memory initialStateData;
        fillCollateralStateData(trader1, initialStateData);

        vm.startPrank(trader1);
        // quote and open a long
        (uint256 requiredCollateral, , ) = sapience.quoteCreateTraderPosition(
            marketId,
            positionSize
        );
        collateralAsset.approve(address(sapience), requiredCollateral + 2);
        // Send more collateral than required, just checking the position can be created/modified
        uint256 positionId = sapience.createTraderPosition(
            marketId,
            positionSize,
            requiredCollateral + 2,
            block.timestamp + 30 minutes
        );
        vm.stopPrank();

        // Set expected data
        StateData memory expectedStateData;
        expectedStateData.positionSize = positionSize;
        expectedStateData.vQuoteAmount = INITIAL_PRICE_MINUS_FEE_D18.mulDecimal(
            1 ether
        );
        expectedStateData.vBaseAmount = 0;
        expectedStateData.borrowedVQuote = 0;
        expectedStateData.borrowedVBase = 1 ether;
        expectedStateData.depositedCollateralAmount = requiredCollateral;
        expectedStateData.userCollateral =
            initialStateData.userCollateral -
            requiredCollateral;

        // Check position makes sense
        assertPosition(trader1, positionId, expectedStateData, "Create Short");
    }

    function test_close_Long() public {
        StateData memory initialStateData;
        StateData memory expectedStateData;
        int256 initialPositionSize = 1 ether;

        uint256 positionId;

        fillCollateralStateData(trader1, initialStateData);

        vm.startPrank(trader1);
        positionId = addTraderPosition(sapience, marketId, initialPositionSize);

        // quote and close a long
        (int256 requiredCollateral, , , ) = sapience.quoteModifyTraderPosition(
            positionId,
            0
        );

        if (requiredCollateral > 0) {
            collateralAsset.approve(
                address(sapience),
                requiredCollateral.toUint() + 2
            );
        }
        // Send more collateral than required, just checking the position can be created/modified
        sapience.modifyTraderPosition(
            positionId,
            0,
            requiredCollateral + 2,
            block.timestamp + 30 minutes
        );

        vm.stopPrank();

        int256 pnl = (INITIAL_PRICE_MINUS_FEE_D18.toInt() -
            INITIAL_PRICE_PLUS_FEE_D18.toInt()).mulDecimal(initialPositionSize);

        expectedStateData.positionSize = 0;
        expectedStateData.vQuoteAmount = 0;
        expectedStateData.vBaseAmount = 0;
        expectedStateData.borrowedVQuote = 0;
        expectedStateData.borrowedVBase = 0;
        expectedStateData.depositedCollateralAmount = 0;

        expectedStateData.userCollateral = (initialStateData
            .userCollateral
            .toInt() + pnl).toUint();

        // Check position makes sense
        assertPosition(trader1, positionId, expectedStateData, "Close Long");
    }

    function test_close_Short() public {
        StateData memory initialStateData;
        StateData memory expectedStateData;
        int256 initialPositionSize = -1 ether;

        uint256 positionId;

        fillCollateralStateData(trader1, initialStateData);

        vm.startPrank(trader1);
        positionId = addTraderPosition(sapience, marketId, initialPositionSize);

        // quote and close a long
        (int256 requiredCollateral, , , ) = sapience.quoteModifyTraderPosition(
            positionId,
            0
        );
        if (requiredCollateral > 0) {
            collateralAsset.approve(
                address(sapience),
                requiredCollateral.toUint() + 2
            );
        }

        // Send more collateral than required, just checking the position can be created/modified
        sapience.modifyTraderPosition(
            positionId,
            0,
            requiredCollateral + 2,
            block.timestamp + 30 minutes
        );

        vm.stopPrank();

        int256 pnl = (INITIAL_PRICE_MINUS_FEE_D18.toInt() -
            INITIAL_PRICE_PLUS_FEE_D18.toInt()).mulDecimal(
                initialPositionSize * -1
            );

        expectedStateData.positionSize = 0;
        expectedStateData.vQuoteAmount = 0;
        expectedStateData.vBaseAmount = 0;
        expectedStateData.borrowedVQuote = 0;
        expectedStateData.borrowedVBase = 0;
        expectedStateData.depositedCollateralAmount = 0;
        expectedStateData.userCollateral = (initialStateData
            .userCollateral
            .toInt() + pnl).toUint();

        // Check position makes sense
        assertPosition(trader1, positionId, expectedStateData, "Close Short");
    }

    function test_modify_Long2Long_Increase() public {
        StateData memory initialStateData;
        StateData memory expectedStateData;
        int256 initialPositionSize = 1 ether;
        int256 finalPositionSize = 2 ether;

        uint256 positionId;

        fillCollateralStateData(trader1, initialStateData);
        vm.startPrank(trader1);
        positionId = addTraderPosition(sapience, marketId, initialPositionSize);

        fillCollateralStateData(trader1, initialStateData);
        fillPositionState(positionId, initialStateData);

        // quote and close a long
        (int256 requiredDeltaCollateral, int256 closePnL, , ) = sapience
            .quoteModifyTraderPosition(positionId, finalPositionSize);

        if (requiredDeltaCollateral > 0) {
            collateralAsset.approve(
                address(sapience),
                requiredDeltaCollateral.toUint()
            );
        }

        // Send more collateral than required, just checking the position can be created/modified
        sapience.modifyTraderPosition(
            positionId,
            finalPositionSize,
            requiredDeltaCollateral + 2,
            block.timestamp + 30 minutes
        );

        vm.stopPrank();

        expectedStateData.positionSize = finalPositionSize;
        expectedStateData.vQuoteAmount = 0;
        expectedStateData.vBaseAmount = finalPositionSize.toUint();
        expectedStateData.borrowedVQuote = finalPositionSize.toUint().mulDecimal(
            INITIAL_PRICE_PLUS_FEE_D18
        );
        expectedStateData.borrowedVBase = 0;

        expectedStateData.depositedCollateralAmount =
            (initialStateData.depositedCollateralAmount.toInt() +
                requiredDeltaCollateral).toUint() +
            closePnL.toUint();
        expectedStateData.userCollateral = (initialStateData
            .userCollateral
            .toInt() - requiredDeltaCollateral).toUint();

        // Check position makes sense
        assertPosition(
            trader1,
            positionId,
            expectedStateData,
            "Long2Long Increase"
        );
    }

    function test_modify_Long2Long_Reduce() public {
        StateData memory initialStateData;
        StateData memory expectedStateData;
        int256 initialPositionSize = 1 ether;
        int256 finalPositionSize = .5 ether;

        uint256 positionId;

        fillCollateralStateData(trader1, initialStateData);

        vm.startPrank(trader1);
        positionId = addTraderPosition(sapience, marketId, initialPositionSize);

        // quote and close a long
        (int256 requiredDeltaCollateral, int256 closePnL, , ) = sapience
            .quoteModifyTraderPosition(positionId, finalPositionSize);

        if (requiredDeltaCollateral > 0) {
            collateralAsset.approve(
                address(sapience),
                requiredDeltaCollateral.toUint() + 2
            );
        }

        // Send more collateral than required, just checking the position can be created/modified
        sapience.modifyTraderPosition(
            positionId,
            finalPositionSize,
            requiredDeltaCollateral + 2,
            block.timestamp + 30 minutes
        );

        vm.stopPrank();

        uint partialVEth = initialPositionSize.toUint().mulDecimal(
            INITIAL_PRICE_PLUS_FEE_D18
        );

        expectedStateData.positionSize = finalPositionSize;
        expectedStateData.vQuoteAmount = 0;
        expectedStateData.vBaseAmount = finalPositionSize.toUint();
        expectedStateData.borrowedVQuote =
            partialVEth -
            INITIAL_PRICE_MINUS_FEE_D18.mulDecimal(.5 ether) -
            (closePnL * -1).toUint();
        expectedStateData.borrowedVBase = 0;

        // Check position makes sense
        assertPosition(
            trader1,
            positionId,
            expectedStateData,
            "Long2Long Reduce"
        );
    }

    function test_modify_Short2Short_Increase() public {
        StateData memory initialStateData;
        StateData memory expectedStateData;
        int256 initialPositionSize = -1 ether;
        int256 finalPositionSize = -2 ether;

        uint256 positionId;

        fillCollateralStateData(trader1, initialStateData);

        vm.startPrank(trader1);
        positionId = addTraderPosition(sapience, marketId, initialPositionSize);

        // quote and close a long
        (int256 requiredDeltaCollateral, , , ) = sapience.quoteModifyTraderPosition(
            positionId,
            finalPositionSize
        );

        if (requiredDeltaCollateral > 0) {
            collateralAsset.approve(
                address(sapience),
                requiredDeltaCollateral.toUint() + 2
            );
        }

        // Send more collateral than required, just checking the position can be created/modified
        sapience.modifyTraderPosition(
            positionId,
            finalPositionSize,
            requiredDeltaCollateral + 2,
            block.timestamp + 30 minutes
        );

        vm.stopPrank();

        expectedStateData.positionSize = finalPositionSize;
        expectedStateData.vQuoteAmount = (finalPositionSize * -1)
            .toUint()
            .mulDecimal(INITIAL_PRICE_MINUS_FEE_D18);
        expectedStateData.vBaseAmount = 0;
        expectedStateData.borrowedVQuote = 0;
        expectedStateData.borrowedVBase = (finalPositionSize * -1).toUint();

        // Check position makes sense
        assertPosition(
            trader1,
            positionId,
            expectedStateData,
            "Short2Short Increase"
        );
    }

    function test_modify_Short2Short_Reduce() public {
        StateData memory initialStateData;
        StateData memory expectedStateData;
        int256 initialPositionSize = -1 ether;
        int256 finalPositionSize = -.5 ether;

        uint256 positionId;

        fillCollateralStateData(trader1, initialStateData);

        vm.startPrank(trader1);
        positionId = addTraderPosition(sapience, marketId, initialPositionSize);

        // quote and close a long
        (int256 requiredDeltaCollateral, int256 closePnL, , ) = sapience
            .quoteModifyTraderPosition(positionId, finalPositionSize);

        if (requiredDeltaCollateral > 0) {
            collateralAsset.approve(
                address(sapience),
                requiredDeltaCollateral.toUint() + 2
            );
        }
        // Send more collateral than required, just checking the position can be created/modified
        sapience.modifyTraderPosition(
            positionId,
            finalPositionSize,
            requiredDeltaCollateral + 2,
            block.timestamp + 30 minutes
        );

        vm.stopPrank();

        uint partialVEth = (initialPositionSize * -1).toUint().mulDecimal(
            INITIAL_PRICE_MINUS_FEE_D18
        );

        expectedStateData.positionSize = finalPositionSize;
        expectedStateData.vQuoteAmount =
            partialVEth -
            INITIAL_PRICE_PLUS_FEE_D18.mulDecimal(.5 ether) +
            (closePnL * -1).toUint();
        expectedStateData.vBaseAmount = 0;
        expectedStateData.borrowedVQuote = 0;
        expectedStateData.borrowedVBase = (finalPositionSize * -1).toUint();

        // Check position makes sense
        assertPosition(
            trader1,
            positionId,
            expectedStateData,
            "Short2Short Reduce"
        );
    }

    function test_modify_Long2Short() public {
        StateData memory initialStateData;
        StateData memory expectedStateData;
        int256 initialPositionSize = 1 ether;
        int256 finalPositionSize = -1 ether;

        uint256 positionId;

        fillCollateralStateData(trader1, initialStateData);

        vm.startPrank(trader1);
        positionId = addTraderPosition(sapience, marketId, initialPositionSize);

        // quote and close a long
        (int256 requiredDeltaCollateral, , , ) = sapience.quoteModifyTraderPosition(
            positionId,
            finalPositionSize
        );

        if (requiredDeltaCollateral > 0) {
            collateralAsset.approve(
                address(sapience),
                requiredDeltaCollateral.toUint() + 2
            );
        }

        // Send more collateral than required, just checking the position can be created/modified
        sapience.modifyTraderPosition(
            positionId,
            finalPositionSize,
            requiredDeltaCollateral + 2,
            block.timestamp + 30 minutes
        );

        vm.stopPrank();

        expectedStateData.positionSize = finalPositionSize;
        expectedStateData.vQuoteAmount = INITIAL_PRICE_MINUS_FEE_D18.mulDecimal(
            1 ether
        );
        expectedStateData.vBaseAmount = 0;
        expectedStateData.borrowedVQuote = 0;
        expectedStateData.borrowedVBase = (finalPositionSize * -1).toUint();

        // Check position makes sense
        assertPosition(
            trader1,
            positionId,
            expectedStateData,
            "Long2Short Reduce"
        );
    }

    function test_modify_Short2Long() public {
        StateData memory initialStateData;
        StateData memory expectedStateData;
        int256 initialPositionSize = -1 ether;
        int256 finalPositionSize = 1 ether;

        uint256 positionId;

        fillCollateralStateData(trader1, initialStateData);

        vm.startPrank(trader1);
        positionId = addTraderPosition(sapience, marketId, initialPositionSize);

        // quote and close a long
        (int256 requiredDeltaCollateral, , , ) = sapience.quoteModifyTraderPosition(
            positionId,
            finalPositionSize
        );
        if (requiredDeltaCollateral > 0) {
            collateralAsset.approve(
                address(sapience),
                requiredDeltaCollateral.toUint() + 2
            );
        }

        // Send more collateral than required, just checking the position can be created/modified
        sapience.modifyTraderPosition(
            positionId,
            finalPositionSize,
            requiredDeltaCollateral + 2,
            block.timestamp + 30 minutes
        );

        vm.stopPrank();

        expectedStateData.positionSize = finalPositionSize;
        expectedStateData.vQuoteAmount = 0;
        expectedStateData.vBaseAmount = (finalPositionSize).toUint();
        expectedStateData.borrowedVQuote = INITIAL_PRICE_PLUS_FEE_D18.mulDecimal(
            1 ether
        );
        expectedStateData.borrowedVBase = 0;

        // Check position makes sense
        assertPosition(
            trader1,
            positionId,
            expectedStateData,
            "Short2Long Reduce"
        );
    }

    function test_quote_create_Long() public {
        int256 positionSize = 1 ether;
        StateData memory initialStateData;
        fillCollateralStateData(trader1, initialStateData);

        vm.startPrank(trader1);
        // quote and open a long
        (uint256 requiredCollateral, , uint256 quotedPrice18DigitsAfter) = sapience.quoteCreateTraderPosition(
            marketId,
            positionSize
        );
        collateralAsset.approve(address(sapience), requiredCollateral + 2);
        // Send more collateral than required, just checking the position can be created/modified
        sapience.createTraderPosition(
            marketId,
            positionSize,
            requiredCollateral + 2,
            block.timestamp + 30 minutes
        );
        vm.stopPrank();

        uint256 price18DigitsAfter = sapience.getReferencePrice(marketId);
        assertEq(quotedPrice18DigitsAfter, price18DigitsAfter, "quotedPrice18DigitsAfter");
    }

    function test_quote_create_Short() public {
        int256 positionSize = -1 ether;
        StateData memory initialStateData;
        fillCollateralStateData(trader1, initialStateData);

        vm.startPrank(trader1);
        // quote and open a long
        (uint256 requiredCollateral, , uint256 quotedPrice18DigitsAfter) = sapience.quoteCreateTraderPosition(
            marketId,
            positionSize
        );
        collateralAsset.approve(address(sapience), requiredCollateral + 2);
        // Send more collateral than required, just checking the position can be created/modified
        sapience.createTraderPosition(
            marketId,
            positionSize,
            requiredCollateral + 2,
            block.timestamp + 30 minutes
        );
        vm.stopPrank();

        uint256 price18DigitsAfter = sapience.getReferencePrice(marketId);
        assertEq(quotedPrice18DigitsAfter, price18DigitsAfter, "quotedPrice18DigitsAfter");
    }

    function test_quote_modify_Long() public {
        StateData memory initialStateData;
        int256 initialPositionSize = 1 ether;
        int256 finalPositionSize = 2 ether;

        uint256 positionId;

        fillCollateralStateData(trader1, initialStateData);
        vm.startPrank(trader1);
        positionId = addTraderPosition(sapience, marketId, initialPositionSize);

        fillCollateralStateData(trader1, initialStateData);
        fillPositionState(positionId, initialStateData);

        // quote and close a long
        (int256 requiredDeltaCollateral, , , uint256 quotedPrice18DigitsAfter) = sapience
            .quoteModifyTraderPosition(positionId, finalPositionSize);

        if (requiredDeltaCollateral > 0) {
            collateralAsset.approve(
                address(sapience),
                requiredDeltaCollateral.toUint()
            );
        }

        // Send more collateral than required, just checking the position can be created/modified
        sapience.modifyTraderPosition(
            positionId,
            finalPositionSize,
            requiredDeltaCollateral + 2,
            block.timestamp + 30 minutes
        );

        vm.stopPrank();

        uint256 price18DigitsAfter = sapience.getReferencePrice(marketId);
        assertEq(quotedPrice18DigitsAfter, price18DigitsAfter, "quotedPrice18DigitsAfter");
    }

    function test_quote_modify_Short() public {
        StateData memory initialStateData;
        int256 initialPositionSize = -1 ether;
        int256 finalPositionSize = -2 ether;

        uint256 positionId;

        fillCollateralStateData(trader1, initialStateData);

        vm.startPrank(trader1);
        positionId = addTraderPosition(sapience, marketId, initialPositionSize);

        // quote and close a long
        (int256 requiredDeltaCollateral, , , uint256 quotedPrice18DigitsAfter) = sapience.quoteModifyTraderPosition(
            positionId,
            finalPositionSize
        );

        if (requiredDeltaCollateral > 0) {
            collateralAsset.approve(
                address(sapience),
                requiredDeltaCollateral.toUint() + 2
            );
        }

        // Send more collateral than required, just checking the position can be created/modified
        sapience.modifyTraderPosition(
            positionId,
            finalPositionSize,
            requiredDeltaCollateral + 2,
            block.timestamp + 30 minutes
        );

        vm.stopPrank();

        uint256 price18DigitsAfter = sapience.getReferencePrice(marketId);
        assertEq(quotedPrice18DigitsAfter, price18DigitsAfter, "quotedPrice18DigitsAfter");
    }

    // //////////////// //
    // Helper functions //
    // //////////////// //

    function fillPositionState(
        uint256 positionId,
        StateData memory stateData
    ) public {
        Position.Data memory position = sapience.getPosition(positionId);
        stateData.depositedCollateralAmount = position
            .depositedCollateralAmount;
        stateData.vQuoteAmount = position.vQuoteAmount;
        stateData.vBaseAmount = position.vBaseAmount;
        stateData.borrowedVQuote = position.borrowedVQuote;
        stateData.borrowedVBase = position.borrowedVBase;
        stateData.positionSize = sapience.getPositionSize(positionId);
    }

    function fillCollateralStateData(
        address user,
        StateData memory stateData
    ) public view {
        stateData.userCollateral = collateralAsset.balanceOf(user);
        stateData.sapienceCollateral = collateralAsset.balanceOf(address(sapience));
    }

    function assertPosition(
        address user,
        uint256 positionId,
        StateData memory expectedStateData,
        string memory stage
    ) public returns (StateData memory currentStateData) {
        fillCollateralStateData(user, currentStateData);
        fillPositionState(positionId, currentStateData);

        if (expectedStateData.userCollateral != 0) {
            fillCollateralStateData(user, currentStateData);
            assertApproxEqRel(
                currentStateData.userCollateral,
                expectedStateData.userCollateral,
                0.0000001 ether,
                string.concat(stage, " userCollateral")
            );
            assertEq(
                currentStateData.depositedCollateralAmount,
                expectedStateData.depositedCollateralAmount,
                string.concat(stage, " depositedCollateralAmount")
            );
        }
        assertApproxEqRel(
            currentStateData.positionSize,
            expectedStateData.positionSize,
            0.00001 ether,
            string.concat(stage, " positionSize")
        );
        assertApproxEqRel(
            currentStateData.vBaseAmount,
            expectedStateData.vBaseAmount,
            0.00001 ether,
            string.concat(stage, " vBaseAmount")
        );
        assertApproxEqRel(
            currentStateData.borrowedVBase,
            expectedStateData.borrowedVBase,
            0.00001 ether,
            string.concat(stage, " borrowedVBase")
        );
        assertApproxEqRel(
            currentStateData.vQuoteAmount,
            expectedStateData.vQuoteAmount,
            0.0015 ether,
            string.concat(stage, " vQuoteAmount")
        );
        assertApproxEqRel(
            currentStateData.borrowedVQuote,
            expectedStateData.borrowedVQuote,
            0.0015 ether,
            string.concat(stage, " borrowedVQuote")
        );
    }
}
