// // SPDX-License-Identifier: MIT
// pragma solidity >=0.8.2 <0.9.0;

// import "forge-std/Test.sol";
// import "cannon-std/Cannon.sol";

// //import {Foil} from "../src/contracts/Foil.sol";
// import {IFoil} from "../src/contracts/interfaces/IFoil.sol";
// import {IFoilStructs} from "../src/contracts/interfaces/IFoilStructs.sol";
// import {VirtualToken} from "../src/contracts/external/VirtualToken.sol";
// import {TickMath} from "../src/contracts/external/univ3/TickMath.sol";
// import {IMintableToken} from "../src/contracts/external/IMintableToken.sol";
// import {DecimalPrice} from "../src/contracts/libraries/DecimalPrice.sol";
// import "../src/contracts/interfaces/external/INonfungiblePositionManager.sol";
// import "@uniswap/v3-core/contracts/interfaces/IUniswapV3Pool.sol";

// import "forge-std/console2.sol";

// contract FoilTest is Test {
//     using Cannon for Vm;

//     IFoil foil;
//     address constant foilAddress = 0xa886ec907D6529D8f7d0b74a181f709A6a5809fD;
//     address pool;
//     address tokenA;
//     address tokenB;
//     address constant UNISWAP = 0xC36442b4a4522E871399CD717aBDD847Ab11FE88;
//     address constant UNISWAP_QUOTER =
//         0xb27308f9F90D607463bb33eA1BeBb41C27CE5AB6;
//     uint256 epochId;

//     IMintableToken collateralAsset;

//     function setUp() public {
//         foil = IFoil(vm.getAddress("Foil"));
//         collateralAsset = IMintableToken(
//             vm.getAddress("CollateralAsset.Token")
//         );
//         collateralAsset.mint(10_000_000 ether, address(this));
//         collateralAsset.approve(address(foil), 10_000_000 ether);

//         (epochId, , , pool, tokenA, tokenB) = foil.getLatestEpoch();
//     }

//     function test_addLiquidity() public {
//         console2.logAddress(address(this));
//         console2.log("BALANCE", collateralAsset.balanceOf(address(this)));
//         // int24 tickSpacing = IUniswapV3Pool(pool).tickSpacing();
//         // int24 lowerTick = TickMath.getTickAtSqrtRatio(
//         //     177159557114295710296101716160
//         // ); // 5
//         // int24 upperTick = TickMath.getTickAtSqrtRatio(
//         //     306849353968360525628702781967
//         // ); // 15

//         uint256 collateralAmount = 1 ether;
//         int24 lowerTick = 12200;
//         int24 upperTick = 12400;

//         (
//             uint256 loanAmount0,
//             uint256 loanAmount1,

//         ) = getTokenAmountsForCollateralAmount(
//                 collateralAmount,
//                 lowerTick,
//                 upperTick
//             );

//         console2.log("loanAmount0", loanAmount0);
//         console2.log("loanAmount1", loanAmount1);

//         IFoilStructs.LiquidityPositionParams memory params = IFoilStructs
//             .LiquidityPositionParams({
//                 epochId: epochId,
//                 amountTokenA: loanAmount0,
//                 amountTokenB: loanAmount1,
//                 collateralAmount: 1 ether,
//                 lowerTick: lowerTick,
//                 upperTick: upperTick,
//                 minAmountTokenA: 0,
//                 minAmountTokenB: 0
//             });
//         (
//             uint256 tokenId,
//             uint128 liquidity,
//             uint256 amount0,
//             uint256 amount1
//         ) = foil.createLiquidityPosition(params);

//         assertEq(collateralAsset.balanceOf(address(foil)), 1 ether);

//         // uint128 halfLiquidity = liquidity / 2;
//         // uint256 coll = 25 ether;

//         // foil.decreaseLiquidityPosition(tokenId, coll, halfLiquidity, 0, 0);

//         // assertEq(collateralAsset.balanceOf(address(foil)), 25 ether);

//         // coll = 500 ether;

//         // foil.increaseLiquidityPosition(
//         //     tokenId,
//         //     coll,
//         //     amount0 * 2,
//         //     amount1 * 2,
//         //     0,
//         //     0
//         // );

//         // assertEq(collateralAsset.balanceOf(address(foil)), 500 ether);

//         // (uint256 tokenAmount0, uint256 tokenAmount1) = foil.getPosition(1);
//         // console2.log(tokenAmount0, tokenAmount1);
//         // // new account!
//         // params = IFoilStructs.LiquidityPositionParams({
//         //     positionId: 2,
//         //     amountTokenA: 100 ether,
//         //     amountTokenB: 10 ether,
//         //     collateralAmount: 10 ether,
//         //     lowerTick: -887200, // minTick
//         //     upperTick: 887200 // maxTick
//         // });
//         // foil.addLiquidity(params);
//         // (uint256 tokenAmount3, uint256 tokenAmount4) = foil.getPosition(2);
//         // console2.log(tokenAmount3, tokenAmount4);
//     }

//     function getTokenAmountsForCollateralAmount(
//         uint256 collateralAmount,
//         int24 lowerTick,
//         int24 upperTick
//     )
//         public
//         view
//         returns (uint256 loanAmount0, uint256 loanAmount1, uint256 liquidity)
//     {
//         (uint160 sqrtPriceX96, , , , , , ) = IUniswapV3Pool(pool).slot0();

//         uint160 sqrtPriceAX96 = uint160(TickMath.getSqrtRatioAtTick(lowerTick));
//         uint160 sqrtPriceBX96 = uint160(TickMath.getSqrtRatioAtTick(upperTick));

//         (loanAmount0, loanAmount1, liquidity) = foil.getTokenAmounts(
//             epochId,
//             collateralAmount,
//             sqrtPriceX96,
//             sqrtPriceAX96,
//             sqrtPriceBX96
//         );
//     }
// }
