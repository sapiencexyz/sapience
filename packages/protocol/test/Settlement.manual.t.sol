// SPDX-License-Identifier: MIT
pragma solidity >=0.8.2 <0.9.0;

import "forge-std/Test.sol";
import "cannon-std/Cannon.sol";
import {ISapience} from "../src/market/interfaces/ISapience.sol";
import {ISapienceStructs} from "../src/market/interfaces/ISapienceStructs.sol";

import {TestTrade} from "./helpers/TestTrade.sol";
import {TestUser} from "./helpers/TestUser.sol";
import {DecimalPrice} from "../src/market/libraries/DecimalPrice.sol";
import {IUniswapV3Pool} from "@uniswap/v3-core/contracts/interfaces/IUniswapV3Pool.sol";
import {Errors} from "../src/market/storage/Errors.sol";

contract ManualSettlementTest is TestTrade {
    using Cannon for Vm;

    ISapience sapience;
    uint256 marketId;
    uint256 endTime;
    uint160 SQRT_PRICE_10Eth = 250541448375047931186413801569;

    address trader1;
    address lp1;

    uint256 lpPositionId;

    function setUp() public {
        lp1 = TestUser.createUser("LP1", 100_000 ether);
        trader1 = TestUser.createUser("Trader1", 100 ether);
        uint160 startingSqrtPriceX96 = SQRT_PRICE_10Eth;
        int24 minTick = 16000;
        int24 maxTick = 29800;
        (sapience,) = createMarket(minTick, maxTick, startingSqrtPriceX96, 10_000, "wstGwei/quote");

        (ISapienceStructs.MarketData memory marketData,) = sapience.getLatestMarket();
        marketId = marketData.marketId;
        endTime = marketData.endTime;

        (uint256 baseTokenAmount, uint256 quoteTokenAmount,) =
            getTokenAmountsForCollateralAmount(10 ether, minTick, maxTick);

        // Create initial position
        vm.startPrank(lp1);
        (lpPositionId,,,,,,) = sapience.createLiquidityPosition(
            ISapienceStructs.LiquidityMintParams({
                marketId: marketId,
                amountBaseToken: baseTokenAmount,
                amountQuoteToken: quoteTokenAmount,
                collateralAmount: 11 ether,
                lowerTick: minTick,
                upperTick: maxTick,
                minAmountBaseToken: 0,
                minAmountQuoteToken: 0,
                deadline: block.timestamp + 30 minutes
            })
        );
        vm.stopPrank();
    }

    function buyGas() internal returns (uint256 traderPositionId) {
        vm.startPrank(trader1);
        traderPositionId = addTraderPosition(sapience, marketId, int256(0.1 ether));
        vm.stopPrank();
    }

    function test_manual_settlement() public {
        buyGas();
        // Get market duration and calculate required delay
        uint256 marketDuration = endTime - block.timestamp;
        uint256 requiredDelay = marketDuration * 2;

        // Warp to after required delay
        vm.warp(endTime + requiredDelay + 1);

        // Get current pool price before settlement
        (ISapienceStructs.MarketData memory marketData,) = sapience.getLatestMarket();
        (uint160 sqrtPriceX96,,,,,,) = IUniswapV3Pool(marketData.pool).slot0();

        // Call manual settlement
        sapience.__manual_setSettlementPrice();

        // Verify settlement occurred
        (marketData,) = sapience.getLatestMarket();
        assertTrue(marketData.settled, "Market should be settled");
        assertEq(
            marketData.settlementPriceD18,
            DecimalPrice.sqrtRatioX96ToPrice(sqrtPriceX96),
            "Settlement price should match"
        );

        // Attempt to settle again should revert
        vm.expectRevert(Errors.MarketSettled.selector);
        sapience.__manual_setSettlementPrice();

        vm.prank(lp1);
        sapience.settlePosition(lpPositionId);
    }

    function test_manual_settlement_reverts_if_too_early() public {
        uint256 marketDuration = endTime - block.timestamp;
        uint256 requiredDelay = marketDuration * 2;
        // Warp to just after market end but before required delay
        vm.warp(requiredDelay - 1);

        // Expect revert when trying to settle too early
        vm.expectRevert();
        sapience.__manual_setSettlementPrice();
    }
}
