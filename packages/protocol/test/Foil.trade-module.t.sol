// SPDX-License-Identifier: MIT
pragma solidity >=0.8.2 <0.9.0;

import "cannon-std/Cannon.sol";
import "./FoilTradeTestHelper.sol";
import "../src/synthetix/utils/DecimalMath.sol";
import "@uniswap/v3-core/contracts/interfaces/IUniswapV3Pool.sol";

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
    int24 LOWERTICK = 12200;
    int24 UPPERTICK = 12400;

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

    function test_tradeWildJake_Only() public {
        uint256 positionId;
        addLiquidity(foil, pool, epochId, 0.004 ether, 5200, 28200);
        addLiquidity(foil, pool, epochId, 0.003 ether, 5200, 28200);

        // Set position size
        uint256 liq = IUniswapV3Pool(pool).liquidity();
        console2.log(" >>> Liquidity", liq);

        positionId = foil.createTraderPosition(
            // Create Long position (with enough collateral)
            epochId,
            2254647488776959,
            438725000000000,
            434337750000000
        );

        console2.log(" >>> Position", positionId);
        logPositionAndAccount(foil, positionId);
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

        addLiquidity(
            foil,
            pool,
            epochId,
            collateralForOrder * 100_000,
            LOWERTICK,
            UPPERTICK
        ); // enough to keep price stable (no slippage)

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

        addLiquidity(
            foil,
            pool,
            epochId,
            collateralForOrder * 100_000,
            LOWERTICK,
            UPPERTICK
        ); // enough to keep price stable (no slippage)

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

        addLiquidity(
            foil,
            pool,
            epochId,
            collateralForOrder * 100_000,
            LOWERTICK,
            UPPERTICK
        ); // enough to keep price stable (no slippage)

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

        addLiquidity(
            foil,
            pool,
            epochId,
            collateralForOrder * 100_000,
            LOWERTICK,
            UPPERTICK
        ); // enough to keep price stable (no slippage)

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

        // Create Short position (with enough collateral)
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
        expectedStateData.currentTokenAmount = positionSize;
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
            foil,
            positionId,
            collateralAsset,
            expectedStateData,
            "Change sides Short"
        );
    }
}
