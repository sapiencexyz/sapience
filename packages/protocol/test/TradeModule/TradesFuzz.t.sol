// SPDX-License-Identifier: MIT
pragma solidity >=0.8.2 <0.9.0;

import "forge-std/Test.sol";
import "cannon-std/Cannon.sol";
import {IFoil} from "../../src/market/interfaces/IFoil.sol";
import {IMintableToken} from "../../src/market/external/IMintableToken.sol";
import {TickMath} from "../../src/market/external/univ3/TickMath.sol";
import {TestTrade} from "../helpers/TestTrade.sol";
import {TestEpoch} from "../helpers/TestEpoch.sol";
import {TestUser} from "../helpers/TestUser.sol";
import {DecimalPrice} from "../../src/market/libraries/DecimalPrice.sol";
import {SafeCastI256, SafeCastU256} from "@synthetixio/core-contracts/contracts/utils/SafeCast.sol";
import {Position} from "../../src/market/storage/Position.sol";

import "@synthetixio/core-contracts/contracts/utils/DecimalMath.sol";
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
        uint256 foilCollateral;
        uint256 borrowedVEth;
        uint256 borrowedVGas;
        uint256 vEthAmount;
        uint256 vGasAmount;
        int256 positionSize;
        uint256 depositedCollateralAmount;
    }

    IFoil foil;
    IMintableToken collateralAsset;

    address lp1;
    address trader1;
    uint256 epochId;
    address pool;
    address tokenA;
    address tokenB;
    IUniswapV3Pool uniCastedPool;
    IQuoterV2 uniswapQuoterV2;
    uint256 feeRate;
    int24 EPOCH_LOWER_TICK = 16000; //5 (4.952636224061651)
    int24 EPOCH_UPPER_TICK = 29800; //20 (19.68488357413147)
    int24 LP_LOWER_TICK = 23000; // (9.973035566235849)
    int24 LP_UPPER_TICK = 23200; // (10.174494074987374)
    uint256 COLLATERAL_FOR_ORDERS = 10 ether;
    uint160 INITIAL_PRICE_SQRT = 250541448375047931186413801569; // 10 (9999999999999999999)
    uint256 INITIAL_PRICE_D18 = 10 ether;
    uint256 INITIAL_PRICE_PLUS_FEE_D18 = 10.1 ether;
    uint256 INITIAL_PRICE_MINUS_FEE_D18 = 9.9 ether;
    uint256 PLUS_FEE_MULTIPLIER_D18 = 1.01 ether;
    uint256 MINUS_FEE_MULTIPLIER_D18 = 0.99 ether;
    uint256 constant MIN_TRADE_SIZE = 10_000; // 10,000 vGas

    function setUp() public {
        collateralAsset = IMintableToken(
            vm.getAddress("CollateralAsset.Token")
        );

        uint160 startingSqrtPriceX96 = INITIAL_PRICE_SQRT;

        (foil, ) = createEpoch(
            EPOCH_LOWER_TICK,
            EPOCH_UPPER_TICK,
            startingSqrtPriceX96,MIN_TRADE_SIZE
        );

        lp1 = TestUser.createUser("LP1", 10_000_000_000 ether);
        trader1 = TestUser.createUser("Trader1", 10_000_000 ether);

        (epochId, , , pool, tokenA, tokenB, , , , , ) = foil.getLatestEpoch();

        uniCastedPool = IUniswapV3Pool(pool);
        feeRate = uint256(uniCastedPool.fee()) * 1e12;

        uniswapQuoterV2 = IQuoterV2(vm.getAddress("Uniswap.QuoterV2"));

        // Add liquidity
        vm.startPrank(lp1);
        addLiquidity(
            foil,
            pool,
            epochId,
            COLLATERAL_FOR_ORDERS * 10_000_000,
            LP_LOWER_TICK,
            LP_UPPER_TICK
        ); // enough to keep price stable (no slippage)
        vm.stopPrank();
    }

    function test_fuzz_create_Long(uint256 position) public {
        position = bound(position, .0000001 ether, 10 ether);

        StateData memory latestStateData;
        StateData memory expectedStateData;
        int256 positionSize = position.toInt();

        fillCollateralStateData(trader1, latestStateData);

        vm.startPrank(trader1);
        // quote and open a long
        (uint256 requiredCollateral, ) = foil.quoteCreateTraderPosition(
            epochId,
            positionSize
        );
        // Send more collateral than required, just checking the position can be created/modified
        uint256 positionId = foil.createTraderPosition(
            epochId,
            positionSize,
            requiredCollateral * 2,
            block.timestamp + 30 minutes
        );
        vm.stopPrank();

        // Set expected state
        expectedStateData.userCollateral =
            latestStateData.userCollateral -
            requiredCollateral;
        expectedStateData.foilCollateral =
            latestStateData.foilCollateral +
            requiredCollateral;
        expectedStateData.depositedCollateralAmount = requiredCollateral;
        expectedStateData.positionSize = positionSize;
        expectedStateData.vEthAmount = 0;
        expectedStateData.vGasAmount = uint256(positionSize);
        expectedStateData.borrowedVEth = uint256(positionSize).mulDecimal(
            INITIAL_PRICE_PLUS_FEE_D18
        );
        expectedStateData.borrowedVGas = 0;

        // Check position makes sense
        latestStateData = assertPosition(
            trader1,
            positionId,
            expectedStateData,
            "Create Long"
        );
    }

    function test_fuzz_create_Short(uint256 position) public {
        position = bound(position, .0000001 ether, 10 ether);

        StateData memory latestStateData;
        StateData memory expectedStateData;
        uint256 positionSizeMod = position;
        int256 positionSize = position.toInt() * -1;

        fillCollateralStateData(trader1, latestStateData);

        vm.startPrank(trader1);
        // quote and open a long
        (uint256 requiredCollateral, ) = foil.quoteCreateTraderPosition(
            epochId,
            positionSize
        );
        // Send more collateral than required, just checking the position can be created/modified
        uint256 positionId = foil.createTraderPosition(
            epochId,
            positionSize,
            requiredCollateral * 2,
            block.timestamp + 30 minutes
        );
        vm.stopPrank();

        // Set expected state
        expectedStateData.userCollateral =
            latestStateData.userCollateral -
            requiredCollateral;
        expectedStateData.foilCollateral =
            latestStateData.foilCollateral +
            requiredCollateral;
        expectedStateData.depositedCollateralAmount = requiredCollateral;
        expectedStateData.positionSize = positionSize;
        expectedStateData.vEthAmount = positionSizeMod.mulDecimal(
            INITIAL_PRICE_MINUS_FEE_D18
        );
        expectedStateData.borrowedVGas = positionSizeMod;

        // Check position makes sense
        latestStateData = assertPosition(
            trader1,
            positionId,
            expectedStateData,
            "Create Short"
        );
    }

    function test_fuzz_modify_Long2Long(
        uint256 startPosition,
        uint256 endPosition
    ) public {
        vm.assume(startPosition < endPosition || startPosition > endPosition);

        startPosition = bound(startPosition, .000001 ether, 10 ether);
        endPosition = bound(endPosition, .00001 ether, 100 ether);

        StateData memory latestStateData;
        StateData memory expectedStateData;
        int256 initialPositionSize = startPosition.toInt();
        int256 positionSize = endPosition.toInt();

        int256 deltaPositionSize = positionSize - initialPositionSize;
        uint256 positionId;

        vm.startPrank(trader1);
        positionId = addTraderPosition(foil, epochId, initialPositionSize);
        fillCollateralStateData(trader1, latestStateData);
        fillPositionState(positionId, latestStateData);

        // get actual trade price
        uint256 tradeRatio = _getTradeRatio(deltaPositionSize);

        // quote and open a long
        (int256 requiredDeltaCollateral, int256 closePnL, ) = foil
            .quoteModifyTraderPosition(positionId, positionSize);

        if (requiredDeltaCollateral > 0) {
            collateralAsset.approve(
                address(foil),
                requiredDeltaCollateral.toUint() + 2
            );
        }

        // Send more collateral than required, just checking the position can be created/modified
        foil.modifyTraderPosition(
            positionId,
            positionSize,
            requiredDeltaCollateral,
            block.timestamp + 30 minutes
        );
        vm.stopPrank();

        int256 requiredCollateral = latestStateData
            .depositedCollateralAmount
            .toInt() +
            requiredDeltaCollateral +
            closePnL;

        // Set expected state
        expectedStateData.userCollateral = (latestStateData
            .userCollateral
            .toInt() - requiredDeltaCollateral).toUint();
        expectedStateData.foilCollateral = (latestStateData
            .foilCollateral
            .toInt() + requiredDeltaCollateral).toUint();
        expectedStateData.depositedCollateralAmount = requiredCollateral
            .toUint();
        expectedStateData.positionSize = positionSize;
        expectedStateData.vEthAmount = 0;
        expectedStateData.vGasAmount = uint256(positionSize);
        expectedStateData.borrowedVEth = (endPosition.mulDecimal(tradeRatio));
        expectedStateData.borrowedVGas = 0;

        // Check position makes sense
        latestStateData = assertPosition(
            trader1,
            positionId,
            expectedStateData,
            "Long2Long"
        );
    }

    function test_fuzz_modify_Short2Short(
        uint256 startPosition,
        uint256 endPosition
    ) public {
        vm.assume(startPosition < endPosition || startPosition > endPosition);

        startPosition = bound(startPosition, .000001 ether, 10 ether);
        endPosition = bound(endPosition, .00001 ether, 100 ether);

        StateData memory latestStateData;
        StateData memory expectedStateData;
        int256 initialPositionSize = startPosition.toInt() * -1;
        int256 positionSize = endPosition.toInt() * -1;

        int256 deltaPositionSize = positionSize - initialPositionSize;

        uint256 positionId;

        vm.startPrank(trader1);
        positionId = addTraderPosition(foil, epochId, initialPositionSize);

        fillCollateralStateData(trader1, latestStateData);
        fillPositionState(positionId, latestStateData);

        log_positionAccounting(foil, positionId);

        // get actual trade price
        uint256 tradeRatio = _getTradeRatio(deltaPositionSize);

        // quote and open a long
        (int256 requiredDeltaCollateral, int256 closePnL, ) = foil
            .quoteModifyTraderPosition(positionId, positionSize);

        if (requiredDeltaCollateral > 0) {
            collateralAsset.approve(
                address(foil),
                requiredDeltaCollateral.toUint() + 2
            );
        }

        // Send more collateral than required, just checking the position can be created/modified
        foil.modifyTraderPosition(
            positionId,
            positionSize,
            requiredDeltaCollateral,
            block.timestamp + 30 minutes
        );

        vm.stopPrank();

        int256 requiredCollateral = latestStateData
            .depositedCollateralAmount
            .toInt() +
            requiredDeltaCollateral +
            closePnL;

        // Set expected state
        expectedStateData.userCollateral = (latestStateData
            .userCollateral
            .toInt() - requiredDeltaCollateral).toUint();
        expectedStateData.foilCollateral = (latestStateData
            .foilCollateral
            .toInt() + requiredDeltaCollateral).toUint();

        expectedStateData.depositedCollateralAmount = requiredCollateral
            .toUint();
        expectedStateData.positionSize = positionSize;

        expectedStateData.vEthAmount = (endPosition.mulDecimal(tradeRatio));
        expectedStateData.vGasAmount = 0;
        expectedStateData.borrowedVEth = 0;
        expectedStateData.borrowedVGas = uint256(positionSize * -1);

        // Check position makes sense
        latestStateData = assertPosition(
            trader1,
            positionId,
            expectedStateData,
            "Short2Short"
        );
    }

    function test_fuzz_modify_Long2Short(
        uint256 startPosition,
        uint256 endPosition
    ) public {
        vm.assume(startPosition < endPosition || startPosition > endPosition);

        startPosition = bound(startPosition, .000001 ether, 10 ether);
        endPosition = bound(endPosition, .00001 ether, 100 ether);

        StateData memory latestStateData;
        StateData memory expectedStateData;
        int256 initialPositionSize = startPosition.toInt();
        int256 positionSize = endPosition.toInt() * -1;

        int256 deltaPositionSize = positionSize - initialPositionSize;

        uint256 positionId;

        vm.startPrank(trader1);
        positionId = addTraderPosition(foil, epochId, initialPositionSize);
        fillCollateralStateData(trader1, latestStateData);
        fillPositionState(positionId, latestStateData);

        // get actual trade price
        uint256 tradeRatio = _getTradeRatio(deltaPositionSize);

        // quote and open a long
        (int256 requiredDeltaCollateral, int256 closePnL, ) = foil
            .quoteModifyTraderPosition(positionId, positionSize);

        if (requiredDeltaCollateral > 0) {
            collateralAsset.approve(
                address(foil),
                requiredDeltaCollateral.toUint() + 2
            );
        }

        // Send more collateral than required, just checking the position can be created/modified
        foil.modifyTraderPosition(
            positionId,
            positionSize,
            requiredDeltaCollateral + 2,
            block.timestamp + 30 minutes
        );

        vm.stopPrank();

        int256 requiredCollateral = latestStateData
            .depositedCollateralAmount
            .toInt() +
            requiredDeltaCollateral +
            closePnL;

        // Set expected state
        expectedStateData.userCollateral = (latestStateData
            .userCollateral
            .toInt() - requiredDeltaCollateral).toUint();
        expectedStateData.foilCollateral = (latestStateData
            .foilCollateral
            .toInt() + requiredDeltaCollateral).toUint();
        expectedStateData.depositedCollateralAmount = requiredCollateral
            .toUint();
        expectedStateData.positionSize = positionSize;
        expectedStateData.vEthAmount = uint256(positionSize * -1).mulDecimal(
            tradeRatio
        );
        expectedStateData.vGasAmount = 0;
        expectedStateData.borrowedVEth = 0;
        expectedStateData.borrowedVGas = uint256(positionSize * -1);

        // Check position makes sense
        latestStateData = assertPosition(
            trader1,
            positionId,
            expectedStateData,
            "Long2Short"
        );
    }

    function test_fuzz_modify_Short2Long(
        uint256 startPosition,
        uint256 endPosition
    ) public {
        vm.assume(startPosition < endPosition || startPosition > endPosition);

        startPosition = bound(startPosition, .000001 ether, 10 ether);
        endPosition = bound(endPosition, .00001 ether, 100 ether);

        StateData memory latestStateData;
        StateData memory expectedStateData;
        int256 initialPositionSize = startPosition.toInt() * -1;
        int256 positionSize = endPosition.toInt();

        int256 deltaPositionSize = positionSize - initialPositionSize;

        uint256 positionId;

        vm.startPrank(trader1);
        positionId = addTraderPosition(foil, epochId, initialPositionSize);
        fillCollateralStateData(trader1, latestStateData);
        fillPositionState(positionId, latestStateData);

        // get actual trade price
        uint256 tradeRatio = _getTradeRatio(deltaPositionSize);

        // quote and open a long
        (int256 requiredDeltaCollateral, int256 closePnL, ) = foil
            .quoteModifyTraderPosition(positionId, positionSize);

        if (requiredDeltaCollateral > 0) {
            collateralAsset.approve(
                address(foil),
                requiredDeltaCollateral.toUint() + 2
            );
        }

        // Send more collateral than required, just checking the position can be created/modified
        foil.modifyTraderPosition(
            positionId,
            positionSize,
            requiredDeltaCollateral + 2,
            block.timestamp + 30 minutes
        );

        vm.stopPrank();

        int256 requiredCollateral = latestStateData
            .depositedCollateralAmount
            .toInt() +
            requiredDeltaCollateral +
            closePnL;

        // Set expected state
        expectedStateData.userCollateral = (latestStateData
            .userCollateral
            .toInt() - requiredDeltaCollateral).toUint();
        expectedStateData.foilCollateral = (latestStateData
            .foilCollateral
            .toInt() + requiredDeltaCollateral).toUint();

        expectedStateData.depositedCollateralAmount = requiredCollateral
            .toUint();
        expectedStateData.positionSize = positionSize;
        expectedStateData.vEthAmount = 0;
        expectedStateData.vGasAmount = uint256(positionSize);
        expectedStateData.borrowedVEth = (endPosition.mulDecimal(tradeRatio));
        expectedStateData.borrowedVGas = 0;

        // Check position makes sense
        latestStateData = assertPosition(
            trader1,
            positionId,
            expectedStateData,
            "Short2Long"
        );
    }

    function test_fuzz_close_Long(uint256 startPosition) public {
        startPosition = bound(startPosition, .0000001 ether, 10 ether);

        StateData memory latestStateData;
        StateData memory expectedStateData;
        int256 initialPositionSize = startPosition.toInt();

        uint256 positionId;

        vm.startPrank(trader1);
        positionId = addTraderPosition(foil, epochId, initialPositionSize);
        fillCollateralStateData(trader1, latestStateData);
        fillPositionState(positionId, latestStateData);

        // quote and open a long
        (int256 requiredDeltaCollateral, , ) = foil.quoteModifyTraderPosition(
            positionId,
            0
        );

        if (requiredDeltaCollateral > 0) {
            collateralAsset.approve(
                address(foil),
                requiredDeltaCollateral.toUint() + 2
            );
        }

        // Send more collateral than required, just checking the position can be created/modified
        foil.modifyTraderPosition(
            positionId,
            0,
            requiredDeltaCollateral + 2,
            block.timestamp + 30 minutes
        );

        vm.stopPrank();

        int256 deltaCollateral = requiredDeltaCollateral -
            latestStateData.depositedCollateralAmount.toInt();

        // Set expected state
        expectedStateData.userCollateral = (latestStateData
            .userCollateral
            .toInt() - deltaCollateral).toUint();
        expectedStateData.foilCollateral = (latestStateData
            .foilCollateral
            .toInt() + deltaCollateral).toUint();

        expectedStateData.depositedCollateralAmount = 0;
        expectedStateData.positionSize = 0;
        expectedStateData.vEthAmount = 0;
        expectedStateData.vGasAmount = 0;
        expectedStateData.borrowedVEth = 0;
        expectedStateData.borrowedVGas = 0;

        // Check position makes sense
        latestStateData = assertPosition(
            trader1,
            positionId,
            expectedStateData,
            "Close Long"
        );
    }

    function test_fuzz_close_Short(uint256 startPosition) public {
        startPosition = bound(startPosition, .0000001 ether, 10 ether);

        StateData memory latestStateData;
        StateData memory expectedStateData;
        int256 initialPositionSize = startPosition.toInt() * -1;

        uint256 positionId;

        vm.startPrank(trader1);
        positionId = addTraderPosition(foil, epochId, initialPositionSize);
        fillCollateralStateData(trader1, latestStateData);
        fillPositionState(positionId, latestStateData);

        // quote and open a long
        (int256 requiredDeltaCollateral, , ) = foil.quoteModifyTraderPosition(
            positionId,
            0
        );

        if (requiredDeltaCollateral > 0) {
            collateralAsset.approve(
                address(foil),
                requiredDeltaCollateral.toUint() + 2
            );
        }

        // Send more collateral than required, just checking the position can be created/modified
        foil.modifyTraderPosition(
            positionId,
            0,
            requiredDeltaCollateral + 2,
            block.timestamp + 30 minutes
        );
        vm.stopPrank();

        int256 deltaCollateral = requiredDeltaCollateral;

        // Set expected state
        expectedStateData.userCollateral = (latestStateData
            .userCollateral
            .toInt() - deltaCollateral).toUint();
        expectedStateData.foilCollateral = (latestStateData
            .foilCollateral
            .toInt() + deltaCollateral).toUint();

        expectedStateData.depositedCollateralAmount = 0;
        expectedStateData.positionSize = 0;
        expectedStateData.vEthAmount = 0;
        expectedStateData.vGasAmount = 0;
        expectedStateData.borrowedVEth = 0;
        expectedStateData.borrowedVGas = 0;

        // Check position makes sense
        latestStateData = assertPosition(
            trader1,
            positionId,
            expectedStateData,
            "Close short"
        );
    }

    function test_twoTradesVsOne_Skip(
        int256 initialSize,
        int256 targetSize
    ) public {
        vm.assume(initialSize != targetSize);
        vm.assume(initialSize > 0 && targetSize > 0);

        uint256 traderInitialCollateral = collateralAsset.balanceOf(trader1);
        uint256 foilInitialCollateral = collateralAsset.balanceOf(
            address(foil)
        );
        // int256 initialPositionSize = 1 ether;
        // int256 targetPositionSize = 2 ether;
        int256 initialPositionSize = initialSize;
        int256 targetPositionSize = targetSize;

        vm.startPrank(trader1);

        // open a position
        uint256 positionId1 = addTraderPosition(
            foil,
            epochId,
            initialPositionSize
        );
        vm.stopPrank();

        uint256 snapshotId = vm.snapshot();
        vm.startPrank(trader1);
        // update it
        modifyTraderPosition(foil, positionId1, targetPositionSize);
        // close the position
        closerTraderPosition(foil, positionId1);
        // check trader and foil collateral afterwards
        uint256 traderFinalCollateralOpt1 = collateralAsset.balanceOf(trader1);
        uint256 foilFinalCollateralOpt1 = collateralAsset.balanceOf(
            address(foil)
        );

        int256 traderPnLOpt1 = traderFinalCollateralOpt1.toInt() -
            traderInitialCollateral.toInt();
        int256 foilPnLOpt1 = foilFinalCollateralOpt1.toInt() -
            foilInitialCollateral.toInt();

        // vs

        vm.revertTo(snapshotId);
        // close the position and open a new one with the same target position size
        closerTraderPosition(foil, positionId1);

        uint256 positionId3 = addTraderPosition(
            foil,
            epochId,
            targetPositionSize
        );

        closerTraderPosition(foil, positionId3);
        uint256 traderFinalCollateralOpt2 = collateralAsset.balanceOf(trader1);
        uint256 foilFinalCollateralOpt2 = collateralAsset.balanceOf(
            address(foil)
        );
        int256 traderPnLOpt2 = traderFinalCollateralOpt2.toInt() -
            traderInitialCollateral.toInt();
        int256 foilPnLOpt2 = foilFinalCollateralOpt2.toInt() -
            foilInitialCollateral.toInt();
        vm.stopPrank();

        console2.log("Opt1 Trader PnL: ", traderPnLOpt1);
        console2.log("Opt1 Foil PnL  : ", foilPnLOpt1);
        console2.log("Opt2 Trader PnL: ", traderPnLOpt2);
        console2.log("Opt2 Foil PnL  : ", foilPnLOpt2);

        assertLe(traderPnLOpt2, traderPnLOpt1);
        assertGe(foilPnLOpt2, foilPnLOpt1);
    }

    // //////////////// //
    // Helper functions //
    // //////////////// //

    function fillPositionState(
        uint256 positionId,
        StateData memory stateData
    ) public {
        Position.Data memory position = foil.getPosition(positionId);
        stateData.depositedCollateralAmount = position
            .depositedCollateralAmount;
        stateData.vEthAmount = position.vEthAmount;
        stateData.vGasAmount = position.vGasAmount;
        stateData.borrowedVEth = position.borrowedVEth;
        stateData.borrowedVGas = position.borrowedVGas;
        stateData.positionSize = foil.getPositionSize(positionId);
    }

    function fillCollateralStateData(
        address user,
        StateData memory stateData
    ) public view {
        stateData.userCollateral = collateralAsset.balanceOf(user);
        stateData.foilCollateral = collateralAsset.balanceOf(address(foil));
    }

    function assertPosition(
        address user,
        uint256 positionId,
        StateData memory expectedStateData,
        string memory stage
    ) public returns (StateData memory currentStateData) {
        fillCollateralStateData(user, currentStateData);
        fillPositionState(positionId, currentStateData);

        assertApproxEqRel(
            currentStateData.userCollateral,
            expectedStateData.userCollateral,
            0.000015 ether,
            string.concat(stage, " userCollateral")
        );
        assertApproxEqRel(
            currentStateData.foilCollateral,
            expectedStateData.foilCollateral,
            0.000015 ether,
            string.concat(stage, " foilCollateral")
        );
        assertApproxEqRel(
            currentStateData.depositedCollateralAmount,
            expectedStateData.depositedCollateralAmount,
            0.0005 ether,
            string.concat(stage, " depositedCollateralAmount")
        );
        assertEq(
            currentStateData.positionSize,
            expectedStateData.positionSize,
            string.concat(stage, " positionSize")
        );
        assertEq(
            currentStateData.vGasAmount,
            expectedStateData.vGasAmount,
            string.concat(stage, " vGasAmount")
        );
        assertApproxEqRel(
            currentStateData.borrowedVGas,
            expectedStateData.borrowedVGas,
            0.001 ether,
            string.concat(stage, " borrowedVGas")
        );
        assertApproxEqAbs(
            currentStateData.vEthAmount,
            expectedStateData.vEthAmount,
            0.00025 ether,
            string.concat(stage, " vEthAmount")
        );
        assertApproxEqRel(
            currentStateData.borrowedVEth,
            expectedStateData.borrowedVEth,
            0.00025 ether,
            string.concat(stage, " borrowedVEth")
        );
    }

    function _getTradeRatio(
        int256 deltaPositionSize
    ) public returns (uint256 tradeRatio) {
        // get actual trade price
        if (deltaPositionSize > 0) {
            IQuoterV2.QuoteExactOutputSingleParams memory params = IQuoterV2
                .QuoteExactOutputSingleParams({
                    tokenIn: tokenA,
                    tokenOut: tokenB,
                    amount: deltaPositionSize.toUint(),
                    fee: uniCastedPool.fee(),
                    sqrtPriceLimitX96: 0
                });
            (uint256 amountIn, , , ) = uniswapQuoterV2.quoteExactOutputSingle(
                params
            );

            tradeRatio = amountIn.divDecimal(deltaPositionSize.toUint());
        } else {
            IQuoterV2.QuoteExactInputSingleParams memory params = IQuoterV2
                .QuoteExactInputSingleParams({
                    tokenIn: tokenB,
                    tokenOut: tokenA,
                    amountIn: (deltaPositionSize * -1).toUint(),
                    fee: uniCastedPool.fee(),
                    sqrtPriceLimitX96: 0
                });
            (uint256 amountIn, , , ) = uniswapQuoterV2.quoteExactInputSingle(
                params
            );

            tradeRatio = amountIn.divDecimal((deltaPositionSize * -1).toUint());
        }
    }
}
