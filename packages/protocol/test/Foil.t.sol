// SPDX-License-Identifier: MIT
pragma solidity >=0.8.2 <0.9.0;

import "forge-std/Test.sol";
import "cannon-std/Cannon.sol";

//import {Foil} from "../src/contracts/Foil.sol";
import {IFoil} from "../src/contracts/interfaces/IFoil.sol";
import {IFoilStructs} from "../src/contracts/interfaces/IFoilStructs.sol";
import {VirtualToken} from "../src/contracts/external/VirtualToken.sol";
import {TickMath} from "../src/contracts/external/univ3/TickMath.sol";
import {IMintableToken} from "../src/contracts/external/IMintableToken.sol";
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
    uint256 epochStartTime;

    IMintableToken collateralAsset;

    function setUp() public {
        foil = IFoil(vm.getAddress("Foil"));
        collateralAsset = IMintableToken(
            vm.getAddress("CollateralAsset.Token")
        );
        collateralAsset.mint(1000 ether, address(this));
        collateralAsset.approve(address(foil), 1000 ether);

        (epochStartTime, , , , ) = foil.getLatestEpoch();
    }

    function test_addLiquidity() public {
        console2.logAddress(address(this));
        console2.log("BALANCE", collateralAsset.balanceOf(address(this)));
        // int24 tickSpacing = IUniswapV3Pool(pool).tickSpacing();
        // int24 lowerTick = TickMath.getTickAtSqrtRatio(
        //     177159557114295710296101716160
        // ); // 5
        // int24 upperTick = TickMath.getTickAtSqrtRatio(
        //     306849353968360525628702781967
        // ); // 15
        uint160 sqrtPriceX96 = 146497135921788803112962621440;
        uint160 sqrtPriceAX96 = 176318465955219228901572735582;
        uint160 sqrtPriceBX96 = 273764932352251420676860998407;
        (uint256 loanAmount0, uint256 loanAmount1, ) = foil.getTokenAmounts(
            epochStartTime,
            50 ether,
            sqrtPriceX96,
            sqrtPriceAX96,
            sqrtPriceBX96
        );

        IFoilStructs.LiquidityPositionParams memory params = IFoilStructs
            .LiquidityPositionParams({
                epochId: epochStartTime,
                amountTokenA: loanAmount0,
                amountTokenB: loanAmount1,
                depositedCollateralAmount: 50 ether,
                lowerTick: 16000,
                upperTick: 24800,
                minAmountTokenA: 0,
                minAmountTokenB: 0
            });
        (
            uint256 tokenId,
            uint128 liquidity,
            uint256 amount0,
            uint256 amount1
        ) = foil.createLiquidityPosition(params);

        assertEq(collateralAsset.balanceOf(address(foil)), 50 ether);

        uint128 halfLiquidity = liquidity / 2;
        uint256 coll = 25 ether;

        foil.decreaseLiquidityPosition(tokenId, coll, halfLiquidity, 0, 0);

        assertEq(collateralAsset.balanceOf(address(foil)), 25 ether);

        coll = 500 ether;

        foil.increaseLiquidityPosition(
            tokenId,
            coll,
            amount0 * 2,
            amount1 * 2,
            0,
            0
        );

        assertEq(collateralAsset.balanceOf(address(foil)), 500 ether);

        // (uint256 tokenAmount0, uint256 tokenAmount1) = foil.getPosition(1);
        // console2.log(tokenAmount0, tokenAmount1);
        // // new account!
        // params = IFoilStructs.LiquidityPositionParams({
        //     positionId: 2,
        //     amountTokenA: 100 ether,
        //     amountTokenB: 10 ether,
        //     depositedCollateralAmount: 10 ether,
        //     lowerTick: -887200, // minTick
        //     upperTick: 887200 // maxTick
        // });
        // foil.addLiquidity(params);
        // (uint256 tokenAmount3, uint256 tokenAmount4) = foil.getPosition(2);
        // console2.log(tokenAmount3, tokenAmount4);
    }
}
