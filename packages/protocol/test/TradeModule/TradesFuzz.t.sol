// SPDX-License-Identifier: MIT
pragma solidity >=0.8.2 <0.9.0;

import "forge-std/Test.sol";
import "cannon-std/Cannon.sol";
import {ISapience} from "../../src/market/interfaces/ISapience.sol";
import {IMintableToken} from "../../src/market/external/IMintableToken.sol";
import {TestTrade} from "../helpers/TestTrade.sol";
import {TestUser} from "../helpers/TestUser.sol";
import {SafeCastI256, SafeCastU256} from "@synthetixio/core-contracts/contracts/utils/SafeCast.sol";
import {Position} from "../../src/market/storage/Position.sol";
import {ISapienceStructs} from "../../src/market/interfaces/ISapienceStructs.sol";

import {DecimalMath} from "../../src/market/libraries/DecimalMath.sol";
import "@uniswap/v3-core/contracts/interfaces/IUniswapV3Pool.sol";
import {IQuoterV2} from "../../src/market/interfaces/external/IQuoterV2.sol";

contract TradePositionBasicFuzz is TestTrade {
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
    IQuoterV2 uniswapQuoterV2;
    uint256 feeRate;
    int24 MARKET_LOWER_TICK = 16000; //5 (4.952636224061651)
    int24 MARKET_UPPER_TICK = 29800; //20 (19.68488357413147)
    int24 LP_LOWER_TICK = 23000; // (9.973035566235849)
    int24 LP_UPPER_TICK = 23200; // (10.174494074987374)
    uint256 COLLATERAL_FOR_ORDERS = 10 ether;
    uint160 INITIAL_PRICE_SQRT = 250541448375047931186413801569; // 10 (9999999999999999999)
    uint256 INITIAL_PRICE_D18 = 10 ether;
    uint256 INITIAL_PRICE_PLUS_FEE_D18 = 10.1 ether;
    uint256 INITIAL_PRICE_MINUS_FEE_D18 = 9.9 ether;
    uint256 PLUS_FEE_MULTIPLIER_D18 = 1.01 ether;
    uint256 MINUS_FEE_MULTIPLIER_D18 = 0.99 ether;
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

        uniswapQuoterV2 = IQuoterV2(vm.getAddress("Uniswap.QuoterV2"));

        // Add liquidity
        vm.startPrank(lp1);
        addLiquidity(sapience, pool, marketId, COLLATERAL_FOR_ORDERS * 10_000_000, LP_LOWER_TICK, LP_UPPER_TICK); // enough to keep price stable (no slippage)
        vm.stopPrank();
    }

    function test_fuzz_create_Long(uint256 position) public {
        position = bound(position, 0.0000001 ether, 10 ether);

        StateData memory latestStateData;
        StateData memory expectedStateData;
        int256 positionSize = position.toInt();

        fillCollateralStateData(trader1, latestStateData);

        vm.startPrank(trader1);
        // quote and open a long
        (uint256 requiredCollateral,,) = sapience.quoteCreateTraderPosition(marketId, positionSize);
        // Send more collateral than required, just checking the position can be created/modified
        uint256 positionId = sapience.createTraderPosition(
            ISapienceStructs.TraderPositionCreateParams({
                marketId: marketId,
                size: positionSize,
                maxCollateral: requiredCollateral * 2,
                deadline: block.timestamp + 30 minutes
            })
        );
        vm.stopPrank();

        // Set expected state
        expectedStateData.userCollateral = latestStateData.userCollateral - requiredCollateral;
        expectedStateData.sapienceCollateral = latestStateData.sapienceCollateral + requiredCollateral;
        expectedStateData.depositedCollateralAmount = requiredCollateral;
        expectedStateData.positionSize = positionSize;
        expectedStateData.vQuoteAmount = 0;
        expectedStateData.vBaseAmount = uint256(positionSize);
        expectedStateData.borrowedVQuote = uint256(positionSize).mulDecimal(INITIAL_PRICE_PLUS_FEE_D18);
        expectedStateData.borrowedVBase = 0;

        // Check position makes sense
        latestStateData = assertPosition(trader1, positionId, expectedStateData, "Create Long");
    }

    function test_fuzz_create_Short(uint256 position) public {
        position = bound(position, 0.0000001 ether, 10 ether);

        StateData memory latestStateData;
        StateData memory expectedStateData;
        uint256 positionSizeMod = position;
        int256 positionSize = position.toInt() * -1;

        fillCollateralStateData(trader1, latestStateData);

        vm.startPrank(trader1);
        // quote and open a long
        (uint256 requiredCollateral,,) = sapience.quoteCreateTraderPosition(marketId, positionSize);
        // Send more collateral than required, just checking the position can be created/modified
        uint256 positionId = sapience.createTraderPosition(
            ISapienceStructs.TraderPositionCreateParams({
                marketId: marketId,
                size: positionSize,
                maxCollateral: requiredCollateral * 2,
                deadline: block.timestamp + 30 minutes
            })
        );
        vm.stopPrank();

        // Set expected state
        expectedStateData.userCollateral = latestStateData.userCollateral - requiredCollateral;
        expectedStateData.sapienceCollateral = latestStateData.sapienceCollateral + requiredCollateral;
        expectedStateData.depositedCollateralAmount = requiredCollateral;
        expectedStateData.positionSize = positionSize;
        expectedStateData.vQuoteAmount = positionSizeMod.mulDecimal(INITIAL_PRICE_MINUS_FEE_D18);
        expectedStateData.borrowedVBase = positionSizeMod;

        // Check position makes sense
        latestStateData = assertPosition(trader1, positionId, expectedStateData, "Create Short");
    }

    function test_fuzz_modify_Long2Long(uint256 startPosition, uint256 endPosition) public {
        vm.assume(startPosition < endPosition || startPosition > endPosition);

        startPosition = bound(startPosition, 0.000001 ether, 10 ether);
        endPosition = bound(endPosition, 0.00001 ether, 100 ether);

        StateData memory latestStateData;
        StateData memory expectedStateData;
        int256 initialPositionSize = startPosition.toInt();
        int256 positionSize = endPosition.toInt();

        int256 deltaPositionSize = positionSize - initialPositionSize;
        uint256 positionId;

        vm.startPrank(trader1);
        positionId = addTraderPosition(sapience, marketId, initialPositionSize);
        fillCollateralStateData(trader1, latestStateData);
        fillPositionState(positionId, latestStateData);

        // get actual trade price
        uint256 tradeRatio = _getTradeRatio(deltaPositionSize);

        // quote and open a long
        (int256 requiredDeltaCollateral, int256 closePnL,,) =
            sapience.quoteModifyTraderPosition(positionId, positionSize);

        if (requiredDeltaCollateral > 0) {
            collateralAsset.approve(address(sapience), requiredDeltaCollateral.toUint() + 2);
        }

        // Send more collateral than required, just checking the position can be created/modified
        sapience.modifyTraderPosition(
            ISapienceStructs.TraderPositionModifyParams({
                positionId: positionId,
                size: positionSize,
                deltaCollateralLimit: requiredDeltaCollateral,
                deadline: block.timestamp + 30 minutes
            })
        );
        vm.stopPrank();

        int256 requiredCollateral =
            latestStateData.depositedCollateralAmount.toInt() + requiredDeltaCollateral + closePnL;

        // Set expected state
        expectedStateData.userCollateral = (latestStateData.userCollateral.toInt() - requiredDeltaCollateral).toUint();
        expectedStateData.sapienceCollateral =
            (latestStateData.sapienceCollateral.toInt() + requiredDeltaCollateral).toUint();
        expectedStateData.depositedCollateralAmount = requiredCollateral.toUint();
        expectedStateData.positionSize = positionSize;
        expectedStateData.vQuoteAmount = 0;
        expectedStateData.vBaseAmount = uint256(positionSize);
        expectedStateData.borrowedVQuote = (endPosition.mulDecimal(tradeRatio));
        expectedStateData.borrowedVBase = 0;

        // Check position makes sense
        latestStateData = assertPosition(trader1, positionId, expectedStateData, "Long2Long");
    }

    function test_fuzz_modify_Short2Short(uint256 startPosition, uint256 endPosition) public {
        vm.assume(startPosition < endPosition || startPosition > endPosition);

        startPosition = bound(startPosition, 0.000001 ether, 10 ether);
        endPosition = bound(endPosition, 0.00001 ether, 100 ether);

        StateData memory latestStateData;
        StateData memory expectedStateData;
        int256 initialPositionSize = startPosition.toInt() * -1;
        int256 positionSize = endPosition.toInt() * -1;

        int256 deltaPositionSize = positionSize - initialPositionSize;

        uint256 positionId;

        vm.startPrank(trader1);
        positionId = addTraderPosition(sapience, marketId, initialPositionSize);

        fillCollateralStateData(trader1, latestStateData);
        fillPositionState(positionId, latestStateData);

        log_positionAccounting(sapience, positionId);

        // get actual trade price
        uint256 tradeRatio = _getTradeRatio(deltaPositionSize);

        // quote and open a long
        (int256 requiredDeltaCollateral, int256 closePnL,,) =
            sapience.quoteModifyTraderPosition(positionId, positionSize);

        if (requiredDeltaCollateral > 0) {
            collateralAsset.approve(address(sapience), requiredDeltaCollateral.toUint() + 2);
        }

        // Send more collateral than required, just checking the position can be created/modified
        sapience.modifyTraderPosition(
            ISapienceStructs.TraderPositionModifyParams({
                positionId: positionId,
                size: positionSize,
                deltaCollateralLimit: requiredDeltaCollateral,
                deadline: block.timestamp + 30 minutes
            })
        );

        vm.stopPrank();

        int256 requiredCollateral =
            latestStateData.depositedCollateralAmount.toInt() + requiredDeltaCollateral + closePnL;

        // Set expected state
        expectedStateData.userCollateral = (latestStateData.userCollateral.toInt() - requiredDeltaCollateral).toUint();
        expectedStateData.sapienceCollateral =
            (latestStateData.sapienceCollateral.toInt() + requiredDeltaCollateral).toUint();

        expectedStateData.depositedCollateralAmount = requiredCollateral.toUint();
        expectedStateData.positionSize = positionSize;

        expectedStateData.vQuoteAmount = (endPosition.mulDecimal(tradeRatio));
        expectedStateData.vBaseAmount = 0;
        expectedStateData.borrowedVQuote = 0;
        expectedStateData.borrowedVBase = uint256(positionSize * -1);

        // Check position makes sense
        latestStateData = assertPosition(trader1, positionId, expectedStateData, "Short2Short");
    }

    function test_fuzz_modify_Long2Short(uint256 startPosition, uint256 endPosition) public {
        vm.assume(startPosition < endPosition || startPosition > endPosition);

        startPosition = bound(startPosition, 0.000001 ether, 10 ether);
        endPosition = bound(endPosition, 0.00001 ether, 100 ether);

        StateData memory latestStateData;
        StateData memory expectedStateData;
        int256 initialPositionSize = startPosition.toInt();
        int256 positionSize = endPosition.toInt() * -1;

        int256 deltaPositionSize = positionSize - initialPositionSize;

        uint256 positionId;

        vm.startPrank(trader1);
        positionId = addTraderPosition(sapience, marketId, initialPositionSize);
        fillCollateralStateData(trader1, latestStateData);
        fillPositionState(positionId, latestStateData);

        // get actual trade price
        uint256 tradeRatio = _getTradeRatio(deltaPositionSize);

        // quote and open a long
        (int256 requiredDeltaCollateral, int256 closePnL,,) =
            sapience.quoteModifyTraderPosition(positionId, positionSize);

        if (requiredDeltaCollateral > 0) {
            collateralAsset.approve(address(sapience), requiredDeltaCollateral.toUint() + 2);
        }

        // Send more collateral than required, just checking the position can be created/modified
        sapience.modifyTraderPosition(
            ISapienceStructs.TraderPositionModifyParams({
                positionId: positionId,
                size: positionSize,
                deltaCollateralLimit: requiredDeltaCollateral + 2,
                deadline: block.timestamp + 30 minutes
            })
        );

        vm.stopPrank();

        int256 requiredCollateral =
            latestStateData.depositedCollateralAmount.toInt() + requiredDeltaCollateral + closePnL;

        // Set expected state
        expectedStateData.userCollateral = (latestStateData.userCollateral.toInt() - requiredDeltaCollateral).toUint();
        expectedStateData.sapienceCollateral =
            (latestStateData.sapienceCollateral.toInt() + requiredDeltaCollateral).toUint();
        expectedStateData.depositedCollateralAmount = requiredCollateral.toUint();
        expectedStateData.positionSize = positionSize;
        expectedStateData.vQuoteAmount = uint256(positionSize * -1).mulDecimal(tradeRatio);
        expectedStateData.vBaseAmount = 0;
        expectedStateData.borrowedVQuote = 0;
        expectedStateData.borrowedVBase = uint256(positionSize * -1);

        // Check position makes sense
        latestStateData = assertPosition(trader1, positionId, expectedStateData, "Long2Short");
    }

    function test_fuzz_modify_Short2Long(uint256 startPosition, uint256 endPosition) public {
        vm.assume(startPosition < endPosition || startPosition > endPosition);

        startPosition = bound(startPosition, 0.000001 ether, 10 ether);
        endPosition = bound(endPosition, 0.00001 ether, 100 ether);

        StateData memory latestStateData;
        StateData memory expectedStateData;
        int256 initialPositionSize = startPosition.toInt() * -1;
        int256 positionSize = endPosition.toInt();

        int256 deltaPositionSize = positionSize - initialPositionSize;

        uint256 positionId;

        vm.startPrank(trader1);
        positionId = addTraderPosition(sapience, marketId, initialPositionSize);
        fillCollateralStateData(trader1, latestStateData);
        fillPositionState(positionId, latestStateData);

        // get actual trade price
        uint256 tradeRatio = _getTradeRatio(deltaPositionSize);

        // quote and open a long
        (int256 requiredDeltaCollateral, int256 closePnL,,) =
            sapience.quoteModifyTraderPosition(positionId, positionSize);

        if (requiredDeltaCollateral > 0) {
            collateralAsset.approve(address(sapience), requiredDeltaCollateral.toUint() + 2);
        }

        // Send more collateral than required, just checking the position can be created/modified
        sapience.modifyTraderPosition(
            ISapienceStructs.TraderPositionModifyParams({
                positionId: positionId,
                size: positionSize,
                deltaCollateralLimit: requiredDeltaCollateral + 2,
                deadline: block.timestamp + 30 minutes
            })
        );

        vm.stopPrank();

        int256 requiredCollateral =
            latestStateData.depositedCollateralAmount.toInt() + requiredDeltaCollateral + closePnL;

        // Set expected state
        expectedStateData.userCollateral = (latestStateData.userCollateral.toInt() - requiredDeltaCollateral).toUint();
        expectedStateData.sapienceCollateral =
            (latestStateData.sapienceCollateral.toInt() + requiredDeltaCollateral).toUint();

        expectedStateData.depositedCollateralAmount = requiredCollateral.toUint();
        expectedStateData.positionSize = positionSize;
        expectedStateData.vQuoteAmount = 0;
        expectedStateData.vBaseAmount = uint256(positionSize);
        expectedStateData.borrowedVQuote = (endPosition.mulDecimal(tradeRatio));
        expectedStateData.borrowedVBase = 0;

        // Check position makes sense
        latestStateData = assertPosition(trader1, positionId, expectedStateData, "Short2Long");
    }

    function test_fuzz_close_Long(uint256 startPosition) public {
        startPosition = bound(startPosition, 0.0000001 ether, 10 ether);

        StateData memory latestStateData;
        StateData memory expectedStateData;
        int256 initialPositionSize = startPosition.toInt();

        uint256 positionId;

        vm.startPrank(trader1);
        positionId = addTraderPosition(sapience, marketId, initialPositionSize);
        fillCollateralStateData(trader1, latestStateData);
        fillPositionState(positionId, latestStateData);

        // quote and open a long
        (int256 requiredDeltaCollateral,,,) = sapience.quoteModifyTraderPosition(positionId, 0);

        if (requiredDeltaCollateral > 0) {
            collateralAsset.approve(address(sapience), requiredDeltaCollateral.toUint() + 2);
        }

        // Send more collateral than required, just checking the position can be created/modified
        sapience.modifyTraderPosition(
            ISapienceStructs.TraderPositionModifyParams({
                positionId: positionId,
                size: 0,
                deltaCollateralLimit: requiredDeltaCollateral + 2,
                deadline: block.timestamp + 30 minutes
            })
        );

        vm.stopPrank();

        int256 deltaCollateral = requiredDeltaCollateral - latestStateData.depositedCollateralAmount.toInt();

        // Set expected state
        expectedStateData.userCollateral = (latestStateData.userCollateral.toInt() - deltaCollateral).toUint();
        expectedStateData.sapienceCollateral = (latestStateData.sapienceCollateral.toInt() + deltaCollateral).toUint();

        expectedStateData.depositedCollateralAmount = 0;
        expectedStateData.positionSize = 0;
        expectedStateData.vQuoteAmount = 0;
        expectedStateData.vBaseAmount = 0;
        expectedStateData.borrowedVQuote = 0;
        expectedStateData.borrowedVBase = 0;

        // Check position makes sense
        latestStateData = assertPosition(trader1, positionId, expectedStateData, "Close Long");
    }

    function test_fuzz_close_Short(uint256 startPosition) public {
        startPosition = bound(startPosition, 0.0000001 ether, 10 ether);

        StateData memory latestStateData;
        StateData memory expectedStateData;
        int256 initialPositionSize = startPosition.toInt() * -1;

        uint256 positionId;

        vm.startPrank(trader1);
        positionId = addTraderPosition(sapience, marketId, initialPositionSize);
        fillCollateralStateData(trader1, latestStateData);
        fillPositionState(positionId, latestStateData);

        // quote and open a long
        (int256 requiredDeltaCollateral,,,) = sapience.quoteModifyTraderPosition(positionId, 0);

        if (requiredDeltaCollateral > 0) {
            collateralAsset.approve(address(sapience), requiredDeltaCollateral.toUint() + 2);
        }

        // Send more collateral than required, just checking the position can be created/modified
        sapience.modifyTraderPosition(
            ISapienceStructs.TraderPositionModifyParams({
                positionId: positionId,
                size: 0,
                deltaCollateralLimit: requiredDeltaCollateral + 2,
                deadline: block.timestamp + 30 minutes
            })
        );
        vm.stopPrank();

        int256 deltaCollateral = requiredDeltaCollateral;

        // Set expected state
        expectedStateData.userCollateral = (latestStateData.userCollateral.toInt() - deltaCollateral).toUint();
        expectedStateData.sapienceCollateral = (latestStateData.sapienceCollateral.toInt() + deltaCollateral).toUint();

        expectedStateData.depositedCollateralAmount = 0;
        expectedStateData.positionSize = 0;
        expectedStateData.vQuoteAmount = 0;
        expectedStateData.vBaseAmount = 0;
        expectedStateData.borrowedVQuote = 0;
        expectedStateData.borrowedVBase = 0;

        // Check position makes sense
        latestStateData = assertPosition(trader1, positionId, expectedStateData, "Close short");
    }

    function test_twoTradesVsOne_Skip(int256 initialSize, int256 targetSize) public {
        vm.assume(initialSize != targetSize);
        vm.assume(initialSize > 0 && targetSize > 0);

        uint256 traderInitialCollateral = collateralAsset.balanceOf(trader1);
        uint256 sapienceInitialCollateral = collateralAsset.balanceOf(address(sapience));
        // int256 initialPositionSize = 1 ether;
        // int256 targetPositionSize = 2 ether;
        int256 initialPositionSize = initialSize;
        int256 targetPositionSize = targetSize;

        vm.startPrank(trader1);

        // open a position
        uint256 positionId1 = addTraderPosition(sapience, marketId, initialPositionSize);
        vm.stopPrank();

        uint256 snapshotId = vm.snapshot();
        vm.startPrank(trader1);
        // update it
        modifyTraderPosition(sapience, positionId1, targetPositionSize);
        // close the position
        closerTraderPosition(sapience, positionId1);
        // check trader and sapience collateral afterwards
        uint256 traderFinalCollateralOpt1 = collateralAsset.balanceOf(trader1);
        uint256 sapienceFinalCollateralOpt1 = collateralAsset.balanceOf(address(sapience));

        int256 traderPnLOpt1 = traderFinalCollateralOpt1.toInt() - traderInitialCollateral.toInt();
        int256 sapiencePnLOpt1 = sapienceFinalCollateralOpt1.toInt() - sapienceInitialCollateral.toInt();

        // vs

        vm.revertTo(snapshotId);
        // close the position and open a new one with the same target position size
        closerTraderPosition(sapience, positionId1);

        uint256 positionId3 = addTraderPosition(sapience, marketId, targetPositionSize);

        closerTraderPosition(sapience, positionId3);
        uint256 traderFinalCollateralOpt2 = collateralAsset.balanceOf(trader1);
        uint256 sapienceFinalCollateralOpt2 = collateralAsset.balanceOf(address(sapience));
        int256 traderPnLOpt2 = traderFinalCollateralOpt2.toInt() - traderInitialCollateral.toInt();
        int256 sapiencePnLOpt2 = sapienceFinalCollateralOpt2.toInt() - sapienceInitialCollateral.toInt();
        vm.stopPrank();

        console2.log("Opt1 Trader PnL: ", traderPnLOpt1);
        console2.log("Opt1 Sapience PnL  : ", sapiencePnLOpt1);
        console2.log("Opt2 Trader PnL: ", traderPnLOpt2);
        console2.log("Opt2 Sapience PnL  : ", sapiencePnLOpt2);

        assertLe(traderPnLOpt2, traderPnLOpt1);
        assertGe(sapiencePnLOpt2, sapiencePnLOpt1);
    }

    // //////////////// //
    // Helper functions //
    // //////////////// //

    function fillPositionState(uint256 positionId, StateData memory stateData) public {
        Position.Data memory position = sapience.getPosition(positionId);
        stateData.depositedCollateralAmount = position.depositedCollateralAmount;
        stateData.vQuoteAmount = position.vQuoteAmount;
        stateData.vBaseAmount = position.vBaseAmount;
        stateData.borrowedVQuote = position.borrowedVQuote;
        stateData.borrowedVBase = position.borrowedVBase;
        stateData.positionSize = sapience.getPositionSize(positionId);
    }

    function fillCollateralStateData(address user, StateData memory stateData) public view {
        stateData.userCollateral = collateralAsset.balanceOf(user);
        stateData.sapienceCollateral = collateralAsset.balanceOf(address(sapience));
    }

    function assertPosition(address user, uint256 positionId, StateData memory expectedStateData, string memory stage)
        public
        returns (StateData memory currentStateData)
    {
        fillCollateralStateData(user, currentStateData);
        fillPositionState(positionId, currentStateData);

        assertApproxEqRel(
            currentStateData.userCollateral,
            expectedStateData.userCollateral,
            0.000015 ether,
            string.concat(stage, " userCollateral")
        );
        assertApproxEqRel(
            currentStateData.sapienceCollateral,
            expectedStateData.sapienceCollateral,
            0.000015 ether,
            string.concat(stage, " sapienceCollateral")
        );
        assertApproxEqRel(
            currentStateData.depositedCollateralAmount,
            expectedStateData.depositedCollateralAmount,
            0.0005 ether,
            string.concat(stage, " depositedCollateralAmount")
        );
        assertEq(currentStateData.positionSize, expectedStateData.positionSize, string.concat(stage, " positionSize"));
        assertEq(currentStateData.vBaseAmount, expectedStateData.vBaseAmount, string.concat(stage, " vBaseAmount"));
        assertApproxEqRel(
            currentStateData.borrowedVBase,
            expectedStateData.borrowedVBase,
            0.001 ether,
            string.concat(stage, " borrowedVBase")
        );
        assertApproxEqAbs(
            currentStateData.vQuoteAmount,
            expectedStateData.vQuoteAmount,
            0.00025 ether,
            string.concat(stage, " vQuoteAmount")
        );
        assertApproxEqRel(
            currentStateData.borrowedVQuote,
            expectedStateData.borrowedVQuote,
            0.00025 ether,
            string.concat(stage, " borrowedVQuote")
        );
    }

    function _getTradeRatio(int256 deltaPositionSize) public returns (uint256 tradeRatio) {
        // get actual trade price
        if (deltaPositionSize > 0) {
            IQuoterV2.QuoteExactOutputSingleParams memory params = IQuoterV2.QuoteExactOutputSingleParams({
                tokenIn: tokenA,
                tokenOut: tokenB,
                amount: deltaPositionSize.toUint(),
                fee: uniCastedPool.fee(),
                sqrtPriceLimitX96: 0
            });
            (uint256 amountIn,,,) = uniswapQuoterV2.quoteExactOutputSingle(params);

            tradeRatio = amountIn.divDecimal(deltaPositionSize.toUint());
        } else {
            IQuoterV2.QuoteExactInputSingleParams memory params = IQuoterV2.QuoteExactInputSingleParams({
                tokenIn: tokenB,
                tokenOut: tokenA,
                amountIn: (deltaPositionSize * -1).toUint(),
                fee: uniCastedPool.fee(),
                sqrtPriceLimitX96: 0
            });
            (uint256 amountIn,,,) = uniswapQuoterV2.quoteExactInputSingle(params);

            tradeRatio = amountIn.divDecimal((deltaPositionSize * -1).toUint());
        }
    }
}
