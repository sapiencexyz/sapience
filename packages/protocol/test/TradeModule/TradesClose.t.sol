// SPDX-License-Identifier: MIT
pragma solidity >=0.8.2 <0.9.0;

import "forge-std/Test.sol";
import "cannon-std/Cannon.sol";
import {ISapience} from "../../src/market/interfaces/ISapience.sol";
import {IMintableToken} from "../../src/market/external/IMintableToken.sol";
import {TickMath} from "../../src/market/external/univ3/TickMath.sol";
import {TestTrade} from "../helpers/TestTrade.sol";
import {TestMarket} from "../helpers/TestMarket.sol";
import {TestUser} from "../helpers/TestUser.sol";
import {DecimalPrice} from "../../src/market/libraries/DecimalPrice.sol";
import {SafeCastI256, SafeCastU256} from "@synthetixio/core-contracts/contracts/utils/SafeCast.sol";
import {Position} from "../../src/market/storage/Position.sol";
import {ISapienceStructs} from "../../src/market/interfaces/ISapienceStructs.sol";

import {DecimalMath} from "../../src/market/libraries/DecimalMath.sol";
import "@uniswap/v3-core/contracts/interfaces/IUniswapV3Pool.sol";

contract TradePositionClose is TestTrade {
    using Cannon for Vm;
    using DecimalMath for uint256;
    using DecimalMath for int256;
    using SafeCastI256 for int256;
    using SafeCastU256 for uint256;

    // helper struct
    struct StateData {
        uint256 userCollateral;
        uint256 sapienceCollateral;
        uint256 borrowedVQuote;
        uint256 borrowedVBase;
        uint256 vQuoteAmount;
        uint256 vBaseAmount;
        int256 positionSize;
        uint256 depositedCollateralAmount;
    }

    ISapience sapience;
    IMintableToken collateralAsset;

    address lp1;
    address trader1;
    address trader2;
    uint256 marketId;
    address pool;
    address tokenA;
    address tokenB;
    IUniswapV3Pool uniCastedPool;
    uint256 feeRate;
    int24 MARKET_LOWER_TICK = 16000; //5 (4.952636224061651)
    int24 MARKET_UPPER_TICK = 29800; //20 (19.68488357413147)
    int24 LP_LOWER_TICK = 16000; // (9.973035566235849)
    int24 LP_UPPER_TICK = 29800; // (10.174494074987374)
    uint256 COLLATERAL_FOR_ORDERS = 10 ether;
    uint160 INITIAL_PRICE_SQRT = 250541448375047931186413801569; // 10 (9999999999999999999)
    uint256 INITIAL_PRICE_D18 = 10 ether;
    uint256 INITIAL_PRICE_PLUS_FEE_D18 = 10.1 ether;
    uint256 INITIAL_PRICE_MINUS_FEE_D18 = 9.9 ether;
    uint256 PLUS_FEE_MULTIPLIER_D18 = 1.01 ether;
    uint256 MINUS_FEE_MULTIPLIER_D18 = 0.99 ether;
    uint256 constant MIN_TRADE_SIZE = 10_000; // 10,000 vBase

    function setUp() public {
        collateralAsset = IMintableToken(vm.getAddress("CollateralAsset.Token"));

        uint160 startingSqrtPriceX96 = INITIAL_PRICE_SQRT;

        (sapience,) =
            createMarket(MARKET_LOWER_TICK, MARKET_UPPER_TICK, startingSqrtPriceX96, MIN_TRADE_SIZE, "wstGwei/quote");

        lp1 = TestUser.createUser("LP1", 10_000_000_000 ether);
        trader1 = TestUser.createUser("Trader1", 10_000_000 ether);
        trader2 = TestUser.createUser("Trader2", 10_000_000 ether);

        (ISapienceStructs.MarketData memory marketData,) = sapience.getLatestMarket();
        marketId = marketData.marketId;
        pool = marketData.pool;
        tokenA = marketData.quoteToken;
        tokenB = marketData.baseToken;

        uniCastedPool = IUniswapV3Pool(pool);
        feeRate = uint256(uniCastedPool.fee()) * 1e12;

        // Add liquidity
        vm.startPrank(lp1);
        addLiquidity(sapience, pool, marketId, COLLATERAL_FOR_ORDERS * 100_000, LP_LOWER_TICK, LP_UPPER_TICK); // enough to keep price stable (no slippage)
        vm.stopPrank();
    }

    function test_close_long_loss() public {
        int256 positionSize = 1 ether;

        vm.startPrank(trader1);
        // quote and open a long
        (uint256 requiredCollateral,,) = sapience.quoteCreateTraderPosition(marketId, positionSize);
        // Send more collateral than required, just checking the position can be created/modified
        sapience.createTraderPosition(
            ISapienceStructs.TraderPositionCreateParams({
                marketId: marketId,
                size: positionSize,
                maxCollateral: requiredCollateral * 2,
                deadline: block.timestamp + 30 minutes
            })
        );
        vm.stopPrank();
        movePrice(0.1 ether, positionSize * -100, 1000);
    }

    function test_close_long_profit() public {}

    function test_close_short_loss() public {}

    function test_close_short_profit() public {}

    // //////////////// //
    // Helper functions //
    // //////////////// //

    function movePrice(uint256 expectedRatio, int256 size, uint256 maxIterations) internal {
        uint256 initialPrice = sapience.getReferencePrice(marketId);
        uint256 currentPrice;
        uint256 deltaPrice;
        uint256 priceRatio;

        vm.startPrank(trader2);

        for (uint256 i = 0; i < maxIterations; i++) {
            // quote and open a long
            (uint256 requiredCollateral,,) = sapience.quoteCreateTraderPosition(marketId, size);
            // Send more collateral than required, just checking the position can be created/modified
            sapience.createTraderPosition(
                ISapienceStructs.TraderPositionCreateParams({
                    marketId: marketId,
                    size: size,
                    maxCollateral: requiredCollateral * 2,
                    deadline: block.timestamp + 30 minutes
                })
            );

            currentPrice = sapience.getReferencePrice(marketId);
            deltaPrice = currentPrice > initialPrice ? currentPrice - initialPrice : initialPrice - currentPrice;
            priceRatio = deltaPrice.divDecimal(initialPrice);
            if (priceRatio >= expectedRatio) {
                break;
            }
        }
        vm.startPrank(trader2);
    }

    function getPnl(int256 initialPositionSize) internal {
        // Function implementation commented out
    }

    /*
    function fillPositionState(
        uint256 positionId,
        StateData memory stateData
    ) public {
        Position.Data memory position = sapience.getPosition(positionId);
        stateData.depositedCollateralAmount = position
            .depositedCollateralAmount;
        stateData.vQuoteAmount = position.vQuoteAmount;
        stateData.vBaseAmount = position.vBaseAmount;
        stateData.borrowedVQuote = position.borrowedVQuote;
        stateData.borrowedVBase = position.borrowedVBase;
        stateData.positionSize = sapience.getPositionSize(positionId);
    }

    function fillCollateralStateData(
        address user,
        StateData memory stateData
    ) public view {
        stateData.userCollateral = collateralAsset.balanceOf(user);
        stateData.foilCollateral = collateralAsset.balanceOf(address(sapience));
    }

    function assertPosition(
        address user,
        uint256 positionId,
        StateData memory expectedStateData,
        string memory stage
    ) public returns (StateData memory currentStateData) {
        fillCollateralStateData(user, currentStateData);
        fillPositionState(positionId, currentStateData);

        assertApproxEqRel(
            currentStateData.userCollateral,
            expectedStateData.userCollateral,
            0.0000001 ether,
            string.concat(stage, " userCollateral")
        );
        assertApproxEqRel(
            currentStateData.foilCollateral,
            expectedStateData.foilCollateral,
            0.0000001 ether,
            string.concat(stage, " sapienceCollateral")
        );
        assertEq(
            currentStateData.depositedCollateralAmount,
            expectedStateData.depositedCollateralAmount,
            string.concat(stage, " depositedCollateralAmount")
        );
        assertApproxEqRel(
            currentStateData.positionSize,
            expectedStateData.positionSize,
            0.01 ether,
            string.concat(stage, " positionSize")
        );
        assertApproxEqRel(
            currentStateData.vBaseAmount,
            expectedStateData.vBaseAmount,
            0.001 ether,
            string.concat(stage, " vBaseAmount")
        );
        assertApproxEqRel(
            currentStateData.borrowedVBase,
            expectedStateData.borrowedVBase,
            0.001 ether,
            string.concat(stage, " borrowedVBase")
        );
        assertApproxEqRel(
            currentStateData.vQuoteAmount,
            expectedStateData.vQuoteAmount,
            0.15 ether,
            string.concat(stage, " vQuoteAmount")
        );
        assertApproxEqRel(
            currentStateData.borrowedVQuote,
            expectedStateData.borrowedVQuote,
            0.15 ether,
            string.concat(stage, " borrowedVQuote")
        );
    }
    */
}
