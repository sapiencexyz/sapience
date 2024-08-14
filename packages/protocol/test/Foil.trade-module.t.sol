// SPDX-License-Identifier: MIT
pragma solidity >=0.8.2 <0.9.0;

import "cannon-std/Cannon.sol";
import "./FoilTradeTestHelper.sol";
import "../src/synthetix/utils/DecimalMath.sol";

import "forge-std/console2.sol";

contract FoilTradeModuleTest is FoilTradeTestHelper {
    using Cannon for Vm;
    using DecimalMath for uint256;

    IFoil foil;
    address pool;
    address tokenA;
    address tokenB;
    uint256 epochId;
    uint256 feeRate;
    uint256 UNIT = 1e18;

    IMintableToken collateralAsset;
    IUniswapV3Pool uniCastedPool;

    function setUp() public {
        foil = IFoil(vm.getAddress("Foil"));
        collateralAsset = IMintableToken(
            vm.getAddress("CollateralAsset.Token")
        );
        collateralAsset.mint(type(uint240).max, address(this));
        collateralAsset.approve(address(foil), type(uint240).max);

        (epochId, , , pool, tokenA, tokenB) = foil.getLatestEpoch();
        uniCastedPool = IUniswapV3Pool(pool);
        feeRate = uint256(uniCastedPool.fee()) * 1e12;
    }

    function test_tradeLong_Only() public {
        uint256 referencePrice;
        uint256 positionId;
        uint256 collateralForOrder = 10 ether;
        int256 positionSize;
        uint256 tokens;
        uint256 fee;
        uint256 accumulatedFee;

        StateData memory expectedStateData;
        StateData memory currentStateData;

        addLiquidity(foil, pool, epochId, collateralForOrder * 100_000); // enough to keep price stable (no slippage)

        // Set position size
        positionSize = int256(collateralForOrder / 100);

        fillCollateralStateData(foil, collateralAsset, currentStateData);

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
        expectedStateData.currentTokenAmount = positionSize;
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
        expectedStateData.currentTokenAmount = positionSize * 2;
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
        expectedStateData.currentTokenAmount = positionSize;
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
        expectedStateData.currentTokenAmount = 0;
        expectedStateData.vEthAmount = 0;
        expectedStateData.vGasAmount = 0;
        expectedStateData.borrowedVEth = 0;
        expectedStateData.borrowedVGas = 0;

        foil.modifyTraderPosition(positionId, 0 ether, 0, 0);

        assertPosition(
            foil,
            positionId,
            collateralAsset,
            expectedStateData,
            "Close Long"
        );
    }

    function test_trade_long_cross_sides_Only() public {
        uint256 referencePrice;
        uint256 positionId;
        uint256 collateralForOrder = 10 ether;
        int256 positionSize;
        uint256 tokens;
        uint256 fee;
        uint256 accumulatedFee;

        StateData memory expectedStateData;
        StateData memory currentStateData;

        addLiquidity(foil, pool, epochId, collateralForOrder * 100_000); // enough to keep price stable (no slippage)

        // Set position size
        positionSize = int256(collateralForOrder / 100);

        fillCollateralStateData(foil, collateralAsset, currentStateData);

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
        expectedStateData.currentTokenAmount = positionSize;
        expectedStateData.vEthAmount = 0;
        expectedStateData.vGasAmount = uint256(positionSize);
        expectedStateData.borrowedVEth = tokens + fee;
        expectedStateData.borrowedVGas = 0;

        accumulatedFee += uint256(positionSize)
            .mulDecimal(referencePrice)
            .mulDecimal(feeRate);

        // Create Long position (with enough collateral)
        positionId = foil.createTraderPosition(
            epochId,
            collateralForOrder,
            positionSize,
            0
        );

        currentStateData = assertPosition(
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
        tokens = uint256(positionSize).divDecimal(referencePrice);
        fee = tokens.mulDecimal(feeRate);
        accumulatedFee += fee;

        expectedStateData.userCollateral = currentStateData.userCollateral;
        expectedStateData.foilCollateral = currentStateData.foilCollateral;
        expectedStateData.depositedCollateralAmount = currentStateData
            .depositedCollateralAmount;
        expectedStateData.currentTokenAmount = positionSize * -1;
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
            foil,
            positionId,
            collateralAsset,
            expectedStateData,
            "Change sides Long"
        );
    }

    function test_trade_short_Only() public {
        uint256 referencePrice;
        uint256 positionId;
        uint256 collateralForOrder = 10 ether;
        int256 positionSize;
        uint256 tokens;
        uint256 fee;
        uint256 accumulatedFee;

        StateData memory expectedStateData;
        StateData memory currentStateData;

        addLiquidity(foil, pool, epochId, collateralForOrder * 100_000); // enough to keep price stable (no slippage)

        // Set position size
        positionSize = int256(collateralForOrder / 100);

        fillCollateralStateData(foil, collateralAsset, currentStateData);

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
        expectedStateData.currentTokenAmount = -1 * positionSize;
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
        expectedStateData.currentTokenAmount = positionSize * -2;
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
        expectedStateData.currentTokenAmount = positionSize * -1;
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
        expectedStateData.currentTokenAmount = 0;
        expectedStateData.vEthAmount = 0;
        expectedStateData.vGasAmount = 0;
        expectedStateData.borrowedVEth = 0;
        expectedStateData.borrowedVGas = 0;

        foil.modifyTraderPosition(positionId, 0 ether, 0, 0);

        assertPosition(
            foil,
            positionId,
            collateralAsset,
            expectedStateData,
            "Close Short"
        );
    }

    function test_trade_short_cross_sides() public {
        uint256 referencePrice;
        uint256 positionId_4;
        referencePrice = foil.getReferencePrice(epochId);

        console2.log("referencePrice", referencePrice);
        IFoilStructs.LiquidityPositionParams memory params = IFoilStructs
            .LiquidityPositionParams({
                epochId: epochId,
                amountTokenB: 20000 ether,
                amountTokenA: 1000 ether,
                collateralAmount: 100_000 ether,
                lowerTick: 12200,
                upperTick: 12400,
                minAmountTokenA: 0,
                minAmountTokenB: 0
            });

        foil.createLiquidityPosition(params);
        params.amountTokenB = 40000 ether;
        params.amountTokenA = 2000 ether;
        foil.createLiquidityPosition(params);

        referencePrice = foil.getReferencePrice(epochId);
        console2.log("referencePrice", referencePrice);

        // Create Short position (another one)
        console2.log("Create Short position (another one)");
        positionId_4 = foil.createTraderPosition(
            epochId,
            10 ether,
            -.1 ether,
            0
        );
        logPositionAndAccount(foil, positionId_4);

        // Modify Short position (change side)
        console2.log("Modify Short position (change side)");
        foil.modifyTraderPosition(positionId_4, 0, .05 ether, 0);
        logPositionAndAccount(foil, positionId_4);
    }
}
