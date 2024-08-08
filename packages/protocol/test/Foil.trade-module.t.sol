// SPDX-License-Identifier: MIT
pragma solidity >=0.8.2 <0.9.0;

import "forge-std/Test.sol";
import "cannon-std/Cannon.sol";

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

    IFoil foil;
    address pool;
    address tokenA;
    address tokenB;
    uint256 epochStartTime;

    IMintableToken collateralAsset;

    function setUp() public {
        console2.log("setUp");
        foil = IFoil(vm.getAddress("Foil"));
        collateralAsset = IMintableToken(
            vm.getAddress("CollateralAsset.Token")
        );
        collateralAsset.mint(10_000_000 ether, address(this));
        collateralAsset.approve(address(foil), 10_000_000 ether);

        console2.log("getEpoch");

        (epochStartTime, , pool, tokenA, tokenB) = foil.getLatestEpoch();

        console2.log("pool", pool);
        console2.log("tokenA", tokenA);
        console2.log("tokenB", tokenB);
        console2.log("epochStartTime", epochStartTime);
    }

    function test_trade_long_Only() public {
        uint256 priceReference;
        uint256 positionId_1;
        priceReference = foil.getReferencePrice(epochStartTime);

        console2.log("priceReference", priceReference);

        uint256 depositedCollateralAmount = 100_000 ether;
        int24 lowerTick = 12200;
        int24 upperTick = 12400;

        (
            uint256 amountTokenA,
            uint256 amountTokenB,
            uint256 liquidity
        ) = getTokenAmountsForCollateralAmount(
                depositedCollateralAmount,
                lowerTick,
                upperTick
            );

        console2.log("amountTokenA", amountTokenA);
        console2.log("amountTokenB", amountTokenB);
        console2.log("liquidity", liquidity);

        IFoilStructs.LiquidityPositionParams memory params = IFoilStructs
            .LiquidityPositionParams({
                epochId: epochStartTime,
                amountTokenA: amountTokenA,
                amountTokenB: amountTokenB,
                depositedCollateralAmount: depositedCollateralAmount,
                lowerTick: lowerTick,
                upperTick: upperTick,
                minAmountTokenA: 0,
                minAmountTokenB: 0
            });

        foil.createLiquidityPosition(params);

        priceReference = foil.getReferencePrice(epochStartTime);
        console2.log("priceReference", priceReference);

        // Create Long position
        console2.log("Create Long position");
        priceReference = foil.getReferencePrice(epochStartTime);
        console2.log("priceReference", priceReference);
        positionId_1 = foil.createTraderPosition(
            epochStartTime,
            10 ether,
            .1 ether,
            0
        );
        logPositionAndAccount(positionId_1);

        // Modify Long position (increase it)
        console2.log("Modify Long position (increase it)");
        priceReference = foil.getReferencePrice(epochStartTime);
        console2.log("priceReference", priceReference);
        foil.modifyTraderPosition(positionId_1, 10 ether, .2 ether, 0);
        logPositionAndAccount(positionId_1);

        // Modify Long position (decrease it)
        console2.log("Modify Long position (decrease it)");
        priceReference = foil.getReferencePrice(epochStartTime);
        console2.log("priceReference", priceReference);
        foil.modifyTraderPosition(positionId_1, 0 ether, .1 ether, 0);
        logPositionAndAccount(positionId_1);

        // Modify Long position (close it)
        console2.log("Modify Long position (close it)");
        priceReference = foil.getReferencePrice(epochStartTime);
        console2.log("priceReference", priceReference);
        foil.modifyTraderPosition(positionId_1, 0 ether, 0, 0);
        logPositionAndAccount(positionId_1);
    }

    function test_trade_long_cross_sides() public {
        uint256 priceReference;
        uint256 positionId_3;
        priceReference = foil.getReferencePrice(epochStartTime);

        console2.log("priceReference", priceReference);
        IFoilStructs.LiquidityPositionParams memory params = IFoilStructs
            .LiquidityPositionParams({
                epochId: epochStartTime,
                amountTokenB: 20000 ether,
                amountTokenA: 1000 ether,
                depositedCollateralAmount: 100_000 ether,
                lowerTick: 12200,
                upperTick: 12400,
                minAmountTokenA: 0,
                minAmountTokenB: 0
            });

        foil.createLiquidityPosition(params);
        params.amountTokenB = 40000 ether;
        params.amountTokenA = 2000 ether;
        foil.createLiquidityPosition(params);

        priceReference = foil.getReferencePrice(epochStartTime);
        console2.log("priceReference", priceReference);

        // Create Long position (another one)
        console2.log("Create Long position (another one)");
        priceReference = foil.getReferencePrice(epochStartTime);
        console2.log("priceReference", priceReference);
        positionId_3 = foil.createTraderPosition(
            epochStartTime,
            10 ether,
            .1 ether,
            0
        );
        logPositionAndAccount(positionId_3);

        // Modify Long position (change side)
        console2.log("Modify Long position (change side)");
        priceReference = foil.getReferencePrice(epochStartTime);
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
        priceReference = foil.getReferencePrice(epochStartTime);

        console2.log("priceReference", priceReference);
        IFoilStructs.LiquidityPositionParams memory params = IFoilStructs
            .LiquidityPositionParams({
                epochId: epochStartTime,
                amountTokenB: 20000 ether,
                amountTokenA: 1000 ether,
                depositedCollateralAmount: 100_000 ether,
                lowerTick: 12200,
                upperTick: 12400,
                minAmountTokenA: 0,
                minAmountTokenB: 0
            });

        foil.createLiquidityPosition(params);
        params.amountTokenB = 40000 ether;
        params.amountTokenA = 2000 ether;
        foil.createLiquidityPosition(params);

        priceReference = foil.getReferencePrice(epochStartTime);
        console2.log("priceReference", priceReference);

        // Create Short position
        console2.log("Create Short position");
        positionId_2 = foil.createTraderPosition(
            epochStartTime,
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
        priceReference = foil.getReferencePrice(epochStartTime);

        console2.log("priceReference", priceReference);
        IFoilStructs.LiquidityPositionParams memory params = IFoilStructs
            .LiquidityPositionParams({
                epochId: epochStartTime,
                amountTokenB: 20000 ether,
                amountTokenA: 1000 ether,
                depositedCollateralAmount: 100_000 ether,
                lowerTick: 12200,
                upperTick: 12400,
                minAmountTokenA: 0,
                minAmountTokenB: 0
            });

        foil.createLiquidityPosition(params);
        params.amountTokenB = 40000 ether;
        params.amountTokenA = 2000 ether;
        foil.createLiquidityPosition(params);

        priceReference = foil.getReferencePrice(epochStartTime);
        console2.log("priceReference", priceReference);

        // Create Short position (another one)
        console2.log("Create Short position (another one)");
        positionId_4 = foil.createTraderPosition(
            epochStartTime,
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
        uint256 depositedCollateralAmount,
        int24 lowerTick,
        int24 upperTick
    )
        public
        view
        returns (uint256 loanAmount0, uint256 loanAmount1, uint256 liquidity)
    {
        (uint160 sqrtPriceX96, , , , , , ) = IUniswapV3Pool(pool).slot0();
        console.log("sqrtPriceX96", sqrtPriceX96);

        uint160 sqrtPriceAX96 = uint160(TickMath.getSqrtRatioAtTick(lowerTick));
        uint160 sqrtPriceBX96 = uint160(TickMath.getSqrtRatioAtTick(upperTick));

        console2.log("sqrtPriceAX96", sqrtPriceAX96);
        console2.log("sqrtPriceBX96", sqrtPriceBX96);
        (loanAmount0, loanAmount1, liquidity) = foil.getTokenAmounts(
            epochStartTime,
            depositedCollateralAmount,
            sqrtPriceX96,
            sqrtPriceAX96,
            sqrtPriceBX96
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
}
