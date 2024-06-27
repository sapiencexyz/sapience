// SPDX-License-Identifier: MIT
pragma solidity >=0.8.2 <0.9.0;

import "forge-std/Test.sol";

import {Foil} from "../src/contracts/Foil.sol";
import {IFoil} from "../src/interfaces/IFoil.sol";
import {IFoilStructs} from "../src/interfaces/IFoilStructs.sol";
import {VirtualToken} from "../src/contracts/VirtualToken.sol";
import {TickMath} from "../src/external/univ3/TickMath.sol";
import "../src/interfaces/external/INonfungiblePositionManager.sol";
import "@uniswap/v3-core/contracts/interfaces/IUniswapV3Pool.sol";
import "@uniswap/v3-core/contracts/interfaces/IUniswapV3Factory.sol";

import "forge-std/console2.sol";

contract FoilTest is Test {
    Foil foil;
    address pool;
    address tokenA;
    address tokenB;
    address constant UNISWAP = 0xC36442b4a4522E871399CD717aBDD847Ab11FE88;
    address constant UNISWAP_QUOTER =
        0xb27308f9F90D607463bb33eA1BeBb41C27CE5AB6;

    function setUp() public {
        // deploy Foil contract
        foil = new Foil(
            1712152320, // startime
            1720051200, // endtime
            UNISWAP, // uniswap
            UNISWAP_QUOTER, // uniswap quoter
            0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266, // resolver
            0x101b9758583F47C63236D831db79247B6eEAdb57, // mintable asset
            7000, // base asset min price
            46000, // base asset max price
            10000 // fee rate
        );

        (pool, tokenA, tokenB) = foil.getEpoch();
        foil.createAccount();
        foil.createAccount();
    }

    function test_addLiquidity() public {
        int24 tickSpacing = IUniswapV3Pool(pool).tickSpacing();
        // int24 lowerTick = TickMath.getTickAtSqrtRatio(
        //     177159557114295710296101716160
        // ); // 5
        // int24 upperTick = TickMath.getTickAtSqrtRatio(
        //     306849353968360525628702781967
        // ); // 15
        IFoilStructs.AddLiquidityParams memory params = IFoilStructs
            .AddLiquidityParams({
                accountId: 1,
                amountTokenA: 50 ether,
                amountTokenB: 50 ether,
                collateralAmount: 10 ether,
                lowerTick: 16000, // 5
                upperTick: 30000 // 20
            });
        foil.addLiquidity(params);

        // (uint256 tokenAmount0, uint256 tokenAmount1) = foil.getPosition(1);

        // console2.log(tokenAmount0, tokenAmount1);

        // // new account!
        // params = IFoilStructs.AddLiquidityParams({
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

    // function test_addLiquidityAndLongs() public {
    //     int24 tickSpacing = IUniswapV3Pool(pool).tickSpacing();
    //     // int24 lowerTick = TickMath.getTickAtSqrtRatio(
    //     //     177159557114295710296101716160
    //     // ); // 5
    //     // int24 upperTick = TickMath.getTickAtSqrtRatio(
    //     //     306849353968360525628702781967
    //     // ); // 15
    //     IFoilStructs.AddLiquidityParams memory params = IFoilStructs
    //         .AddLiquidityParams({
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
    //     params = IFoilStructs.AddLiquidityParams({
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
    //     IFoilStructs.AddLiquidityParams memory params = IFoilStructs
    //         .AddLiquidityParams({
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
    //     params = IFoilStructs.AddLiquidityParams({
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
