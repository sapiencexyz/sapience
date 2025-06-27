// SPDX-License-Identifier: MIT
pragma solidity ^0.8.19;

import "forge-std/Test.sol";
import "cannon-std/Cannon.sol";
import {ISapience} from "../../src/market/interfaces/ISapience.sol";
import {IMintableToken} from "../../src/market/external/IMintableToken.sol";
import {TickMath} from "../../src/market/external/univ3/TickMath.sol";
import {TestTrade} from "../helpers/TestTrade.sol";
import {TestMarket} from "../helpers/TestMarket.sol";
import {TestUser} from "../helpers/TestUser.sol";
import {DecimalPrice} from "../../src/market/libraries/DecimalPrice.sol";
import {DecimalMath} from "../../src/market/libraries/DecimalMath.sol";
import {SafeCastI256, SafeCastU256} from "@synthetixio/core-contracts/contracts/utils/SafeCast.sol";
import "@uniswap/v3-core/contracts/interfaces/IUniswapV3Pool.sol";
import {Errors} from "../../src/market/storage/Errors.sol";
import {Position} from "../../src/market/storage/Position.sol";
import {ISapienceStructs} from "../../src/market/interfaces/ISapienceStructs.sol";

contract SettleTradeTest is TestTrade {
    using Cannon for Vm;
    using DecimalMath for uint256;
    using DecimalMath for int256;
    using SafeCastI256 for int256;
    using SafeCastU256 for uint256;

    ISapience sapience;
    IMintableToken collateralAsset;
    IMintableToken bondCurrency;

    address owner;
    address lp1;
    address trader1;
    uint256 marketId;
    address pool;
    address tokenA;
    address tokenB;
    IUniswapV3Pool uniCastedPool;
    uint256 feeRate;
    uint256 COLLATERAL_FOR_ORDERS = 100 ether;
    uint256 INITIAL_PRICE_D18 = 5 ether;
    uint256 INITIAL_PRICE_PLUS_FEE_D18 = 5.05 ether;
    uint256 INITIAL_PRICE_LESS_FEE_D18 = 4.95 ether;
    uint160 INITIAL_PRICE_SQRT = 177159557114295718903631839232; // 5.0
    int24 MARKET_LOWER_TICK = 6800; // 2.0
    int24 MARKET_UPPER_TICK = 27000; // 15.0
    int24 LP_LOWER_TICK = 15800; //3.31
    int24 LP_UPPER_TICK = 16200; //3.52
    uint256 SETTLEMENT_PRICE_D18 = 10 ether;
    uint256 constant MIN_TRADE_SIZE = 10_000; // 10,000 vBase
    uint160 SETTLEMENT_PRICE_SQRT_D18 = 250541448375047946302209916928; // 10.0

    address optimisticOracleV3;
    uint256 endTime;
    uint256 minPriceD18;
    uint256 maxPriceD18;
    ISapienceStructs.MarketParams marketParams;

    function setUp() public {
        collateralAsset = IMintableToken(
            vm.getAddress("CollateralAsset.Token")
        );
        uint160 startingSqrtPriceX96 = INITIAL_PRICE_SQRT;

        (sapience, ) = createMarket(
            5200,
            28200,
            startingSqrtPriceX96,
            MIN_TRADE_SIZE,
            "wstGwei/quote"
        ); // 1.709 to 17.09 (1.6819839204636384 to 16.774485460620674)

        lp1 = TestUser.createUser("LP1", 20_000_000 ether);
        trader1 = TestUser.createUser("Trader1", 20_000_000 ether);

        (
            ISapienceStructs.MarketData memory marketData,
            ISapienceStructs.MarketParams memory _marketParams
        ) = sapience.getLatestMarket();
        marketId = marketData.marketId;
        pool = marketData.pool;
        tokenA = marketData.quoteToken;
        tokenB = marketData.baseToken;
        endTime = marketData.endTime;
        minPriceD18 = marketData.minPriceD18;
        maxPriceD18 = marketData.maxPriceD18;
        marketParams = _marketParams;

        uniCastedPool = IUniswapV3Pool(pool);
        feeRate = uint256(uniCastedPool.fee()) * 1e12;

        vm.startPrank(lp1);
        addLiquidity(
            sapience,
            pool,
            marketId,
            COLLATERAL_FOR_ORDERS * 100_000,
            LP_LOWER_TICK,
            LP_UPPER_TICK
        ); // enough to keep price stable (no slippage)
        vm.stopPrank();

        // Settle the market
        bondCurrency = IMintableToken(vm.getAddress("BondCurrency.Token"));
        optimisticOracleV3 = vm.getAddress("UMA.OptimisticOracleV3");

        (owner, , , ) = sapience.getMarketGroup();

        bondCurrency.mint(marketParams.bondAmount * 2, owner);
    }

    function test_modifyTraderPosition_long_close_UsesSettlementPrice() public {
        settleAndSucced(1 ether);
    }
    function test_modifyTraderPosition_short_close_UsesSettlementPrice()
        public
    {
        settleAndSucced(-1 ether);
    }

    function settleAndSucced(int256 initialPositionSize) internal {
        uint256 trader1InitialBalance = collateralAsset.balanceOf(trader1);

        int256 pnl;
        if (initialPositionSize > 0) {
            // Long: PNL = (Settlement Price - Initial Price) * Position Size
            pnl = initialPositionSize.mulDecimal(
                SETTLEMENT_PRICE_D18.toInt() -
                    INITIAL_PRICE_PLUS_FEE_D18.toInt()
            );
        } else {
            // Short: PNL = (Initial Price - Settlement Price) * Position Size * -1 (positionSize is negative for short)
            pnl =
                -1 *
                initialPositionSize.mulDecimal(
                    INITIAL_PRICE_LESS_FEE_D18.toInt() -
                        SETTLEMENT_PRICE_D18.toInt()
                );
        }

        vm.startPrank(trader1);
        (uint256 requiredCollateral, , ) = sapience.quoteCreateTraderPosition(
            marketId,
            initialPositionSize
        );

        uint256 positionId = sapience.createTraderPosition(
            marketId,
            initialPositionSize,
            requiredCollateral * 2,
            block.timestamp + 30 minutes
        );

        vm.stopPrank();

        settle();

        vm.startPrank(trader1);
        sapience.settlePosition(positionId);
        vm.stopPrank();

        uint256 trader1FinalBalance = collateralAsset.balanceOf(trader1);

        assertApproxEqRel(
            trader1FinalBalance.toInt() - trader1InitialBalance.toInt(),
            pnl,
            0.01 ether,
            "pnl"
        );
    }

    function settle() internal {
        vm.warp(endTime + 1);

        vm.startPrank(owner);
        IMintableToken(marketParams.bondCurrency).approve(
            address(sapience),
            marketParams.bondAmount
        );
        bytes32 assertionId = sapience.submitSettlementPrice(
            marketId,
            owner,
            SETTLEMENT_PRICE_SQRT_D18
        );
        vm.stopPrank();

        vm.startPrank(optimisticOracleV3);
        sapience.assertionResolvedCallback(assertionId, true);
        vm.stopPrank();
    }
}
