// // SPDX-License-Identifier: MIT
// pragma solidity >=0.8.2 <0.9.0;

// import "forge-std/Test.sol";

// import {Foil} from "../src/contracts/Foil.sol";
// import {IFoil} from "../src/interfaces/IFoil.sol";
// import {IFoilStructs} from "../src/interfaces/IFoilStructs.sol";
// import {VirtualToken} from "../src/contracts/VirtualToken.sol";
// import {TickMath} from "../src/external/univ3/TickMath.sol";
// import "../src/interfaces/external/INonfungiblePositionManager.sol";
// import "@uniswap/v3-core/contracts/interfaces/IUniswapV3Pool.sol";
// import "@uniswap/v3-core/contracts/interfaces/IUniswapV3Factory.sol";

// import "forge-std/console2.sol";

// contract FoilSwappedTokensTest is Test {
//     Foil[] foils;
//     address[] pools;
//     address constant UNISWAP = 0x03a520b32C04BF3bEEf7BEb72E919cf822Ed34f1;

//     function setUp() public {
//         for (uint i = 0; i < 10; i++) {
//             address pool;

//             Foil newFoil = new Foil(
//                 1720051200, // endtime
//                 UNISWAP, // uniswap
//                 0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266, // resolver
//                 0x101b9758583F47C63236D831db79247B6eEAdb57, // mintable asset
//                 5 ether, // base asset min price
//                 200 ether, // base asset max price
//                 10000 // fee rate
//             );
//             foils.push(newFoil);
//             newFoil.mint(1);
//             newFoil.mint(2);

//             (pool, , ) = newFoil.getEpoch();
//             pools.push(pool);
//         }
//     }

//     function test_addLiquidityToAll() public {
//         for (uint i = 0; i < 10; i++) {
//             int24 tickSpacing = IUniswapV3Pool(pools[i]).tickSpacing();
//             // int24 lowerTick = TickMath.getTickAtSqrtRatio(
//             //     177159557114295710296101716160
//             // ); // 5
//             // int24 upperTick = TickMath.getTickAtSqrtRatio(
//             //     306849353968360525628702781967
//             // ); // 15
//             IFoilStructs.AddLiquidityParams memory params = IFoilStructs
//                 .AddLiquidityParams({
//                     accountId: 1,
//                     amountTokenA: 10 ether,
//                     amountTokenB: 100 ether,
//                     collateralAmount: 10 ether,
//                     lowerTick: 27000, // 5
//                     upperTick: 30000 // 15
//                 });
//             foils[i].addLiquidity(params);

//             (uint256 tokenAmount0, uint256 tokenAmount1) = foils[i].getPosition(
//                 1
//             );

//             // new account!
//             params = IFoilStructs.AddLiquidityParams({
//                 accountId: 2,
//                 amountTokenA: 100 ether,
//                 amountTokenB: 10 ether,
//                 collateralAmount: 10 ether,
//                 lowerTick: -887200, // minTick
//                 upperTick: 887200 // maxTick
//             });
//             foils[i].addLiquidity(params);

//             (uint256 tokenAmount3, uint256 tokenAmount4) = foils[i].getPosition(
//                 2
//             );
//         }
//     }
// }
