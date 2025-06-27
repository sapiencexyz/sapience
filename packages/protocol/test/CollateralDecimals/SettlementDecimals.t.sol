// SPDX-License-Identifier: MIT
pragma solidity >=0.8.2 <0.9.0;

import "forge-std/Test.sol";
import "../../src/market/storage/MarketGroup.sol";
import "../../src/market/storage/Position.sol";
import "../../src/market/storage/Market.sol";
import "../../src/market/libraries/DecimalMath.sol";
import "../../src/market/libraries/DecimalPrice.sol";
import "../../src/market/interfaces/ISapienceStructs.sol";
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";

// Test to verify settlement returns correct decimal amounts
contract SettlementDecimalsTest is Test {
    using MarketGroup for MarketGroup.Data;
    using Position for Position.Data;
    using Market for Market.Data;
    using DecimalMath for uint256;
    using SafeERC20 for IERC20;

    address constant MOCK_TOKEN = address(0x1234);
    address constant USER = address(0x5678);

    function setUp() public {
        // Setup MarketGroup with 8 decimal token (WBTC)
        MarketGroup.Data storage marketGroup = MarketGroup.load();
        marketGroup.collateralDecimals = 8;
        marketGroup.collateralScalingFactor = 1e10;
        marketGroup.collateralAsset = IERC20(MOCK_TOKEN);

        // Setup Market
        Market.Data storage market = Market.load(1);
        market.id = 1;
        market.settled = true;
        market.settlementPriceD18 = 50000 * 1e18; // $50,000 settlement price
    }

    function test_SettleTradePosition_ProfitableWithCorrectDecimals() public {
        // Setup position - trader was long
        Position.Data storage position = Position.load(1);
        position.id = 1;
        position.marketId = 1;
        position.kind = ISapienceStructs.PositionKind.Trade;
        position.depositedCollateralAmount = 10 * 1e18; // 10 tokens in 18 decimals
        position.vBaseAmount = 2 * 1e18; // Own 2 base tokens
        position.vQuoteAmount = 0;
        position.borrowedVBase = 0;
        position.borrowedVQuote = 80000 * 1e18; // Borrowed 80,000 quote to buy base

        // Calculate settlement
        uint256 withdrawable = position.settle(50000 * 1e18);

        // Should make profit: 2 base * 50,000 = 100,000 quote
        // Minus borrowed: 100,000 - 80,000 = 20,000 quote profit
        // Plus original collateral: 10 + 20,000 = 20,010 (in 18 decimals)
        assertEq(withdrawable, 20010 * 1e18, "Should calculate correct profit");

        // Mock token balance and transfer
        vm.mockCall(
            MOCK_TOKEN,
            abi.encodeWithSelector(IERC20.balanceOf.selector, address(this)),
            abi.encode(100000 * 1e8) // Contract has 100,000 WBTC
        );

        // The withdrawal should transfer correct 8-decimal amount
        uint256 expectedTransfer8 = 20010 * 1e8; // 20,010 WBTC
        vm.mockCall(
            MOCK_TOKEN,
            abi.encodeWithSelector(
                IERC20.transfer.selector,
                USER,
                expectedTransfer8
            ),
            abi.encode(true)
        );

        // Test withdrawal
        MarketGroup.Data storage marketGroup = MarketGroup.load();
        uint256 withdrawn = marketGroup.withdrawCollateral(USER, withdrawable);

        assertEq(
            withdrawn,
            withdrawable,
            "Should return amount in 18 decimals"
        );
    }

    function test_SettleTradePosition_LossWithCorrectDecimals() public {
        // Setup position - trader was short but price went up
        Position.Data storage position = Position.load(2);
        position.id = 2;
        position.marketId = 1;
        position.kind = ISapienceStructs.PositionKind.Trade;
        position.depositedCollateralAmount = 20000 * 1e18; // 20,000 tokens collateral
        position.vBaseAmount = 0;
        position.vQuoteAmount = 40000 * 1e18; // Own 40,000 quote from shorting
        position.borrowedVBase = 1 * 1e18; // Borrowed 1 base to sell
        position.borrowedVQuote = 0;

        // Settlement at $50,000 means loss
        uint256 withdrawable = position.settle(50000 * 1e18);

        // Loss: Need 50,000 quote to buy back 1 base, but only have 40,000
        // Deficit: 10,000 quote
        // Remaining collateral: 20,000 - 10,000 = 10,000
        assertEq(
            withdrawable,
            10000 * 1e18,
            "Should have 10,000 remaining after loss"
        );
        assertEq(position.isSettled, true, "Position should be settled");
    }

    function test_SettleLiquidityPosition_WithFeesAndCorrectDecimals() public {
        // Setup LP position
        Position.Data storage position = Position.load(3);
        position.id = 3;
        position.marketId = 1;
        position.kind = ISapienceStructs.PositionKind.Liquidity;
        position.depositedCollateralAmount = 100 * 1e18; // 100 tokens collateral
        position.vBaseAmount = 10 * 1e18; // From collected fees
        position.vQuoteAmount = 500000 * 1e18; // From collected fees
        position.borrowedVBase = 5 * 1e18; // Borrowed to provide liquidity
        position.borrowedVQuote = 250000 * 1e18; // Borrowed to provide liquidity

        // Settlement
        uint256 withdrawable = position.settle(50000 * 1e18);

        // Net base: 10 - 5 = 5 base * 50,000 = 250,000 quote value
        // Net quote: 500,000 - 250,000 = 250,000 quote
        // Total value: 250,000 + 250,000 = 500,000 quote
        // Plus collateral: 100 + 500,000 = 500,100
        assertEq(
            withdrawable,
            500100 * 1e18,
            "LP should have profit from fees"
        );
    }

    function test_WithdrawCollateral_PrecisionHandling() public {
        MarketGroup.Data storage marketGroup = MarketGroup.load();

        // Test withdrawing amount that doesn't divide evenly
        uint256 withdraw18 = 123456789012345678; // 0.123456789012345678 in 18 decimals

        // This should become 12345678 in 8 decimals (0.12345678 WBTC)
        uint256 expected8 = 12345678;

        vm.mockCall(
            MOCK_TOKEN,
            abi.encodeWithSelector(IERC20.balanceOf.selector, address(this)),
            abi.encode(1000 * 1e8)
        );

        vm.mockCall(
            MOCK_TOKEN,
            abi.encodeWithSelector(IERC20.transfer.selector, USER, expected8),
            abi.encode(true)
        );

        uint256 withdrawn = marketGroup.withdrawCollateral(USER, withdraw18);

        // Due to truncation, actual withdrawn in 18 decimals
        assertEq(
            withdrawn,
            123456780000000000,
            "Should return truncated amount"
        );
    }

    function test_CollateralScalingWithDifferentDecimals() public {
        // Test with 6 decimal token (USDC)
        MarketGroup.Data storage marketGroup = MarketGroup.load();
        marketGroup.collateralDecimals = 6;
        marketGroup.collateralScalingFactor = 1e12;

        uint256 amount6 = 1000000; // 1 USDC
        uint256 normalized = marketGroup.normalizeCollateralAmount(amount6);
        assertEq(normalized, 1e18, "1 USDC should be 1e18 internally");

        // Test with 18 decimal token (standard)
        marketGroup.collateralDecimals = 18;
        marketGroup.collateralScalingFactor = 1;

        uint256 amount18 = 1e18;
        normalized = marketGroup.normalizeCollateralAmount(amount18);
        assertEq(normalized, amount18, "18 decimal should not change");

        // Test with 0 decimal token
        marketGroup.collateralDecimals = 0;
        marketGroup.collateralScalingFactor = 1e18;

        uint256 amount0 = 100; // 100 tokens
        normalized = marketGroup.normalizeCollateralAmount(amount0);
        assertEq(
            normalized,
            100 * 1e18,
            "100 tokens should be 100e18 internally"
        );
    }
}
