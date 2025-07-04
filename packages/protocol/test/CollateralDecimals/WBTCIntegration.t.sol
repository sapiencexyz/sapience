// SPDX-License-Identifier: MIT
pragma solidity >=0.8.2 <0.9.0;

import "forge-std/Test.sol";
import "cannon-std/Cannon.sol";
import {ISapience} from "../../src/market/interfaces/ISapience.sol";
import {IMintableToken} from "../../src/market/external/IMintableToken.sol";
import {TestMarket} from "../helpers/TestMarket.sol";
import {TestUser} from "../helpers/TestUser.sol";
import {TestTrade} from "../helpers/TestTrade.sol";
import {ISapienceStructs} from "../../src/market/interfaces/ISapienceStructs.sol";
import {DecimalMath} from "../../src/market/libraries/DecimalMath.sol";
import {IERC20Metadata} from "@openzeppelin/contracts/token/ERC20/extensions/IERC20Metadata.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";

contract WBTCIntegrationTest is TestMarket {
    using Cannon for Vm;
    using DecimalMath for uint256;

    ISapience sapience;
    IMintableToken collateralAsset;

    address lp1;
    address trader1;
    uint256 marketId;
    address pool;
    uint256 collateralDecimals;

    int24 constant MIN_TICK = 16000;
    int24 constant MAX_TICK = 29800;
    int24 constant LP_LOWER_TICK = 19400;
    int24 constant LP_UPPER_TICK = 24800;
    uint256 constant MIN_TRADE_SIZE = 10_000;
    uint160 constant INITIAL_SQRT_PRICE = 250541448375047931186413801569; // 10

    function setUp() public {
        collateralAsset = IMintableToken(
            vm.getAddress("CollateralAsset.Token")
        );
        sapience = ISapience(vm.getAddress("Sapience"));

        // Get collateral decimals
        collateralDecimals = IERC20Metadata(address(collateralAsset))
            .decimals();

        // Create users
        lp1 = makeAddr("LP1");
        trader1 = makeAddr("Trader1");

        // Mint tokens directly with correct decimals
        // For 6 decimal token, mint 1,000 tokens = 1,000 * 10^6
        uint256 mintAmount = 1_000 * (10 ** collateralDecimals);
        collateralAsset.mint(mintAmount, lp1);
        collateralAsset.mint(mintAmount, trader1);

        // Approve sapience to spend tokens
        vm.prank(lp1);
        IERC20(address(collateralAsset)).approve(
            address(sapience),
            type(uint256).max
        );

        vm.prank(trader1);
        IERC20(address(collateralAsset)).approve(
            address(sapience),
            type(uint256).max
        );

        // Create a market using the helper
        (sapience, ) = createMarket(
            MIN_TICK,
            MAX_TICK,
            INITIAL_SQRT_PRICE,
            MIN_TRADE_SIZE,
            "Test market"
        );

        // Get the created market
        (ISapienceStructs.MarketData memory marketData, ) = sapience
            .getLatestMarket();
        marketId = marketData.marketId;
        pool = marketData.pool;
    }

    function test_CreateAndDecreaseLiquidity_CollateralReturn() public {
        // Work with reasonable amounts in 18 decimals
        uint256 depositAmount = 50 * (10 ** collateralDecimals);

        vm.startPrank(lp1);

        uint256 balanceBefore = collateralAsset.balanceOf(lp1);

        // Create liquidity position
        (
            uint256 positionId,
            ,
            uint256 totalDeposited,
            ,
            uint128 liquidity,
            ,

        ) = sapience.createLiquidityPosition(
                ISapienceStructs.LiquidityMintParams({
                    marketId: marketId,
                    amountBaseToken: 25 * 1e18,
                    amountQuoteToken: 25 * 1e18,
                    collateralAmount: depositAmount,
                    lowerTick: LP_LOWER_TICK,
                    upperTick: LP_UPPER_TICK,
                    minAmountBaseToken: 0,
                    minAmountQuoteToken: 0,
                    deadline: block.timestamp + 1 hours
                })
            );

        uint256 balanceAfterCreate = collateralAsset.balanceOf(lp1);

        // The balance decrease in token decimals should match totalDeposited converted to token decimals
        uint256 expectedDecrease = totalDeposited /
            (10 ** (18 - collateralDecimals));
        assertApproxEqAbs(
            balanceBefore - balanceAfterCreate,
            expectedDecrease,
            1, // Allow 1 unit difference for rounding
            "Balance decrease should match deposited amount"
        );

        // Decrease liquidity by 50%
        (, , uint256 collateralReturned) = sapience.decreaseLiquidityPosition(
            ISapienceStructs.LiquidityDecreaseParams({
                positionId: positionId,
                liquidity: liquidity / 2,
                minBaseAmount: 0,
                minQuoteAmount: 0,
                deadline: block.timestamp + 1 hours
            })
        );

        uint256 balanceAfterDecrease = collateralAsset.balanceOf(lp1);
        vm.stopPrank();

        // Verify collateral was returned
        assertGt(collateralReturned, 0, "Should return collateral");
        assertGt(
            balanceAfterDecrease,
            balanceAfterCreate,
            "Balance should increase after decrease"
        );
    }

    function test_CloseLiquidityPosition_CollateralReturn() public {
        uint256 depositAmount = 50 * (10 ** collateralDecimals);

        vm.startPrank(lp1);

        uint256 initialBalance = collateralAsset.balanceOf(lp1);

        // Create liquidity position
        (uint256 positionId, , , , , , ) = sapience.createLiquidityPosition(
            ISapienceStructs.LiquidityMintParams({
                marketId: marketId,
                amountBaseToken: 40 * 1e18,
                amountQuoteToken: 40 * 1e18,
                collateralAmount: depositAmount,
                lowerTick: LP_LOWER_TICK,
                upperTick: LP_UPPER_TICK,
                minAmountBaseToken: 0,
                minAmountQuoteToken: 0,
                deadline: block.timestamp + 1 hours
            })
        );

        // Close the entire position
        (, , uint256 collateralReturned) = sapience.closeLiquidityPosition(
            ISapienceStructs.LiquidityCloseParams({
                positionId: positionId,
                liquiditySlippage: 0.01 ether, // 1%
                tradeSlippage: 0.01 ether,
                deadline: block.timestamp + 1 hours
            })
        );

        uint256 balanceAfterClose = collateralAsset.balanceOf(lp1);
        vm.stopPrank();
        // Verify collateral return
        assertGt(collateralReturned, 0, "Should return collateral");

        // Balance should be close to initial (within 2% for fees/slippage)
        assertApproxEqRel(
            balanceAfterClose,
            initialBalance,
            0.02 ether,
            "Should return to approximately initial balance"
        );
    }

    function test_CreateAndCloseTrade_CollateralReturn() public {
        // First add liquidity as LP
        vm.startPrank(lp1);

        sapience.createLiquidityPosition(
            ISapienceStructs.LiquidityMintParams({
                marketId: marketId,
                amountBaseToken: 200 * 1e18,
                amountQuoteToken: 200 * 1e18,
                collateralAmount: 400 * (10 ** collateralDecimals),
                lowerTick: LP_LOWER_TICK,
                upperTick: LP_UPPER_TICK,
                minAmountBaseToken: 0,
                minAmountQuoteToken: 0,
                deadline: block.timestamp + 1 hours
            })
        );

        vm.stopPrank();

        // Now test trading
        vm.startPrank(trader1);

        uint256 balanceBefore = collateralAsset.balanceOf(trader1);

        // Create a small long position
        uint256 positionId = sapience.createTraderPosition(
            ISapienceStructs.TraderPositionCreateParams({
                marketId: marketId,
                size: 10 * 1e18, // 10 vBase long
                maxCollateral: 100 * (10 ** collateralDecimals), // Max 100 collateral
                deadline: block.timestamp + 1 hours
            })
        );

        uint256 balanceAfterOpen = collateralAsset.balanceOf(trader1);

        // Close the position
        sapience.modifyTraderPosition(
            ISapienceStructs.TraderPositionModifyParams({
                positionId: positionId,
                size: 0, // Close to 0
                deltaCollateralLimit: 0, // No collateral limit
                deadline: block.timestamp + 1 hours
            })
        );

        uint256 balanceAfterClose = collateralAsset.balanceOf(trader1);
        vm.stopPrank();

        // Should get back close to original balance (small loss from fees)
        assertGt(
            balanceAfterClose,
            balanceAfterOpen,
            "Should return collateral"
        );
        assertApproxEqRel(
            balanceAfterClose,
            balanceBefore,
            0.05 ether, // 5% tolerance for fees
            "Should get back close to original balance"
        );
    }
}
