// SPDX-License-Identifier: MIT
pragma solidity >=0.8.2 <0.9.0;

import "forge-std/Test.sol";

import {Foil} from "../src/contracts/Foil.sol";
import {IFoil} from "../src/interfaces/IFoil.sol";
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
    address constant UNISWAP = 0x03a520b32C04BF3bEEf7BEb72E919cf822Ed34f1;

    function setUp() public {
        // deploy Foil contract
        foil = new Foil(
            1720051200, // endtime
            UNISWAP, // uniswap
            0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266, // resolver
            0x101b9758583F47C63236D831db79247B6eEAdb57, // mintable asset
            5 ether, // base asset min price
            200 ether, // base asset max price
            10000 // fee rate
        );

        (pool, tokenA, tokenB) = foil.getEpoch();
        foil.createAccount(1);
        foil.createAccount(2);
    }

    function test_addLiquidity() public {
        int24 tickSpacing = IUniswapV3Pool(pool).tickSpacing();
        // int24 lowerTick = TickMath.getTickAtSqrtRatio(
        //     177159557114295710296101716160
        // ); // 5
        // int24 upperTick = TickMath.getTickAtSqrtRatio(
        //     306849353968360525628702781967
        // ); // 15
        IFoil.AddLiquidityRuntimeParams memory params = IFoil
            .AddLiquidityRuntimeParams({
                accountId: 1,
                amountTokenA: 10 ether,
                amountTokenB: 100 ether,
                collateralAmount: 10 ether,
                lowerTick: 27000, // 5
                upperTick: 30000 // 15
            });
        foil.addLiquidity(params);

        (uint256 tokenAmount0, uint256 tokenAmount1) = foil.getPosition(1);

        console2.log(tokenAmount0, tokenAmount1);

        // new account!
        params = IFoil.AddLiquidityRuntimeParams({
            accountId: 2,
            amountTokenA: 100 ether,
            amountTokenB: 10 ether,
            collateralAmount: 10 ether,
            lowerTick: -887200, // minTick
            upperTick: 887200 // maxTick
        });
        foil.addLiquidity(params);

        (uint256 tokenAmount3, uint256 tokenAmount4) = foil.getPosition(2);
        console2.log(tokenAmount3, tokenAmount4);
    }
}
