// SPDX-License-Identifier: MIT
pragma solidity >=0.8.2 <0.9.0;

import "forge-std/Test.sol";
import "cannon-std/Cannon.sol";
import {FullMath} from "../../src/contracts/external/univ3/FullMath.sol";
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

    uint256 constant BOND_AMOUNT = 5 ether;
    uint256 internal constant Q128 = 0x100000000000000000000000000000000;

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
            IFoilStructs.EpochParams({
                baseAssetMinPriceTick: minTick,
                baseAssetMaxPriceTick: maxTick,
                feeRate: 10000,
                assertionLiveness: 3600,
                bondCurrency: vm.getAddress("BondCurrency.Token"),
                bondAmount: BOND_AMOUNT,
                priceUnit: "wstGwei/gas",
                uniswapPositionManager: vm.getAddress("Uniswap.NonfungiblePositionManager"),
                uniswapSwapRouter: vm.getAddress("Uniswap.SwapRouter"),
                uniswapQuoter: vm.getAddress("Uniswap.Quoter"),
                optimisticOracleV3: vm.getAddress("UMA.OptimisticOracleV3")
            })
        );

        return owner;
    }

    function settleEpoch(
        uint256 epochId,
        uint256 price,
        address owner
    ) internal {
        IMintableToken bondCurrency = IMintableToken(
            vm.getAddress("BondCurrency.Token")
        );
        IFoil foil = IFoil(vm.getAddress("Foil"));
        bondCurrency.mint(BOND_AMOUNT * 2, owner);
        vm.startPrank(owner);

        bondCurrency.approve(address(foil), BOND_AMOUNT);
        bytes32 assertionId = foil.submitSettlementPrice(epochId, price);
        vm.stopPrank();

        address optimisticOracleV3 = vm.getAddress("UMA.OptimisticOracleV3");
        vm.startPrank(optimisticOracleV3);
        foil.assertionResolvedCallback(assertionId, true);
        vm.stopPrank();
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
            uint256 tokensOwed1,
            uint128 liquidity
        )
    {
        IFoil foil = IFoil(vm.getAddress("Foil"));
        (, , , address pool, , , , , , , IFoilStructs.EpochParams memory epochParams) = foil.getLatestEpoch();
        (uint160 sqrtPriceX96, , , , , , ) = IUniswapV3Pool(pool).slot0();

        (
            ,
            ,
            ,
            ,
            ,
            ,
            ,
            liquidity,
            ,
            ,
            tokensOwed0,
            tokensOwed1
        ) = INonfungiblePositionManager(epochParams.uniswapPositionManager).positions(
            uniswapPositionId
        );

        (amount0, amount1) = LiquidityAmounts.getAmountsForLiquidity(
            sqrtPriceX96,
            TickMath.getSqrtRatioAtTick(lowerTick),
            TickMath.getSqrtRatioAtTick(upperTick),
            liquidity
        );
    }

    struct OwedTokensData {
        address positionManager;
        address pool;
        int24 tickLower;
        int24 tickUpper;
        uint128 liquidity;
        uint256 feeGrowthInside0LastX128;
        uint256 feeGrowthInside1LastX128;
        uint128 tokensOwed0;
        uint128 tokensOwed1;
        uint256 feeGrowthInside0X128;
        uint256 feeGrowthInside1X128;
        uint256 feeGrowthGlobal0X128;
        uint256 feeGrowthGlobal1X128;
    }

    function getOwedTokens(
        uint256 uniswapPositionId
    ) internal returns (uint256 owed0, uint256 owed1) {
        uniswapPositionId;
        console2.log("IN GETOWEDTOKENS");
        IFoil foil = IFoil(vm.getAddress("Foil"));

        OwedTokensData memory data;

        (, , epochParams) = foil.getMarket();

        // Fetch the current fee growth global values
        data.feeGrowthGlobal0X128 = IUniswapV3Pool(data.pool)
            .feeGrowthGlobal0X128();
        data.feeGrowthGlobal1X128 = IUniswapV3Pool(data.pool)
            .feeGrowthGlobal1X128();

        console2.log("feeGrowthGlobal0X128", data.feeGrowthGlobal0X128);
        console2.log("feeGrowthGlobal1X128", data.feeGrowthGlobal1X128);

        (, , , data.pool, , , , , , , ) = foil.getLatestEpoch();

        bytes32 positionKey = keccak256(
            abi.encodePacked(
                address(data.positionManager),
                data.tickLower,
                data.tickUpper
            )
        );
        (
            ,
            data.feeGrowthInside0X128,
            data.feeGrowthInside1X128,
            ,

        ) = IUniswapV3Pool(data.pool).positions(positionKey);

        uint256 tokensOwed0Additional = FullMath.mulDiv(
            data.feeGrowthGlobal0X128 - data.feeGrowthInside0LastX128,
            data.liquidity,
            Q128
        );
        uint256 tokensOwed1Additional = FullMath.mulDiv(
            data.feeGrowthGlobal1X128 - data.feeGrowthInside1LastX128,
            data.liquidity,
            Q128
        );

        owed0 = uint256(data.tokensOwed0) + tokensOwed0Additional;
        owed1 = uint256(data.tokensOwed1) + tokensOwed1Additional;
        console2.log("OUT OF GETOWEDTOKENS");
    }
}
