// SPDX-License-Identifier: MIT
pragma solidity >=0.8.2 <0.9.0;

import "forge-std/Test.sol";
import "cannon-std/Cannon.sol";
import {LiquidityAmounts} from "../../src/contracts/external/univ3/LiquidityAmounts.sol";
import {INonfungiblePositionManager} from "../../src/contracts/interfaces/external/INonfungiblePositionManager.sol";
import {IUniswapV3Pool} from "@uniswap/v3-core/contracts/interfaces/IUniswapV3Pool.sol";
import {TickMath} from "../../src/contracts/external/univ3/TickMath.sol";
import {IMintableToken} from "../../src/contracts/external/IMintableToken.sol";
import {IFoil} from "../../src/contracts/interfaces/IFoil.sol";
import {IFoilStructs} from "../../src/contracts/interfaces/IFoilStructs.sol";
import {DecimalPrice} from "../../src/contracts/libraries/DecimalPrice.sol";
import {TestUser} from "./TestUser.sol";

import "forge-std/console2.sol";

contract TestEpoch is TestUser {
    using Cannon for Vm;

    function createEpoch(
        int24 minTick,
        int24 maxTick,
        uint160 startingSqrtPriceX96
    ) public returns (IFoil, address) {
        address owner = initializeMarket(minTick, maxTick);
        IFoil foil = IFoil(vm.getAddress("Foil"));

        vm.prank(owner);
        foil.createEpoch(
            block.timestamp,
            block.timestamp + 30 days,
            startingSqrtPriceX96
        );

        return (foil, owner);
    }

    function initializeMarket(
        int24 minTick,
        int24 maxTick
    ) public returns (address) {
        address owner = createUser("Owner", 10_000_000 ether);
        IFoil(vm.getAddress("Foil")).initializeMarket(
            owner,
            vm.getAddress("CollateralAsset.Token"),
            vm.getAddress("Uniswap.NonfungiblePositionManager"),
            vm.getAddress("Uniswap.SwapRouter"),
            vm.getAddress("UMA.OptimisticOracleV3"),
            IFoilStructs.EpochParams({
                baseAssetMinPriceTick: minTick,
                baseAssetMaxPriceTick: maxTick,
                feeRate: 10000,
                assertionLiveness: 3600,
                bondCurrency: vm.getAddress("BondCurrency.Token"),
                bondAmount: 5000000000,
                priceUnit: "wstGwei/gas"
            })
        );

        return owner;
    }

    // helpers
    function getTokenAmountsForCollateralAmount(
        uint256 collateralAmount,
        int24 lowerTick,
        int24 upperTick
    )
        internal
        returns (uint256 loanAmount0, uint256 loanAmount1, uint256 liquidity)
    {
        IFoil foil = IFoil(vm.getAddress("Foil"));
        (uint256 epochId, , , address pool, , , , , , , ) = foil
            .getLatestEpoch();
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

    function getCurrentPositionTokenAmounts(
        uint256 uniswapPositionId,
        int24 lowerTick,
        int24 upperTick
    )
        internal
        returns (
            uint256 amount0,
            uint256 amount1,
            uint256 tokensOwed0,
            uint256 tokensOwed1
        )
    {
        IFoil foil = IFoil(vm.getAddress("Foil"));
        (uint256 epochId, , , address pool, , , , , , , ) = foil
            .getLatestEpoch();
        (uint160 sqrtPriceX96, , , , , , ) = IUniswapV3Pool(pool).slot0();

        (, , address positionManager, , , ) = foil.getMarket();

        (, , , , , , , uint128 liquidity, , , , ) = INonfungiblePositionManager(
            positionManager
        ).positions(uniswapPositionId);

        (amount0, amount1) = LiquidityAmounts.getAmountsForLiquidity(
            sqrtPriceX96,
            TickMath.getSqrtRatioAtTick(lowerTick),
            TickMath.getSqrtRatioAtTick(upperTick),
            liquidity
        );
    }
}
