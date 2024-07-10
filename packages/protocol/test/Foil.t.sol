// SPDX-License-Identifier: MIT
pragma solidity >=0.8.2 <0.9.0;

import "forge-std/Test.sol";
import "cannon-std/Cannon.sol";

//import {Foil} from "../src/contracts/Foil.sol";
import {IFoil} from "../src/contracts/interfaces/IFoil.sol";
import {IFoilStructs} from "../src/contracts/interfaces/IFoilStructs.sol";
import {VirtualToken} from "../src/contracts/external/VirtualToken.sol";
import {TickMath} from "../src/contracts/external/univ3/TickMath.sol";
import "../src/contracts/interfaces/external/INonfungiblePositionManager.sol";
import "@uniswap/v3-core/contracts/interfaces/IUniswapV3Pool.sol";
import "@uniswap/v3-core/contracts/interfaces/IUniswapV3Factory.sol";

import "forge-std/console2.sol";

contract FoilTest is Test {
    using Cannon for Vm;

    IFoil foil;
    address constant foilAddress = 0xa886ec907D6529D8f7d0b74a181f709A6a5809fD;
    address pool;
    address tokenA;
    address tokenB;
    address constant UNISWAP = 0xC36442b4a4522E871399CD717aBDD847Ab11FE88;
    address constant UNISWAP_QUOTER =
        0xb27308f9F90D607463bb33eA1BeBb41C27CE5AB6;

    function setUp() public {
        // deploy Foil contract
        // foil = new Foil(
        //     1712152320, // startime
        //     1720051200, // endtime
        //    UNISWAP, // uniswap
        //     UNISWAP_QUOTER, // uniswap quoter
        //     0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266, // resolver
        //     0x101b9758583F47C63236D831db79247B6eEAdb57, // mintable asset
        //     7000, // base asset min price
        //     46000, // base asset max price
        //     10000 // fee rate
        // );
        foil = IFoil(vm.getAddress("Foil"));

        (pool, tokenA, tokenB) = foil.getEpoch();
        // foil.createTraderPosition();
        // foil.createTraderPosition();
    }

    function test_addLiquidity() public {
        // int24 tickSpacing = IUniswapV3Pool(pool).tickSpacing();
        // int24 lowerTick = TickMath.getTickAtSqrtRatio(
        //     177159557114295710296101716160
        // ); // 5
        // int24 upperTick = TickMath.getTickAtSqrtRatio(
        //     306849353968360525628702781967
        // ); // 15
        IFoilStructs.LiquidityPositionParams memory params = IFoilStructs
            .LiquidityPositionParams({
                amountTokenA: 50 ether,
                amountTokenB: 50 ether,
                collateralAmount: 10 ether,
                lowerTick: 16000, // 5
                upperTick: 30000 // 20
            });
        foil.createLiquidityPositionTwo(params);
        (uint256 tokenId, uint128 liquidity, , ) = foil
            .createLiquidityPositionTwo(params);

        uint128 halfLiquidity = liquidity / 2;
        uint256 coll = 10 ether;

        console2.log(tokenId, halfLiquidity);
        foil.updateLiquidityPosition(tokenId, coll, halfLiquidity);

        // (uint256 tokenAmount0, uint256 tokenAmount1) = foil.getPosition(1);
        // console2.log(tokenAmount0, tokenAmount1);
        // // new account!
        // params = IFoilStructs.LiquidityPositionParams({
        //     accountId: 2,
        //     amountTokenA: 100 ether,
        //     amountTokenB: 10 ether,
        //     collateralAmount: 10 ether,
        //     lowerTick: -887200, // minTick
        //     upperTick: 887200 // maxTick
        // });
        // foil.addLiquidity(params);
        // (uint256 tokenAmount3, uint256 tokenAmount4) = foil.getPosition(2);
        // console2.log(tokenAmount3, tokenAmount4);
    }

    function test_trade() public {
        IFoilStructs.LiquidityPositionParams memory params = IFoilStructs
            .LiquidityPositionParams({
                amountTokenA: 50 ether,
                amountTokenB: 50 ether,
                collateralAmount: 10 ether,
                lowerTick: 16000, // 5
                upperTick: 30000 // 20
            });
        (
            uint256 positionId,
            uint128 liquidity,
            uint256 addedAmount0,
            uint256 addedAmount1
        ) = foil.createLiquidityPositionTwo(params);
        console2.log("LIQUIDITY POSITION CREATED", positionId, liquidity);
        console2.log("ADDED LIQUIDITY", addedAmount0, addedAmount1);
        params.amountTokenA = 100 ether;
        params.amountTokenB = 100 ether;
        (uint256 positionId2, , , ) = foil.createLiquidityPositionTwo(params);
        getAndLogPosition(positionId);
        getAndLogPosition(positionId2);

        (uint256 tradedAmoun0, uint256 tradedAmount2) = foil.trade(0, 1 ether);

        console2.log("TRADED", tradedAmoun0, tradedAmount2);

        (uint256 tokenAmount0, uint256 tokenAmount1) = foil.collectFees(
            positionId
        );
        getAndLogPosition(positionId);
        getAndLogPosition(positionId2);
        console2.log("FEES COLLECTED", tokenAmount0, tokenAmount1);
        (tokenAmount0, tokenAmount1) = foil.collectFees(positionId2);
        console2.log("FEES COLLECTED 2", tokenAmount0, tokenAmount1);
        getAndLogPosition(positionId);
        getAndLogPosition(positionId2);
    }

    function getAndLogPosition(uint256 positionId) public {
        (
            uint96 nonce,
            address operator,
            address token0,
            address token1,
            uint24 fee,
            int24 tickLower,
            int24 tickUpper,
            uint128 liquidity,
            uint256 feeGrowthInside0LastX128,
            uint256 feeGrowthInside1LastX128,
            uint128 tokensOwed0,
            uint128 tokensOwed1
        ) = foil.getPosition(positionId);

        console2.log("START POSITION", positionId);
        console2.log("  nonce                    : ", nonce);
        console2.log("  operator                 : ", operator);
        console2.log("  token0                   : ", token0);
        console2.log("  token1                   : ", token1);
        console2.log("  fee                      : ", fee);
        console2.log("  tickLower                : ", tickLower);
        console2.log("  tickUpper                : ", tickUpper);
        console2.log("  liquidity                : ", liquidity);
        console2.log("  feeGrowthInside0LastX128 : ", feeGrowthInside0LastX128);
        console2.log("  feeGrowthInside1LastX128 : ", feeGrowthInside1LastX128);
        console2.log("  tokensOwed0              : ", tokensOwed0);
        console2.log("  tokensOwed1              : ", tokensOwed1);
        console2.log("END   POSITION", positionId);
    }
    // function test_addLiquidityAndLongs() public {
    //     int24 tickSpacing = IUniswapV3Pool(pool).tickSpacing();
    //     // int24 lowerTick = TickMath.getTickAtSqrtRatio(
    //     //     177159557114295710296101716160
    //     // ); // 5
    //     // int24 upperTick = TickMath.getTickAtSqrtRatio(
    //     //     306849353968360525628702781967
    //     // ); // 15
    //     IFoilStructs.LiquidityPositionParams memory params = IFoilStructs
    //         .LiquidityPositionParams({
    //             accountId: 1,
    //             amountTokenA: 10 ether,
    //             amountTokenB: 100 ether,
    //             collateralAmount: 10 ether,
    //             lowerTick: 27000, // 5
    //             upperTick: 30000 // 15
    //         });
    //     foil.addLiquidity(params);

    //     (uint256 tokenAmount0, uint256 tokenAmount1) = foil.getPosition(1);

    //     // new account!
    //     params = IFoilStructs.LiquidityPositionParams({
    //         accountId: 2,
    //         amountTokenA: 100 ether,
    //         amountTokenB: 10 ether,
    //         collateralAmount: 10 ether,
    //         lowerTick: -887200, // minTick
    //         upperTick: 887200 // maxTick
    //     });
    //     foil.addLiquidity(params);

    //     (uint256 tokenAmount3, uint256 tokenAmount4) = foil.getPosition(2);

    //     foil.openLong(1, 10 ether);
    //     foil.reduceLong(1, 1 ether);
    // }

    // function test_addLiquidityAndShorts() public {
    //     int24 tickSpacing = IUniswapV3Pool(pool).tickSpacing();
    //     // int24 lowerTick = TickMath.getTickAtSqrtRatio(
    //     //     177159557114295710296101716160
    //     // ); // 5
    //     // int24 upperTick = TickMath.getTickAtSqrtRatio(
    //     //     306849353968360525628702781967
    //     // ); // 15
    //     IFoilStructs.LiquidityPositionParams memory params = IFoilStructs
    //         .LiquidityPositionParams({
    //             accountId: 1,
    //             amountTokenA: 10 ether,
    //             amountTokenB: 100 ether,
    //             collateralAmount: 10 ether,
    //             lowerTick: 27000, // 5
    //             upperTick: 30000 // 15
    //         });
    //     foil.addLiquidity(params);

    //     (uint256 tokenAmount0, uint256 tokenAmount1) = foil.getPosition(1);

    //     // new account!
    //     params = IFoilStructs.LiquidityPositionParams({
    //         accountId: 2,
    //         amountTokenA: 100 ether,
    //         amountTokenB: 10 ether,
    //         collateralAmount: 10 ether,
    //         lowerTick: -887200, // minTick
    //         upperTick: 887200 // maxTick
    //     });
    //     foil.addLiquidity(params);

    //     (uint256 tokenAmount3, uint256 tokenAmount4) = foil.getPosition(2);

    //     foil.openShort(1, 1 ether);
    //     foil.reduceShort(1, 0.1 ether);
    // }
}
