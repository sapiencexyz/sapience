// SPDX-License-Identifier: MIT
pragma solidity >=0.8.2 <0.9.0;

import "forge-std/Test.sol";
import "cannon-std/Cannon.sol";
import {IFoil} from "../../src/contracts/interfaces/IFoil.sol";
import {IMintableToken} from "../../src/contracts/external/IMintableToken.sol";
import {TickMath} from "../../src/contracts/external/univ3/TickMath.sol";
import {TestTrade} from "../helpers/TestTrade.sol";
import {TestEpoch} from "../helpers/TestEpoch.sol";
import {TestUser} from "../helpers/TestUser.sol";
import {DecimalPrice} from "../../src/contracts/libraries/DecimalPrice.sol";
import "@synthetixio/core-contracts/contracts/utils/DecimalMath.sol";
import "@uniswap/v3-core/contracts/interfaces/IUniswapV3Pool.sol";

import "forge-std/console2.sol";

contract TradePositionBasic is TestTrade {
    using Cannon for Vm;
    using DecimalMath for uint256;

    IFoil foil;
    IMintableToken collateralAsset;

    address lp1;
    address trader1;
    uint256 epochId;
    address pool;
    address tokenA;
    address tokenB;
    IUniswapV3Pool uniCastedPool;
    uint256 feeRate;
    int24 LOWERTICK = 12200;
    int24 UPPERTICK = 12400;

    function setUp() public {
        collateralAsset = IMintableToken(
            vm.getAddress("CollateralAsset.Token")
        );

        uint160 startingSqrtPriceX96 = 146497135921788803112962621440; // 3.419
        (foil, ) = createEpoch(5200, 28200, startingSqrtPriceX96);

        lp1 = TestUser.createUser("LP1", 10_000_000 ether);
        trader1 = TestUser.createUser("Trader1", 10_000_000 ether);

        (epochId, , , pool, tokenA, tokenB, , , , , ) = foil.getLatestEpoch();

        uniCastedPool = IUniswapV3Pool(pool);
        feeRate = uint256(uniCastedPool.fee()) * 1e12;
    }

    function test_tradeWildJake_Skip() public {
        uint256 positionId;
        vm.startPrank(lp1);

        addLiquidity(foil, pool, epochId, 0.004 ether, 5200, 28200);
        addLiquidity(foil, pool, epochId, 0.003 ether, 5200, 28200);
        vm.stopPrank();

        vm.startPrank(trader1);
        // Set position size
        uint256 liq = IUniswapV3Pool(pool).liquidity();
        liq;

        positionId = foil.createTraderPosition(
            // Create Long position (with enough collateral)
            epochId,
            4934123598537506,
            438725000000000,
            434337750000000
        );

        console2.log(" >>> Position", positionId);
        logPositionAndAccount(foil, positionId);
        vm.stopPrank();
    }

    function test_tradeLong() public {
        uint256 referencePrice;
        uint256 positionId;
        uint256 collateralForOrder = 10 ether;
        int256 positionSize;
        uint256 tokens;
        uint256 fee;
        uint256 accumulatedFee;

        StateData memory expectedStateData;
        StateData memory currentStateData;

        vm.startPrank(lp1);
        addLiquidity(
            foil,
            pool,
            epochId,
            collateralForOrder * 100_000,
            LOWERTICK,
            UPPERTICK
        ); // enough to keep price stable (no slippage)
        vm.stopPrank();

        vm.startPrank(trader1);

        // Set position size
        positionSize = int256(collateralForOrder / 100);

        fillCollateralStateData(
            trader1,
            foil,
            collateralAsset,
            currentStateData
        );

        referencePrice = foil.getReferencePrice(epochId);
        tokens = uint256(positionSize).mulDecimal(referencePrice);
        fee = tokens.mulDecimal(feeRate);
        accumulatedFee += fee;

        expectedStateData.userCollateral =
            currentStateData.userCollateral -
            collateralForOrder;
        expectedStateData.foilCollateral =
            currentStateData.foilCollateral +
            collateralForOrder;
        expectedStateData.depositedCollateralAmount = collateralForOrder;
        expectedStateData.positionSize = positionSize;
        expectedStateData.vEthAmount = 0;
        expectedStateData.vGasAmount = uint256(positionSize);
        expectedStateData.borrowedVEth = tokens + fee;
        expectedStateData.borrowedVGas = 0;

        // Create Long position (with enough collateral)
        positionId = foil.createTraderPosition(
            epochId,
            collateralForOrder,
            positionSize,
            0
        );

        currentStateData = assertPosition(
            trader1,
            foil,
            positionId,
            collateralAsset,
            expectedStateData,
            "Create Long"
        );

        // Modify Long position (increase it)
        referencePrice = foil.getReferencePrice(epochId);
        tokens = uint256(positionSize).mulDecimal(referencePrice);
        fee = tokens.mulDecimal(feeRate);
        accumulatedFee += fee;

        expectedStateData.userCollateral =
            currentStateData.userCollateral -
            collateralForOrder;
        expectedStateData.foilCollateral =
            currentStateData.foilCollateral +
            collateralForOrder;
        expectedStateData.depositedCollateralAmount = collateralForOrder * 2;
        expectedStateData.positionSize = positionSize * 2;
        expectedStateData.vEthAmount = 0;
        expectedStateData.vGasAmount = uint256(positionSize) * 2;
        expectedStateData.borrowedVEth =
            currentStateData.borrowedVEth +
            tokens +
            fee;
        expectedStateData.borrowedVGas = 0;

        foil.modifyTraderPosition(
            positionId,
            2 * collateralForOrder,
            2 * positionSize,
            0
        );

        currentStateData = assertPosition(
            trader1,
            foil,
            positionId,
            collateralAsset,
            expectedStateData,
            "Increase Long"
        );

        // Modify Long position (decrease it)
        referencePrice = foil.getReferencePrice(epochId);
        tokens = uint256(positionSize).mulDecimal(referencePrice);
        fee = tokens.mulDecimal(feeRate);
        accumulatedFee += fee;

        expectedStateData.userCollateral = currentStateData.userCollateral;
        expectedStateData.foilCollateral = currentStateData.foilCollateral;
        expectedStateData.depositedCollateralAmount = currentStateData
            .depositedCollateralAmount;
        expectedStateData.positionSize = positionSize;
        expectedStateData.vEthAmount = 0;
        expectedStateData.vGasAmount = uint256(positionSize);
        expectedStateData.borrowedVEth =
            currentStateData.borrowedVEth -
            tokens +
            fee; // discounting here because we are charging the fee on the vETH we get back
        expectedStateData.borrowedVGas = 0;

        foil.modifyTraderPosition(
            positionId,
            2 * collateralForOrder, // keep same collateral
            positionSize,
            0
        );

        currentStateData = assertPosition(
            trader1,
            foil,
            positionId,
            collateralAsset,
            expectedStateData,
            "Decrease Long"
        );

        // Modify Long position (close it)
        referencePrice = foil.getReferencePrice(epochId);
        // fee for closing the position
        fee = currentStateData.vGasAmount.mulDecimal(referencePrice).mulDecimal(
                feeRate
            );
        accumulatedFee += fee;

        expectedStateData.userCollateral =
            currentStateData.userCollateral +
            2 *
            collateralForOrder -
            accumulatedFee;
        expectedStateData.foilCollateral =
            currentStateData.foilCollateral -
            2 *
            collateralForOrder +
            accumulatedFee;
        expectedStateData.depositedCollateralAmount = 0;
        expectedStateData.positionSize = 0;
        expectedStateData.vEthAmount = 0;
        expectedStateData.vGasAmount = 0;
        expectedStateData.borrowedVEth = 0;
        expectedStateData.borrowedVGas = 0;

        foil.modifyTraderPosition(positionId, 0 ether, 0, 0);

        assertPosition(
            trader1,
            foil,
            positionId,
            collateralAsset,
            expectedStateData,
            "Close Long"
        );
        vm.stopPrank();
    }

    function test_tradeLongCrossSides() public {
        uint256 referencePrice;
        uint256 positionId;
        uint256 collateralForOrder = 10 ether;
        int256 positionSize;
        uint256 tokens;
        uint256 fee;
        uint256 accumulatedFee;

        StateData memory expectedStateData;
        StateData memory currentStateData;

        vm.startPrank(lp1);
        addLiquidity(
            foil,
            pool,
            epochId,
            collateralForOrder * 100_000,
            LOWERTICK,
            UPPERTICK
        ); // enough to keep price stable (no slippage)
        vm.stopPrank();

        vm.startPrank(trader1);

        // Set position size
        positionSize = int256(collateralForOrder / 100);

        fillCollateralStateData(
            trader1,
            foil,
            collateralAsset,
            currentStateData
        );

        referencePrice = foil.getReferencePrice(epochId);
        tokens = uint256(positionSize).mulDecimal(referencePrice);
        fee = tokens.mulDecimal(feeRate);
        accumulatedFee += fee;

        expectedStateData.userCollateral =
            currentStateData.userCollateral -
            collateralForOrder;
        expectedStateData.foilCollateral =
            currentStateData.foilCollateral +
            collateralForOrder;
        expectedStateData.depositedCollateralAmount = collateralForOrder;
        expectedStateData.positionSize = positionSize;
        expectedStateData.vEthAmount = 0;
        expectedStateData.vGasAmount = uint256(positionSize);
        expectedStateData.borrowedVEth = tokens + fee;
        expectedStateData.borrowedVGas = 0;

        // Create Long position (with enough collateral)
        positionId = foil.createTraderPosition(
            epochId,
            collateralForOrder,
            positionSize,
            0
        );

        currentStateData = assertPosition(
            trader1,
            foil,
            positionId,
            collateralAsset,
            expectedStateData,
            "Create Long"
        );

        // Modify Long position (change side)
        referencePrice = foil.getReferencePrice(epochId);
        // change sides means closing the long order and opening a short order
        // fee for closing the position
        fee = currentStateData.vGasAmount.mulDecimal(referencePrice).mulDecimal(
                feeRate
            );
        accumulatedFee += fee;

        // tokens and fee for opening the short order
        tokens = uint256(positionSize).mulDecimal(referencePrice);
        fee = tokens.mulDecimal(feeRate);
        accumulatedFee += fee;

        expectedStateData.userCollateral = currentStateData.userCollateral;
        expectedStateData.foilCollateral = currentStateData.foilCollateral;
        expectedStateData.depositedCollateralAmount = currentStateData
            .depositedCollateralAmount;
        expectedStateData.positionSize = positionSize * -1;
        expectedStateData.vEthAmount = tokens - fee;
        expectedStateData.vGasAmount = 0;
        expectedStateData.borrowedVEth = 0;
        expectedStateData.borrowedVGas = uint256(positionSize);

        foil.modifyTraderPosition(
            positionId,
            collateralForOrder,
            -1 * positionSize,
            0
        );

        currentStateData = assertPosition(
            trader1,
            foil,
            positionId,
            collateralAsset,
            expectedStateData,
            "Change sides Long"
        );
        vm.stopPrank();
    }

    function test_tradeShort() public {
        uint256 referencePrice;
        uint256 positionId;
        uint256 collateralForOrder = 10 ether;
        int256 positionSize;
        uint256 tokens;
        uint256 fee;
        uint256 accumulatedFee;

        StateData memory expectedStateData;
        StateData memory currentStateData;

        vm.startPrank(lp1);
        addLiquidity(
            foil,
            pool,
            epochId,
            collateralForOrder * 100_000,
            LOWERTICK,
            UPPERTICK
        ); // enough to keep price stable (no slippage)
        vm.stopPrank();

        vm.startPrank(trader1);

        // Set position size
        positionSize = int256(collateralForOrder / 100);

        fillCollateralStateData(
            trader1,
            foil,
            collateralAsset,
            currentStateData
        );

        referencePrice = foil.getReferencePrice(epochId);
        tokens = uint256(positionSize).mulDecimal(referencePrice);
        fee = tokens.mulDecimal(feeRate);
        accumulatedFee += fee;

        expectedStateData.userCollateral =
            currentStateData.userCollateral -
            collateralForOrder;
        expectedStateData.foilCollateral =
            currentStateData.foilCollateral +
            collateralForOrder;
        expectedStateData.depositedCollateralAmount = collateralForOrder;
        expectedStateData.positionSize = -1 * positionSize;
        expectedStateData.vEthAmount = tokens - fee;
        expectedStateData.vGasAmount = 0;
        expectedStateData.borrowedVEth = 0;
        expectedStateData.borrowedVGas = uint256(positionSize);

        // Create Long position (with enough collateral)
        positionId = foil.createTraderPosition(
            epochId,
            collateralForOrder,
            -1 * positionSize,
            0
        );

        currentStateData = assertPosition(
            trader1,
            foil,
            positionId,
            collateralAsset,
            expectedStateData,
            "Create Short"
        );

        // Modify Short position (increase it)
        referencePrice = foil.getReferencePrice(epochId);
        tokens = uint256(positionSize).mulDecimal(referencePrice);
        fee = tokens.mulDecimal(feeRate);
        accumulatedFee += fee;

        expectedStateData.userCollateral =
            currentStateData.userCollateral -
            collateralForOrder;
        expectedStateData.foilCollateral =
            currentStateData.foilCollateral +
            collateralForOrder;
        expectedStateData.depositedCollateralAmount = collateralForOrder * 2;
        expectedStateData.positionSize = positionSize * -2;
        expectedStateData.vEthAmount =
            currentStateData.vEthAmount +
            tokens -
            fee;
        expectedStateData.vGasAmount = 0;
        expectedStateData.borrowedVEth = 0;
        expectedStateData.borrowedVGas = uint256(positionSize) * 2;

        foil.modifyTraderPosition(
            positionId,
            2 * collateralForOrder,
            -2 * positionSize,
            0
        );

        currentStateData = assertPosition(
            trader1,
            foil,
            positionId,
            collateralAsset,
            expectedStateData,
            "Increase Short"
        );

        // Modify Short position (decrease it)
        referencePrice = foil.getReferencePrice(epochId);
        tokens = uint256(positionSize).mulDecimal(referencePrice);
        fee = tokens.mulDecimal(feeRate);
        accumulatedFee += fee;

        expectedStateData.userCollateral = currentStateData.userCollateral;
        expectedStateData.foilCollateral = currentStateData.foilCollateral;
        expectedStateData.depositedCollateralAmount = currentStateData
            .depositedCollateralAmount;
        expectedStateData.positionSize = positionSize * -1;
        expectedStateData.vEthAmount =
            currentStateData.vEthAmount -
            tokens -
            fee;
        expectedStateData.vGasAmount = 0;
        expectedStateData.borrowedVEth = 0;
        expectedStateData.borrowedVGas = uint256(positionSize);

        foil.modifyTraderPosition(
            positionId,
            2 * collateralForOrder, // keep same collateral
            -1 * positionSize,
            0
        );

        currentStateData = assertPosition(
            trader1,
            foil,
            positionId,
            collateralAsset,
            expectedStateData,
            "Decrease Short"
        );

        // Modify Short position (close it)
        referencePrice = foil.getReferencePrice(epochId);
        // fee for closing the position
        fee = currentStateData.vGasAmount.mulDecimal(referencePrice).mulDecimal(
                feeRate
            );
        accumulatedFee += fee;

        expectedStateData.userCollateral =
            currentStateData.userCollateral +
            2 *
            collateralForOrder -
            accumulatedFee;
        expectedStateData.foilCollateral =
            currentStateData.foilCollateral -
            2 *
            collateralForOrder +
            accumulatedFee;
        expectedStateData.depositedCollateralAmount = 0;
        expectedStateData.positionSize = 0;
        expectedStateData.vEthAmount = 0;
        expectedStateData.vGasAmount = 0;
        expectedStateData.borrowedVEth = 0;
        expectedStateData.borrowedVGas = 0;

        foil.modifyTraderPosition(positionId, 0 ether, 0, 0);

        assertPosition(
            trader1,
            foil,
            positionId,
            collateralAsset,
            expectedStateData,
            "Close Short"
        );
        vm.stopPrank();
    }

    function test_tradeShortCrossSides() public {
        uint256 referencePrice;
        uint256 positionId;
        uint256 collateralForOrder = 10 ether;
        int256 positionSize;
        uint256 tokens;
        uint256 fee;
        uint256 accumulatedFee;

        StateData memory expectedStateData;
        StateData memory currentStateData;

        vm.startPrank(lp1);
        addLiquidity(
            foil,
            pool,
            epochId,
            collateralForOrder * 100_000,
            LOWERTICK,
            UPPERTICK
        ); // enough to keep price stable (no slippage)
        vm.stopPrank();

        vm.startPrank(trader1);

        // Set position size
        positionSize = int256(collateralForOrder / 100);

        fillCollateralStateData(
            trader1,
            foil,
            collateralAsset,
            currentStateData
        );

        referencePrice = foil.getReferencePrice(epochId);
        tokens = uint256(positionSize).mulDecimal(referencePrice);
        fee = tokens.mulDecimal(feeRate);
        accumulatedFee += fee;

        expectedStateData.userCollateral =
            currentStateData.userCollateral -
            collateralForOrder;
        expectedStateData.foilCollateral =
            currentStateData.foilCollateral +
            collateralForOrder;
        expectedStateData.depositedCollateralAmount = collateralForOrder;
        expectedStateData.positionSize = -1 * positionSize;
        expectedStateData.vEthAmount = tokens - fee;
        expectedStateData.vGasAmount = 0;
        expectedStateData.borrowedVEth = 0;
        expectedStateData.borrowedVGas = uint256(positionSize);

        // Create Short position (with enough collateral)
        positionId = foil.createTraderPosition(
            epochId,
            collateralForOrder,
            -1 * positionSize,
            0
        );

        currentStateData = assertPosition(
            trader1,
            foil,
            positionId,
            collateralAsset,
            expectedStateData,
            "Create Short"
        );

        // Modify Short position (change side)
        referencePrice = foil.getReferencePrice(epochId);
        // change sides means closing the short order and opening a long order

        // fee for closing the position
        fee = currentStateData.vEthAmount.mulDecimal(referencePrice).mulDecimal(
                feeRate
            );
        accumulatedFee += fee;

        // tokens and fee for opening the long order
        tokens = uint256(positionSize).mulDecimal(referencePrice);
        fee = tokens.mulDecimal(feeRate);
        accumulatedFee += fee;

        expectedStateData.userCollateral = currentStateData.userCollateral;
        expectedStateData.foilCollateral = currentStateData.foilCollateral;
        expectedStateData.depositedCollateralAmount = currentStateData
            .depositedCollateralAmount;
        expectedStateData.positionSize = positionSize;
        expectedStateData.vEthAmount = 0;
        expectedStateData.vGasAmount = uint256(positionSize);
        expectedStateData.borrowedVEth = tokens + fee;
        expectedStateData.borrowedVGas = 0;

        foil.modifyTraderPosition(
            positionId,
            collateralForOrder,
            positionSize,
            0
        );

        currentStateData = assertPosition(
            trader1,
            foil,
            positionId,
            collateralAsset,
            expectedStateData,
            "Change sides Short"
        );
        vm.stopPrank();
    }
}
