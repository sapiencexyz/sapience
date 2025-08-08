// SPDX-License-Identifier: MIT
pragma solidity >=0.8.2 <0.9.0;

import "forge-std/Test.sol";
import "../../src/market/storage/MarketGroup.sol";
import "../../src/market/storage/Position.sol";
import "../../src/market/libraries/DecimalMath.sol";

// Test to ensure backward compatibility with 18 decimal tokens
contract BackwardCompatibilityTest is Test {
    using MarketGroup for MarketGroup.Data;
    using Position for Position.Data;
    using DecimalMath for uint256;

    function setUp() public {
        // Setup MarketGroup storage with standard 18 decimal token (like WETH)
        MarketGroup.Data storage marketGroup = MarketGroup.load();
        marketGroup.collateralDecimals = 18;
        marketGroup.collateralScalingFactor = 1; // No scaling for 18 decimals
    }

    function test_18DecimalTokenNoScaling() public view {
        MarketGroup.Data storage marketGroup = MarketGroup.load();

        // Test that 18 decimal tokens pass through unchanged
        uint256 amount = 123456789 * 1e18;

        uint256 normalized = marketGroup.normalizeCollateralAmount(amount);
        assertEq(normalized, amount, "18 decimal normalization should be identity");

        uint256 denormalized = marketGroup.denormalizeCollateralAmount(amount);
        assertEq(denormalized, amount, "18 decimal denormalization should be identity");
    }

    function test_NoOverflowOn18Decimals() public view {
        MarketGroup.Data storage marketGroup = MarketGroup.load();

        // Test with very large amounts
        uint256 largeAmount = type(uint256).max / 2;

        uint256 normalized = marketGroup.normalizeCollateralAmount(largeAmount);
        assertEq(normalized, largeAmount, "Large amounts should work");

        uint256 denormalized = marketGroup.denormalizeCollateralAmount(largeAmount);
        assertEq(denormalized, largeAmount, "Large amounts should work in reverse");
    }

    function test_ScalingFactorCorrect() public {
        // Test scaling factors for different decimals
        MarketGroup.Data storage marketGroup = MarketGroup.load();

        // 18 decimals = no scaling
        assertEq(marketGroup.collateralScalingFactor, 1, "18 decimals should have factor of 1");

        // Test other decimal configurations
        marketGroup.collateralDecimals = 6;
        marketGroup.collateralScalingFactor = 10 ** (18 - 6);
        assertEq(marketGroup.collateralScalingFactor, 1e12, "6 decimals should have factor of 1e12");

        marketGroup.collateralDecimals = 8;
        marketGroup.collateralScalingFactor = 10 ** (18 - 8);
        assertEq(marketGroup.collateralScalingFactor, 1e10, "8 decimals should have factor of 1e10");

        marketGroup.collateralDecimals = 0;
        marketGroup.collateralScalingFactor = 10 ** (18 - 0);
        assertEq(marketGroup.collateralScalingFactor, 1e18, "0 decimals should have factor of 1e18");
    }
}
