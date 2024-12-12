// SPDX-License-Identifier: MIT
pragma solidity >=0.8.2 <0.9.0;

import "forge-std/Test.sol";
import "cannon-std/Cannon.sol";
import {FullMath} from "../../src/market/external/univ3/FullMath.sol";
import {LiquidityAmounts} from "../../src/market/external/univ3/LiquidityAmounts.sol";
import {INonfungiblePositionManager} from "../../src/market/interfaces/external/INonfungiblePositionManager.sol";
import {IUniswapV3Pool} from "@uniswap/v3-core/contracts/interfaces/IUniswapV3Pool.sol";
import {TickMath} from "../../src/market/external/univ3/TickMath.sol";
import {IMintableToken} from "../../src/market/external/IMintableToken.sol";
import {IFoil} from "../../src/market/interfaces/IFoil.sol";
import {IFoilStructs} from "../../src/market/interfaces/IFoilStructs.sol";
import {DecimalPrice} from "../../src/market/libraries/DecimalPrice.sol";
import {TestUser} from "./TestUser.sol";

contract TestEpoch is TestUser {
    using Cannon for Vm;

    uint256 internal constant Q128 = 0x100000000000000000000000000000000;
    uint256 constant CREATE_EPOCH_SALT = 4;

    function createEpoch(
        int24 minTick,
        int24 maxTick,
        uint160 startingSqrtPriceX96,
        uint256 minTradeSize,
        uint256 minCollateral
    ) public returns (IFoil, address) {
        address[] memory feeCollectors = new address[](0);
        return
            createEpochWithFeeCollectors(
                minTick,
                maxTick,
                startingSqrtPriceX96,
                feeCollectors,
                minTradeSize,
                minCollateral
            );
    }

    function createEpochWithFeeCollectors(
        int24 minTick,
        int24 maxTick,
        uint160 startingSqrtPriceX96,
        address[] memory feeCollectors,
        uint256 minTradeSize,
        uint256 minCollateral
    ) public returns (IFoil, address) {
        address owner = initializeMarket(
            feeCollectors,
            address(0),
            minTradeSize,
            minCollateral
        );
        IFoil foil = IFoil(vm.getAddress("Foil"));

        vm.prank(owner);
        foil.createEpoch(
            block.timestamp,
            block.timestamp + 30 days,
            startingSqrtPriceX96,
            minTick,
            maxTick,
            CREATE_EPOCH_SALT
        );

        return (foil, owner);
    }

    function createEpochWithCallback(
        int24 minTick,
        int24 maxTick,
        uint160 startingSqrtPriceX96,
        address callbackRecipient,
        uint256 minTradeSize,
        uint256 minCollateral
    ) public returns (IFoil, address) {
        address[] memory feeCollectors = new address[](0);
        address owner = initializeMarket(
            feeCollectors,
            callbackRecipient,
            minTradeSize,
            minCollateral
        );
        IFoil foil = IFoil(vm.getAddress("Foil"));

        vm.prank(owner);
        foil.createEpoch(
            block.timestamp,
            block.timestamp + 30 days,
            startingSqrtPriceX96,
            minTick,
            maxTick,
            CREATE_EPOCH_SALT
        );

        return (foil, owner);
    }

    function initializeMarket(
        address[] memory feeCollectors,
        address callbackRecipient,
        uint256 minTradeSize,
        uint256 minCollateral
    ) public returns (address) {
        uint256 bondAmount = 5 ether;
        address owner = createUser("Owner", 10_000_000 ether);
        vm.startPrank(0x70997970C51812dc3A010C7d01b50e0d17dc79C8);
        IFoil(vm.getAddress("Foil")).initializeMarket(
            owner,
            vm.getAddress("CollateralAsset.Token"),
            feeCollectors,
            callbackRecipient,
            minTradeSize,
            minCollateral,
            IFoilStructs.MarketParams({
                feeRate: 10000,
                assertionLiveness: 21600,
                bondCurrency: vm.getAddress("BondCurrency.Token"),
                bondAmount: bondAmount,
                claimStatement: "wstGwei/gas",
                uniswapPositionManager: vm.getAddress(
                    "Uniswap.NonfungiblePositionManager"
                ),
                uniswapSwapRouter: vm.getAddress("Uniswap.SwapRouter"),
                uniswapQuoter: vm.getAddress("Uniswap.QuoterV2"),
                optimisticOracleV3: vm.getAddress("UMA.OptimisticOracleV3")
            })
        );
        vm.stopPrank();

        return owner;
    }

    function settleEpoch(
        uint256 epochId,
        uint160 price,
        address owner
    ) internal {
        IFoil foil = IFoil(vm.getAddress("Foil"));
        settleEpochWithFoil(foil, epochId, price, owner);
    }

    function settleEpochWithFoil(
        IFoil foil,
        uint256 epochId,
        uint160 price,
        address owner
    ) internal {
        IMintableToken bondCurrency = IMintableToken(
            vm.getAddress("BondCurrency.Token")
        );

        (, , , , IFoilStructs.MarketParams memory marketParams) = foil
            .getMarket();
        uint256 bondAmount = marketParams.bondAmount;
        bondCurrency.mint(bondAmount * 2, owner);
        vm.startPrank(owner);

        bondCurrency.approve(address(foil), bondAmount);
        bytes32 assertionId = foil.submitSettlementPrice(epochId, owner, price);
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
        view
        returns (uint256 loanAmount0, uint256 loanAmount1, uint256 liquidity)
    {
        IFoil foil = IFoil(vm.getAddress("Foil"));
        (IFoilStructs.EpochData memory epochData, ) = foil.getLatestEpoch();
        (uint160 sqrtPriceX96, , , , , , ) = IUniswapV3Pool(epochData.pool)
            .slot0();

        uint160 sqrtPriceAX96 = uint160(TickMath.getSqrtRatioAtTick(lowerTick));
        uint160 sqrtPriceBX96 = uint160(TickMath.getSqrtRatioAtTick(upperTick));

        (loanAmount0, loanAmount1, liquidity) = foil
            .quoteLiquidityPositionTokens(
                epochData.epochId,
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
        view
        returns (
            uint256 amount0,
            uint256 amount1,
            uint256 tokensOwed0,
            uint256 tokensOwed1,
            uint128 liquidity
        )
    {
        IFoil foil = IFoil(vm.getAddress("Foil"));
        (
            IFoilStructs.EpochData memory epochData,
            IFoilStructs.MarketParams memory marketParams
        ) = foil.getLatestEpoch();
        (uint160 sqrtPriceX96, , , , , , ) = IUniswapV3Pool(epochData.pool)
            .slot0();

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
        ) = INonfungiblePositionManager(marketParams.uniswapPositionManager)
            .positions(uniswapPositionId);

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
    ) internal view returns (uint256 owed0, uint256 owed1) {
        uniswapPositionId;
        IFoil foil = IFoil(vm.getAddress("Foil"));

        OwedTokensData memory data;

        (, , , , IFoilStructs.MarketParams memory marketParams) = foil
            .getMarket();

        // Fetch the current fee growth global values
        data.feeGrowthGlobal0X128 = IUniswapV3Pool(data.pool)
            .feeGrowthGlobal0X128();
        data.feeGrowthGlobal1X128 = IUniswapV3Pool(data.pool)
            .feeGrowthGlobal1X128();

        bytes32 positionKey = keccak256(
            abi.encodePacked(
                address(marketParams.uniswapPositionManager),
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
    }
}
