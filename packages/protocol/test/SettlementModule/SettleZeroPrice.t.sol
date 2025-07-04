// SPDX-License-Identifier: MIT
pragma solidity ^0.8.19;

import "forge-std/Test.sol";
import {Market} from "../../src/market/storage/Market.sol";
import {DecimalPrice} from "../../src/market/libraries/DecimalPrice.sol";
import {TickMath} from "../../src/market/external/univ3/TickMath.sol";

contract SettleZeroPriceTest is Test {
    using Market for Market.Data;

    function setUp() public {
        // Initialize a market in storage for testing
        Market.Data storage market = Market.load(1);
        market.id = 1;

        // Set simple min/max prices for testing
        market.minPriceD18 = 0.000000001e18; // Very small but not 0
        market.maxPriceD18 = 1000e18;
        market.endTime = block.timestamp + 1 days;
    }

    function test_setSettlementPriceInRange_AcceptsZero() public {
        Market.Data storage market = Market.load(1);

        // Test that 0 is accepted as-is
        uint256 result = market.setSettlementPriceInRange(0);

        assertEq(result, 0, "Should return 0");
        assertEq(market.settlementPriceD18, 0, "Should set settlement price to 0");
        assertTrue(market.settled, "Market should be marked as settled");
    }

    function test_setSettlementPriceInRange_StillClampsNonZero() public {
        Market.Data storage market = Market.load(1);

        // First, verify our test setup
        assertGt(market.minPriceD18, 0, "Min price should be set and > 0");
        assertLt(market.minPriceD18, market.maxPriceD18, "Min should be less than max");

        // Test that small non-zero values still get clamped to min
        uint256 verySmallPrice = 1; // 1 wei, definitely smaller than min
        uint256 result = market.setSettlementPriceInRange(verySmallPrice);

        assertEq(result, market.minPriceD18, "Small non-zero price should clamp to min");
        assertGt(result, verySmallPrice, "Should have clamped up to min");

        // Reset for next test
        market.settled = false;

        // Test that large values still get clamped to max
        uint256 veryLargePrice = 10000e18;
        result = market.setSettlementPriceInRange(veryLargePrice);

        assertEq(result, market.maxPriceD18, "Large price should clamp to max");
        assertLt(result, veryLargePrice, "Should have clamped down");
    }

    function test_setSettlementPriceInRange_NormalPriceUnchanged() public {
        Market.Data storage market = Market.load(1);

        // Test that prices within range are unchanged
        uint256 normalPrice = 0.5e18; // 50% for yes/no market
        uint256 result = market.setSettlementPriceInRange(normalPrice);

        assertEq(result, normalPrice, "Normal price should be unchanged");
        assertEq(market.settlementPriceD18, normalPrice, "Should set exact price");
    }
}
