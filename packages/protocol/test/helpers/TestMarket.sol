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
import {ISapience} from "../../src/market/interfaces/ISapience.sol";
import {ISapienceStructs} from "../../src/market/interfaces/ISapienceStructs.sol";
import {DecimalPrice} from "../../src/market/libraries/DecimalPrice.sol";
import {TestUser} from "./TestUser.sol";

contract TestMarket is TestUser {
    using Cannon for Vm;

    uint256 internal constant Q128 = 0x100000000000000000000000000000000;
    uint256 constant CREATE_MARKET_SALT = 4;

    function createMarket(
        int24 minTick,
        int24 maxTick,
        uint160 startingSqrtPriceX96,
        uint256 minTradeSize,
        bytes memory marketClaimStatement
    ) public returns (ISapience, address) {
        address[] memory feeCollectors = new address[](0);
        return
            createMarketWithFeeCollectors(
                minTick,
                maxTick,
                startingSqrtPriceX96,
                feeCollectors,
                minTradeSize,
                marketClaimStatement,
                ""
            );
    }

    function createMarketWithFeeCollectors(
        int24 minTick,
        int24 maxTick,
        uint160 startingSqrtPriceX96,
        address[] memory feeCollectors,
        uint256 minTradeSize,
        bytes memory claimStatementYesOrNumeric,
        bytes memory claimStatementNo
    ) public returns (ISapience, address) {
        address owner = initializeMarketGroup(feeCollectors, minTradeSize);
        ISapience sapience = ISapience(vm.getAddress("Sapience"));

        vm.prank(owner);
        sapience.createMarket(
            ISapienceStructs.MarketCreationParams({
                startTime: block.timestamp,
                endTime: block.timestamp + 30 days,
                startingSqrtPriceX96: startingSqrtPriceX96,
                baseAssetMinPriceTick: minTick,
                baseAssetMaxPriceTick: maxTick,
                salt: CREATE_MARKET_SALT,
                claimStatementYesOrNumeric: claimStatementYesOrNumeric,
                claimStatementNo: claimStatementNo
            })
        );

        return (sapience, owner);
    }

    function initializeMarketGroup(
        address[] memory feeCollectors,
        uint256 minTradeSize
    ) public returns (address) {
        uint256 bondAmount = 5 ether;
        address owner = createUser("Owner", 10_000_000 ether);
        vm.startPrank(0x70997970C51812dc3A010C7d01b50e0d17dc79C8);
        ISapience(vm.getAddress("Sapience")).initializeMarketGroup(
            owner,
            vm.getAddress("CollateralAsset.Token"),
            feeCollectors,
            minTradeSize,
            false,
            ISapienceStructs.MarketParams({
                feeRate: 10000,
                assertionLiveness: 21600,
                bondCurrency: vm.getAddress("BondCurrency.Token"),
                bondAmount: bondAmount,
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

    function settleMarket(
        uint256 marketId,
        uint160 price,
        address owner
    ) internal {
        ISapience sapience = ISapience(vm.getAddress("Sapience"));
        settleMarketWithSapience(sapience, marketId, price, owner);
    }

    function settleMarketWithSapience(
        ISapience sapience,
        uint256 marketId,
        uint160 price,
        address owner
    ) internal {
        IMintableToken bondCurrency = IMintableToken(
            vm.getAddress("BondCurrency.Token")
        );

        (, ISapienceStructs.MarketParams memory marketParams) = sapience
            .getLatestMarket();
        uint256 bondAmount = marketParams.bondAmount;
        bondCurrency.mint(bondAmount * 2, owner);
        vm.startPrank(owner);

        bondCurrency.approve(address(sapience), bondAmount);
        bytes32 assertionId = sapience.submitSettlementPrice(
            ISapienceStructs.SettlementPriceParams({
                marketId: marketId,
                asserter: owner,
                settlementSqrtPriceX96: price
            })
        );
        vm.stopPrank();

        address optimisticOracleV3 = vm.getAddress("UMA.OptimisticOracleV3");
        vm.startPrank(optimisticOracleV3);
        sapience.assertionResolvedCallback(assertionId, true);
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
        ISapience sapience = ISapience(vm.getAddress("Sapience"));
        (ISapienceStructs.MarketData memory marketData, ) = sapience
            .getLatestMarket();
        (uint160 sqrtPriceX96, , , , , , ) = IUniswapV3Pool(marketData.pool)
            .slot0();

        uint160 sqrtPriceAX96 = uint160(TickMath.getSqrtRatioAtTick(lowerTick));
        uint160 sqrtPriceBX96 = uint160(TickMath.getSqrtRatioAtTick(upperTick));

        (loanAmount0, loanAmount1, liquidity) = sapience
            .quoteLiquidityPositionTokens(
                marketData.marketId,
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
        ISapience sapience = ISapience(vm.getAddress("Sapience"));
        (
            ISapienceStructs.MarketData memory marketData,
            ISapienceStructs.MarketParams memory marketParams
        ) = sapience.getLatestMarket();
        (uint160 sqrtPriceX96, , , , , , ) = IUniswapV3Pool(marketData.pool)
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
        ISapience sapience = ISapience(vm.getAddress("Sapience"));

        OwedTokensData memory data;

        (, ISapienceStructs.MarketParams memory marketParams) = sapience
            .getLatestMarket();

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
