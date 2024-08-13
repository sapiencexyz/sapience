// SPDX-License-Identifier: MIT
pragma solidity >=0.8.2 <0.9.0;

import "forge-std/Test.sol";
import "cannon-std/Cannon.sol";
import "../src/synthetix/utils/DecimalMath.sol";

import {IFoil} from "../src/contracts/interfaces/IFoil.sol";
import {IFoilStructs} from "../src/contracts/interfaces/IFoilStructs.sol";
import {VirtualToken} from "../src/contracts/external/VirtualToken.sol";
import {TickMath} from "../src/contracts/external/univ3/TickMath.sol";
import "../src/contracts/interfaces/external/INonfungiblePositionManager.sol";
import "@uniswap/v3-core/contracts/interfaces/IUniswapV3Pool.sol";
import "@uniswap/v3-core/contracts/interfaces/IUniswapV3Factory.sol";
import "../src/contracts/storage/Position.sol";
import {IMintableToken} from "../src/contracts/external/IMintableToken.sol";
import "forge-std/console2.sol";

contract FoilTradeModuleTest is Test {
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

    struct StateData {
        uint256 userCollateral;
        uint256 foilCollateral;
        uint256 borrowedVEth;
        uint256 borrowedVGas;
        uint256 vEthAmount;
        uint256 vGasAmount;
        int256 currentTokenAmount; // position size
        uint256 depositedCollateralAmount;
    }

    function test_tradeLong_Only() public {
        uint256 priceReference;
        uint256 positionId;
        uint256 collateralForOrder = 10 ether;
        int256 positionSize;

        StateData memory previousStateData;
        StateData memory expectedStateData;
        StateData memory currentStateData;

        addLiquidity(collateralForOrder * 100_000); // enough to keep price stable (no slippage)

        // Set position size
        positionSize = int256(collateralForOrder / 100);

        fillCollateralStateData(previousStateData);

        priceReference = foil.getReferencePrice(epochId);

        expectedStateData.userCollateral =
            previousStateData.userCollateral -
            collateralForOrder;
        expectedStateData.foilCollateral =
            previousStateData.foilCollateral +
            collateralForOrder;
        expectedStateData.depositedCollateralAmount = collateralForOrder;
        expectedStateData.currentTokenAmount = positionSize;
        expectedStateData.vEthAmount = 0;
        expectedStateData.vGasAmount = uint256(positionSize);
        expectedStateData.borrowedVEth = uint256(positionSize)
            .mulDecimal(priceReference)
            .mulDecimal(UNIT + feeRate);
        expectedStateData.borrowedVGas = 0;

        // Create Long position (with enough collateral)
        positionId = foil.createTraderPosition(
            epochId,
            collateralForOrder,
            positionSize,
            0
        );

        logPositionAndAccount(positionId);
        currentStateData = assertPosition(positionId, expectedStateData);
        previousStateData = deepCopyState(currentStateData);

        // // Modify Long position (increase it)
        // console2.log("Modify Long position (increase it)");
        // foil.modifyTraderPosition(positionId, 10 ether, .2 ether, 0);
        // logPositionAndAccount(positionId);

        // // Modify Long position (decrease it)
        // console2.log("Modify Long position (decrease it)");
        // foil.modifyTraderPosition(positionId, 0 ether, .1 ether, 0);
        // logPositionAndAccount(positionId);

        // // Modify Long position (close it)
        // console2.log("Modify Long position (close it)");
        // foil.modifyTraderPosition(positionId, 0 ether, 0, 0);
        // logPositionAndAccount(positionId);
    }

    function test_trade_long_cross_sides() public {
        uint256 priceReference;
        uint256 positionId_3;
        priceReference = foil.getReferencePrice(epochId);

        console2.log("priceReference", priceReference);
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

        priceReference = foil.getReferencePrice(epochId);
        console2.log("priceReference", priceReference);

        // Create Long position (another one)
        console2.log("Create Long position (another one)");
        priceReference = foil.getReferencePrice(epochId);
        console2.log("priceReference", priceReference);
        positionId_3 = foil.createTraderPosition(
            epochId,
            10 ether,
            .1 ether,
            0
        );
        logPositionAndAccount(positionId_3);

        // Modify Long position (change side)
        console2.log("Modify Long position (change side)");
        priceReference = foil.getReferencePrice(epochId);
        console2.log("priceReference", priceReference);
        foil.modifyTraderPosition(
            positionId_3,
            0 ether,
            -.05 ether,
            -.01 ether
        );
        logPositionAndAccount(positionId_3);
    }

    function test_trade_short() public {
        uint256 priceReference;
        uint256 positionId_2;
        priceReference = foil.getReferencePrice(epochId);

        console2.log("priceReference", priceReference);
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

        priceReference = foil.getReferencePrice(epochId);
        console2.log("priceReference", priceReference);

        // Create Short position
        console2.log("Create Short position");
        positionId_2 = foil.createTraderPosition(
            epochId,
            10 ether,
            -.1 ether,
            0
        );
        logPositionAndAccount(positionId_2);

        // Modify Short position (increase it)
        console2.log("Modify Short position (increase it)");
        foil.modifyTraderPosition(positionId_2, 10 ether, -.2 ether, -.1 ether);
        logPositionAndAccount(positionId_2);

        // Modify Short position (decrease it)
        console2.log("Modify Short position (decrease it)");
        foil.modifyTraderPosition(positionId_2, 0, -.05 ether, -.01 ether);
        logPositionAndAccount(positionId_2);

        // Modify Short position (close it)
        console2.log("Modify Short position (close it)");
        foil.modifyTraderPosition(positionId_2, 0, 0, 0);
        logPositionAndAccount(positionId_2);
    }

    function test_trade_short_cross_sides() public {
        uint256 priceReference;
        uint256 positionId_4;
        priceReference = foil.getReferencePrice(epochId);

        console2.log("priceReference", priceReference);
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

        priceReference = foil.getReferencePrice(epochId);
        console2.log("priceReference", priceReference);

        // Create Short position (another one)
        console2.log("Create Short position (another one)");
        positionId_4 = foil.createTraderPosition(
            epochId,
            10 ether,
            -.1 ether,
            0
        );
        logPositionAndAccount(positionId_4);

        // Modify Short position (change side)
        console2.log("Modify Short position (change side)");
        foil.modifyTraderPosition(positionId_4, 0, .05 ether, 0);
        logPositionAndAccount(positionId_4);
    }

    function getTokenAmountsForCollateralAmount(
        uint256 collateralAmount,
        int24 lowerTick,
        int24 upperTick
    )
        public
        view
        returns (uint256 loanAmount0, uint256 loanAmount1, uint256 liquidity)
    {
        (uint160 sqrtPriceX96, , , , , , ) = IUniswapV3Pool(pool).slot0();

        uint160 sqrtPriceAX96 = uint160(TickMath.getSqrtRatioAtTick(lowerTick));
        uint160 sqrtPriceBX96 = uint160(TickMath.getSqrtRatioAtTick(upperTick));

        (loanAmount0, loanAmount1, liquidity) = foil.getTokenAmounts(
            epochId,
            collateralAmount,
            sqrtPriceX96,
            sqrtPriceAX96,
            sqrtPriceBX96
        );
    }

    function deepCopyState(
        StateData memory stateData
    ) public returns (StateData memory) {
        return
            StateData({
                userCollateral: stateData.userCollateral,
                foilCollateral: stateData.foilCollateral,
                borrowedVEth: stateData.borrowedVEth,
                borrowedVGas: stateData.borrowedVGas,
                vEthAmount: stateData.vEthAmount,
                vGasAmount: stateData.vGasAmount,
                currentTokenAmount: stateData.currentTokenAmount,
                depositedCollateralAmount: stateData.depositedCollateralAmount
            });
    }

    function fillPositionState(
        uint256 positionId,
        StateData memory stateData
    ) public {
        Position.Data memory position = foil.getPosition(positionId);
        stateData.depositedCollateralAmount = position
            .depositedCollateralAmount;
        stateData.vEthAmount = position.vEthAmount;
        stateData.vGasAmount = position.vGasAmount;
        stateData.currentTokenAmount = position.currentTokenAmount;
        stateData.borrowedVEth = position.borrowedVEth;
        stateData.borrowedVGas = position.borrowedVGas;
    }

    function fillCollateralStateData(StateData memory stateData) public {
        stateData.userCollateral = collateralAsset.balanceOf(address(this));
        stateData.foilCollateral = collateralAsset.balanceOf(address(foil));
    }

    function assertPosition(
        uint256 positionId,
        StateData memory expectedStateData
    ) public returns (StateData memory currentStateData) {
        fillCollateralStateData(currentStateData);
        fillPositionState(positionId, currentStateData);

        assertEq(
            currentStateData.userCollateral,
            expectedStateData.userCollateral,
            "userCollateral"
        );
        assertEq(
            currentStateData.foilCollateral,
            expectedStateData.foilCollateral,
            "foilCollateral"
        );
        assertEq(
            currentStateData.depositedCollateralAmount,
            expectedStateData.depositedCollateralAmount,
            "depositedCollateralAmount"
        );
        assertApproxEqRel(
            currentStateData.currentTokenAmount,
            expectedStateData.currentTokenAmount,
            0.01 ether,
            "currentTokenAmount"
        );
        assertApproxEqRel(
            currentStateData.vEthAmount,
            expectedStateData.vEthAmount,
            0.01 ether,
            "vEthAmount"
        );
        assertApproxEqRel(
            currentStateData.vGasAmount,
            expectedStateData.vGasAmount,
            0.01 ether,
            "vGasAmount"
        );
        assertApproxEqRel(
            currentStateData.borrowedVEth,
            expectedStateData.borrowedVEth,
            0.01 ether,
            "borrowedVEth"
        );
        assertApproxEqRel(
            currentStateData.borrowedVGas,
            expectedStateData.borrowedVGas,
            0.01 ether,
            "borrowedVGas"
        );
    }

    function logPositionAndAccount(uint256 positionId) public {
        Position.Data memory position = foil.getPosition(positionId);
        console2.log(" >>> Position", positionId);
        console2.log("    >>> Ids");
        console2.log("      >> tokenId           : ", position.tokenId);
        console2.log("      >> epochId           : ", position.epochId);
        // console2.log("      >> kind              : ", position.kind);
        console2.log("    >>> Accounting data (debt and deposited collateral)");
        console2.log(
            "      >> depositedCollateralAmount  : ",
            position.depositedCollateralAmount
        );
        console2.log("      >> borrowedVEth      : ", position.borrowedVEth);
        console2.log("      >> borrowedVGas       : ", position.borrowedVGas);
        console2.log("    >>> Position data (owned tokens and position size)");
        console2.log("      >> vEthAmount        : ", position.vEthAmount);
        console2.log("      >> vGasAmount        : ", position.vGasAmount);
        console2.log(
            "      >> currentTokenAmount: ",
            position.currentTokenAmount
        );
    }

    function addLiquidity(uint256 collateralRequired) internal {
        int24 lowerTick = 12200;
        int24 upperTick = 12400;

        (
            uint256 amountTokenA,
            uint256 amountTokenB,

        ) = getTokenAmountsForCollateralAmount(
                collateralRequired,
                lowerTick,
                upperTick
            );

        IFoilStructs.LiquidityPositionParams memory params = IFoilStructs
            .LiquidityPositionParams({
                epochId: epochId,
                amountTokenA: amountTokenA,
                amountTokenB: amountTokenB,
                collateralAmount: collateralRequired,
                lowerTick: lowerTick,
                upperTick: upperTick,
                minAmountTokenA: 0,
                minAmountTokenB: 0
            });

        foil.createLiquidityPosition(params);
    }

    function addPreTrade(uint256 collateral) internal {
        int256 positionSize = int256(collateral / 100);

        foil.createTraderPosition(epochId, collateral, positionSize, 0);
    }
}
