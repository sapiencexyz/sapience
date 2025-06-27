// SPDX-License-Identifier: MIT
pragma solidity >=0.8.2 <0.9.0;

import "forge-std/Test.sol";
import "../../src/market/storage/MarketGroup.sol";
import "../../src/market/libraries/DecimalMath.sol";

// Direct test of the decimal handling logic
contract CollateralDecimals8Test is Test {
    using MarketGroup for MarketGroup.Data;
    using DecimalMath for uint256;

    function setUp() public {
        // Initialize storage slot for MarketGroup
        MarketGroup.Data storage marketGroup = MarketGroup.load();
        marketGroup.collateralDecimals = 8; // WBTC decimals
        marketGroup.collateralScalingFactor = 10 ** (18 - 8); // 1e10
    }

    function test_NormalizationFrom8To18Decimals() public view {
        MarketGroup.Data storage marketGroup = MarketGroup.load();

        // Test various WBTC amounts (8 decimals)
        uint256 oneWBTC = 1e8;
        uint256 normalized = marketGroup.normalizeCollateralAmount(oneWBTC);
        assertEq(normalized, 1e18, "1 WBTC should normalize to 1e18");

        // Test fractional amount
        uint256 halfWBTC = 5e7; // 0.5 WBTC
        normalized = marketGroup.normalizeCollateralAmount(halfWBTC);
        assertEq(normalized, 5e17, "0.5 WBTC should normalize to 0.5e18");

        // Test small amount (1 satoshi)
        uint256 oneSatoshi = 1;
        normalized = marketGroup.normalizeCollateralAmount(oneSatoshi);
        assertEq(normalized, 1e10, "1 satoshi should normalize to 1e10");

        // Test large amount
        uint256 thousandWBTC = 1000 * 1e8;
        normalized = marketGroup.normalizeCollateralAmount(thousandWBTC);
        assertEq(
            normalized,
            1000 * 1e18,
            "1000 WBTC should normalize correctly"
        );
    }

    function test_DenormalizationFrom18To8Decimals() public view {
        MarketGroup.Data storage marketGroup = MarketGroup.load();

        // Test denormalization
        uint256 amount18 = 1e18;
        uint256 denormalized = marketGroup.denormalizeCollateralAmount(
            amount18
        );
        assertEq(denormalized, 1e8, "1e18 should denormalize to 1 WBTC");

        // Test that can't have more precision than 8 decimals
        uint256 tinyAmount18 = 1e9; // Less than 1 satoshi in 18 decimals
        denormalized = marketGroup.denormalizeCollateralAmount(tinyAmount18);
        assertEq(
            denormalized,
            0,
            "Amount smaller than 1 satoshi should round to 0"
        );

        // Test exact satoshi boundary
        uint256 satoshi18 = 1e10;
        denormalized = marketGroup.denormalizeCollateralAmount(satoshi18);
        assertEq(denormalized, 1, "1e10 should denormalize to 1 satoshi");
    }

    function test_RoundTripConversion() public view {
        MarketGroup.Data storage marketGroup = MarketGroup.load();

        // Test various amounts for round-trip conversion
        uint256[] memory testAmounts = new uint256[](6);
        testAmounts[0] = 1;
        testAmounts[1] = 12345678; // 0.12345678 WBTC
        testAmounts[2] = 1e8; // 1 WBTC
        testAmounts[3] = 123456 * 1e8; // 123,456 WBTC
        testAmounts[4] = 21000000 * 1e8; // 21M WBTC (max supply)
        testAmounts[5] = type(uint256).max / 1e10; // Near max that won't overflow

        for (uint i = 0; i < testAmounts.length; i++) {
            uint256 original = testAmounts[i];
            uint256 normalized = marketGroup.normalizeCollateralAmount(
                original
            );
            uint256 denormalized = marketGroup.denormalizeCollateralAmount(
                normalized
            );

            assertEq(
                denormalized,
                original,
                string.concat("Round trip failed at index ", vm.toString(i))
            );
        }
    }

    function test_DenormalizeCollateralAmountUp() public view {
        MarketGroup.Data storage marketGroup = MarketGroup.load();

        // Test exact division - should return same as regular denormalize
        uint256 exactAmount = 1e18; // 1 token in 18 decimals
        uint256 regular = marketGroup.denormalizeCollateralAmount(exactAmount);
        uint256 roundedUp = marketGroup.denormalizeCollateralAmountUp(
            exactAmount
        );
        assertEq(regular, roundedUp, "Exact amounts should be equal");

        // Test amount that requires rounding
        uint256 fractionalAmount = 1e9; // 0.000000001 in 18 decimals
        regular = marketGroup.denormalizeCollateralAmount(fractionalAmount);
        roundedUp = marketGroup.denormalizeCollateralAmountUp(fractionalAmount);
        assertEq(regular, 0, "Regular denormalize should round down to 0");
        assertEq(roundedUp, 1, "Round up should give 1 satoshi");

        // Test amount just above 1 satoshi
        uint256 aboveSatoshi = 1e10 + 1; // 1 satoshi + 1 wei in 18 decimals
        regular = marketGroup.denormalizeCollateralAmount(aboveSatoshi);
        roundedUp = marketGroup.denormalizeCollateralAmountUp(aboveSatoshi);
        assertEq(regular, 1, "Regular should round down to 1 satoshi");
        assertEq(roundedUp, 2, "Round up should give 2 satoshis");

        // Test large amount with remainder
        uint256 largeAmount = 123456789012345678; // Large amount in 18 decimals
        regular = marketGroup.denormalizeCollateralAmount(largeAmount);
        roundedUp = marketGroup.denormalizeCollateralAmountUp(largeAmount);
        uint256 remainder = largeAmount % marketGroup.collateralScalingFactor;
        if (remainder > 0) {
            assertEq(
                roundedUp,
                regular + 1,
                "Round up should be 1 unit higher when there's remainder"
            );
        } else {
            assertEq(roundedUp, regular, "Should be equal when no remainder");
        }
    }

    function test_NormalizeSignedCollateralAmount() public view {
        MarketGroup.Data storage marketGroup = MarketGroup.load();

        // Test zero
        int256 result = marketGroup.normalizeSignedCollateralAmount(0);
        assertEq(result, 0, "Zero should remain zero");

        // Test positive amount
        int256 positiveAmount = 1e8; // 1 WBTC
        result = marketGroup.normalizeSignedCollateralAmount(positiveAmount);
        assertEq(result, 1e18, "1 WBTC should normalize to 1e18");

        // Test negative amount
        int256 negativeAmount = -5e7; // -0.5 WBTC
        result = marketGroup.normalizeSignedCollateralAmount(negativeAmount);
        assertEq(result, -5e17, "-0.5 WBTC should normalize to -0.5e18");

        // Test large negative amount
        int256 largeNegative = -1000 * 1e8; // -1000 WBTC
        result = marketGroup.normalizeSignedCollateralAmount(largeNegative);
        assertEq(result, -1000 * 1e18, "-1000 WBTC should normalize correctly");

        // Test edge case: -1 satoshi
        int256 negativeSatoshi = -1;
        result = marketGroup.normalizeSignedCollateralAmount(negativeSatoshi);
        assertEq(result, -1e10, "-1 satoshi should normalize to -1e10");
    }

    function test_CompareWith6Decimals() public {
        // Test with USDC-like token (6 decimals)
        MarketGroup.Data storage marketGroup = MarketGroup.load();
        marketGroup.collateralDecimals = 6;
        marketGroup.collateralScalingFactor = 10 ** (18 - 6); // 1e12

        uint256 oneUSDC = 1e6;
        uint256 normalized = marketGroup.normalizeCollateralAmount(oneUSDC);
        assertEq(normalized, 1e18, "1 USDC should normalize to 1e18");

        uint256 denormalized = marketGroup.denormalizeCollateralAmount(
            normalized
        );
        assertEq(denormalized, oneUSDC, "Should denormalize back to 1 USDC");
    }

    function test_CompareWith18Decimals() public {
        // Test with standard 18 decimal token
        MarketGroup.Data storage marketGroup = MarketGroup.load();
        marketGroup.collateralDecimals = 18;
        marketGroup.collateralScalingFactor = 1; // No scaling needed

        uint256 oneToken = 1e18;
        uint256 normalized = marketGroup.normalizeCollateralAmount(oneToken);
        assertEq(normalized, oneToken, "18 decimal token should not change");

        uint256 denormalized = marketGroup.denormalizeCollateralAmount(
            normalized
        );
        assertEq(denormalized, oneToken, "Should remain the same");
    }

    function testFuzz_NormalizationConsistency(
        uint8 decimals,
        uint256 amount
    ) public {
        // Limit decimals to reasonable range
        decimals = uint8(bound(decimals, 0, 18));

        // Limit amount to prevent overflow
        uint256 maxAmount = type(uint256).max / (10 ** (18 - decimals));
        amount = bound(amount, 0, maxAmount);

        MarketGroup.Data storage marketGroup = MarketGroup.load();
        marketGroup.collateralDecimals = decimals;
        marketGroup.collateralScalingFactor = decimals < 18
            ? 10 ** (18 - decimals)
            : 1;

        uint256 normalized = marketGroup.normalizeCollateralAmount(amount);
        uint256 denormalized = marketGroup.denormalizeCollateralAmount(
            normalized
        );

        // For 18 decimal tokens, no precision loss
        if (decimals == 18) {
            assertEq(
                denormalized,
                amount,
                "18 decimal round trip should be exact"
            );
        } else {
            // For other decimals, we might lose precision on very small amounts
            // but the round trip should work for amounts >= 1 unit
            if (amount >= 1) {
                assertEq(
                    denormalized,
                    amount,
                    "Round trip should preserve value"
                );
            }
        }

        // Normalized value should always be amount * 10^(18-decimals)
        uint256 expectedNormalized = decimals < 18
            ? amount * (10 ** (18 - decimals))
            : amount;
        assertEq(
            normalized,
            expectedNormalized,
            "Normalization formula incorrect"
        );
    }
}
