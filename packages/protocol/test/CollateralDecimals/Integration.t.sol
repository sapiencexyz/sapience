// SPDX-License-Identifier: MIT
pragma solidity >=0.8.2 <0.9.0;

import "forge-std/Test.sol";
import "../../src/market/storage/MarketGroup.sol";
import "../../src/market/storage/Position.sol";
import "../../src/market/libraries/DecimalMath.sol";
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import "../../src/market/storage/Errors.sol";

// Simple test to verify the integration of decimal handling in Position.updateCollateral
contract CollateralDecimalsIntegrationTest is Test {
    using MarketGroup for MarketGroup.Data;
    using Position for Position.Data;
    using SafeERC20 for IERC20;
    using DecimalMath for uint256;

    // Mock token contract that will be deployed at specific address
    address constant MOCK_TOKEN = address(0x1234);
    address constant USER = address(0x5678);

    function setUp() public {
        // Setup MarketGroup storage with 8 decimal token
        MarketGroup.Data storage marketGroup = MarketGroup.load();
        marketGroup.collateralDecimals = 8;
        marketGroup.collateralScalingFactor = 1e10;
        marketGroup.collateralAsset = IERC20(MOCK_TOKEN);

        // Mock the token behavior
        vm.mockCall(
            MOCK_TOKEN,
            abi.encodeWithSelector(IERC20.balanceOf.selector, address(this)),
            abi.encode(1000 * 1e8) // 1000 WBTC
        );

        // Setup position
        Position.Data storage position = Position.load(1);
        position.id = 1;
        position.depositedCollateralAmount = 50 * 1e18; // 50 tokens in 18 decimals
    }

    function test_UpdateCollateralIncrease() public {
        Position.Data storage position = Position.load(1);

        // User wants to deposit 10 more WBTC
        uint256 newTotal18 = 60 * 1e18; // 60 total in 18 decimals

        // Mock the transferFrom for 10 WBTC (in 8 decimals)
        vm.mockCall(
            MOCK_TOKEN,
            abi.encodeWithSelector(
                IERC20.transferFrom.selector,
                USER,
                address(this),
                10 * 1e8 // 10 WBTC in 8 decimals
            ),
            abi.encode(true)
        );

        vm.prank(USER);
        int256 delta = position.updateCollateral(newTotal18);

        assertEq(delta, int256(10 * 1e18), "Delta should be 10e18");
        assertEq(position.depositedCollateralAmount, newTotal18, "Should update to 60e18");
    }

    function test_UpdateCollateralDecrease() public {
        Position.Data storage position = Position.load(1);

        // User wants to withdraw 20 WBTC
        uint256 newTotal18 = 30 * 1e18; // 30 remaining in 18 decimals

        // Mock the transfer for 20 WBTC (in 8 decimals)
        vm.mockCall(
            MOCK_TOKEN,
            abi.encodeWithSelector(
                IERC20.transfer.selector,
                USER,
                20 * 1e8 // 20 WBTC in 8 decimals
            ),
            abi.encode(true)
        );

        vm.prank(USER);
        int256 delta = position.updateCollateral(newTotal18);

        assertEq(delta, -int256(20 * 1e18), "Delta should be -20e18");
        assertEq(position.depositedCollateralAmount, newTotal18, "Should update to 30e18");
    }

    function test_MinCollateralCheck() public {
        // Set minimum trade size
        MarketGroup.Data storage marketGroup = MarketGroup.load();
        marketGroup.minTradeSize = 10000 * 1e18;

        // Create new position
        Position.Data storage position = Position.createValid(2);
        position.marketId = 1;
        position.kind = ISapienceStructs.PositionKind.Trade;
        position.depositedCollateralAmount = 9999 * 1e18; // Just below 10,000 in 18 decimals

        // Should revert with CollateralBelowMin error
        // vm.expectRevert();
        vm.expectRevert(abi.encodeWithSelector(Errors.CollateralBelowMin.selector, 9999 * 1e18, 10000 * 1e18));
        position.afterTradeCheck();
    }

    function test_WithdrawCollateral() public {
        MarketGroup.Data storage marketGroup = MarketGroup.load();

        // Test withdrawal of 25 tokens (in 18 decimals)
        uint256 withdrawAmount18 = 25 * 1e18;

        // Mock balance check - contract has 100 WBTC
        vm.mockCall(
            MOCK_TOKEN,
            abi.encodeWithSelector(IERC20.balanceOf.selector, address(this)),
            abi.encode(100 * 1e8) // 100 WBTC in 8 decimals
        );

        // Mock the transfer
        vm.mockCall(
            MOCK_TOKEN,
            abi.encodeWithSelector(
                IERC20.transfer.selector,
                USER,
                25 * 1e8 // 25 WBTC in 8 decimals
            ),
            abi.encode(true)
        );

        uint256 withdrawn = marketGroup.withdrawCollateral(USER, withdrawAmount18);

        assertEq(withdrawn, withdrawAmount18, "Should return amount in 18 decimals");
    }

    function test_PrecisionEdgeCases() public {
        MarketGroup.Data storage marketGroup = MarketGroup.load();

        // Test amount that doesn't divide evenly
        uint256 odd18 = 12345678901234567890; // 12.34567890123456789 in 18 decimals
        uint256 odd8 = marketGroup.denormalizeCollateralAmount(odd18);

        // Should truncate to 8 decimals: 1234567890 (12.3456789 WBTC)
        assertEq(odd8, 1234567890, "Should truncate to 8 decimals");

        // Converting back loses precision
        uint256 backTo18 = marketGroup.normalizeCollateralAmount(odd8);
        assertEq(backTo18, 12345678900000000000, "Lost precision in least significant digits");
    }
}
