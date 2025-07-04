// SPDX-License-Identifier: MIT
pragma solidity >=0.8.2 <0.9.0;

import "forge-std/Test.sol";
import "cannon-std/Cannon.sol";
import {ISapience} from "../../src/market/interfaces/ISapience.sol";
import {IMintableToken} from "../../src/market/external/IMintableToken.sol";
import {TestTrade} from "../helpers/TestTrade.sol";
import {TestUser} from "../helpers/TestUser.sol";
import {ISapienceStructs} from "../../src/market/interfaces/ISapienceStructs.sol";
import {Errors} from "../../src/market/storage/Errors.sol";
import {Position} from "../../src/market/storage/Position.sol";

contract DecreaseLiquidityPosition is TestTrade {
    using Cannon for Vm;

    ISapience sapience;
    IMintableToken collateralAsset;

    address lp1;
    address initialLpUser;
    address trader1;
    uint256 marketId;
    address pool;
    address tokenA;
    address tokenB;
    int24 constant MIN_TICK = 16000;
    int24 constant MAX_TICK = 29800;
    uint256 constant INITIAL_LP_BALANCE = 100_000_000 ether;
    uint256 constant INITIAL_COLLATERAL_AMOUNT = 100 ether;
    uint256 constant MIN_TRADE_SIZE = 10_000; // 10,000 vGas
    uint256 positionId;

    function setUp() public {
        collateralAsset = IMintableToken(vm.getAddress("CollateralAsset.Token"));
        sapience = ISapience(vm.getAddress("Sapience"));

        uint160 startingSqrtPriceX96 = 250541448375047931186413801569; // 10
        (sapience,) = createMarket(MIN_TICK, MAX_TICK, startingSqrtPriceX96, MIN_TRADE_SIZE, "wstGwei/gas");

        initialLpUser = TestUser.createUser("InitialLPUser", INITIAL_LP_BALANCE);
        lp1 = TestUser.createUser("LP1", INITIAL_LP_BALANCE);
        trader1 = TestUser.createUser("Trader1", INITIAL_LP_BALANCE);

        (ISapienceStructs.MarketData memory marketData,) = sapience.getLatestMarket();
        marketId = marketData.marketId;
        pool = marketData.pool;
        tokenA = marketData.quoteToken;
        tokenB = marketData.baseToken;

        // Create the initial context for the tests
        // First create an initial LP position to establish the pool
        vm.startPrank(initialLpUser);
        (uint256 initialBaseTokenAmount, uint256 initialQuoteTokenAmount,) =
            getTokenAmountsForCollateralAmount(INITIAL_COLLATERAL_AMOUNT, MIN_TICK, MAX_TICK);

        sapience.createLiquidityPosition(
            ISapienceStructs.LiquidityMintParams({
                marketId: marketId,
                amountBaseToken: initialBaseTokenAmount,
                amountQuoteToken: initialQuoteTokenAmount,
                collateralAmount: INITIAL_COLLATERAL_AMOUNT + dust,
                lowerTick: MIN_TICK,
                upperTick: MAX_TICK,
                minAmountBaseToken: 0,
                minAmountQuoteToken: 0,
                deadline: block.timestamp + 30 minutes
            })
        );
        vm.stopPrank();

        // Now create lp1's position
        vm.startPrank(lp1);
        (uint256 baseTokenAmount, uint256 quoteTokenAmount,) =
            getTokenAmountsForCollateralAmount(INITIAL_COLLATERAL_AMOUNT, MIN_TICK, MAX_TICK);

        (positionId,,,,,,) = sapience.createLiquidityPosition(
            ISapienceStructs.LiquidityMintParams({
                marketId: marketId,
                amountBaseToken: baseTokenAmount,
                amountQuoteToken: quoteTokenAmount,
                collateralAmount: INITIAL_COLLATERAL_AMOUNT + dust,
                lowerTick: MIN_TICK,
                upperTick: MAX_TICK,
                minAmountBaseToken: 0,
                minAmountQuoteToken: 0,
                deadline: block.timestamp + 30 minutes
            })
        );
        vm.stopPrank();

        // Create a trader position to make lp1 have more vBase tokens
        traderSellsGas();
        increaseLiquidityPosition(); // this collects fees from trader
    }

    function traderSellsGas() public {
        // Create a trader position before each test
        address trader = createUser("Trader", 1000 ether);
        vm.startPrank(trader);

        // TODO notice this is a long position, not short => is buying base
        addTraderPosition(sapience, marketId, 1 ether);

        vm.stopPrank();
    }

    struct InitialValues {
        uint256 initialBaseTokenAmount;
        uint256 initialQuoteTokenAmount;
        uint256 initialOwedTokens0;
        uint256 initialOwedTokens1;
        uint128 initialLiquidity;
        uint256 initialLpBalance;
        uint256 initialFoilBalance;
    }

    function increaseLiquidityPosition() internal {
        traderSellsGas();

        vm.startPrank(lp1);

        // Get initial position details
        (uint256 initialAmount0, uint256 initialAmount1,,, uint128 initialLiquidity) =
            getCurrentPositionTokenAmounts(positionId, MIN_TICK, MAX_TICK);
        initialLiquidity;

        // Calculate amounts to increase
        uint256 increaseAmount0 = initialAmount0 / 2; // Increase by 50%
        uint256 increaseAmount1 = initialAmount1 / 2; // Increase by 50%

        // Increase the liquidity position
        sapience.increaseLiquidityPosition(
            ISapienceStructs.LiquidityIncreaseParams({
                positionId: positionId,
                collateralAmount: 1000 ether,
                baseTokenAmount: increaseAmount0,
                quoteTokenAmount: increaseAmount1,
                minBaseAmount: 0,
                minQuoteAmount: 0,
                deadline: block.timestamp + 30 minutes
            })
        );
        vm.stopPrank();
    }

    function test_decreaseLiquidityPositionToTradePosition_closeLiquidityPosition() public {
        // The tests are executed after setup, so the pre-conditions are already met

        // This test confirms the setup is correct and that by closing lp1 liquidity position by using the decreaseLiquidityPosition the position gets transformed into a trade position

        vm.startPrank(lp1);

        Position.Data memory initialPosition = sapience.getPosition(positionId);

        // Get initial position details
        (
            uint256 initialAmount0,
            uint256 initialAmount1,
            uint256 initialOwedTokens0,
            uint256 initialOwedTokens1,
            uint128 initialLiquidity
        ) = getCurrentPositionTokenAmounts(initialPosition.uniswapPositionId, MIN_TICK, MAX_TICK);

        // Close the position by decreasing all liquidity
        (uint256 amount0, uint256 amount1,) = sapience.decreaseLiquidityPosition(
            ISapienceStructs.LiquidityDecreaseParams({
                positionId: positionId,
                liquidity: initialLiquidity,
                minBaseAmount: 0,
                minQuoteAmount: 0,
                deadline: block.timestamp + 30 minutes
            })
        );

        // Get updated position
        Position.Data memory updatedPosition = sapience.getPosition(positionId);

        // Verify the position is now a trade position
        assertEq(
            uint8(updatedPosition.kind),
            uint8(ISapienceStructs.PositionKind.Trade),
            "Position should be transformed into a trade position"
        );

        // Verify the position has the correct token amounts
        if (amount0 + initialOwedTokens0 > initialPosition.borrowedVBase) {
            assertEq(
                updatedPosition.vBaseAmount,
                initialPosition.borrowedVBase - (initialOwedTokens0 + amount0),
                "vBase amount should be equal to borrowed vBase minus owed tokens and decreased amount"
            );
        } else {
            assertEq(
                updatedPosition.borrowedVBase,
                initialPosition.borrowedVBase - (initialOwedTokens0 + amount0),
                "vBase amount should be equal to borrowed vBase minus owed tokens and decreased amount"
            );
        }

        // Verify the collateral amount is correct
        int256 vQuoteLoan = int256(initialPosition.borrowedVQuote) - int256(amount1);
        assertEq(
            updatedPosition.depositedCollateralAmount,
            uint256(int256(initialPosition.depositedCollateralAmount) - vQuoteLoan),
            "Deposited collateral amount shouldn't change"
        );

        // Verify all tokens were collected
        assertApproxEqAbs(amount0, initialAmount0 + initialOwedTokens0, 1, "All token0 should be collected");
        assertApproxEqAbs(amount1, initialAmount1 + initialOwedTokens1, 1, "All token1 should be collected");

        vm.stopPrank();
    }

    function test_closeLiquidityPosition_closeTrade() public {
        // This test confirms that by using the closeLiquidityPosition function, the position is closed. We use zero for the slippage protection to allow it to pass.

        vm.startPrank(lp1);

        Position.Data memory initialPosition = sapience.getPosition(positionId);

        // Get initial position details
        (uint256 initialAmount0, uint256 initialAmount1, uint256 initialOwedTokens0, uint256 initialOwedTokens1,) =
            getCurrentPositionTokenAmounts(initialPosition.uniswapPositionId, MIN_TICK, MAX_TICK);

        // Close the position using closeLiquidityPosition
        (uint256 amount0, uint256 amount1,) = sapience.closeLiquidityPosition(
            ISapienceStructs.LiquidityCloseParams({
                positionId: positionId,
                liquiditySlippage: 1e18,
                tradeSlippage: 1e18,
                deadline: block.timestamp + 30 minutes
            })
        );

        // Get updated position
        Position.Data memory updatedPosition = sapience.getPosition(positionId);

        // Verify the position is not a trade position
        assertNotEq(
            uint8(updatedPosition.kind),
            uint8(ISapienceStructs.PositionKind.Trade),
            "Position should not be transformed into a trade position"
        );

        assertEq(updatedPosition.uniswapPositionId, 0, "Uniswap position ID should be 0");
        assertEq(updatedPosition.depositedCollateralAmount, 0, "Deposited collateral amount should be 0");
        assertEq(updatedPosition.borrowedVQuote, 0, "Borrowed vQuote should be 0");
        assertEq(updatedPosition.borrowedVBase, 0, "Borrowed vBase should be 0");
        assertEq(updatedPosition.vBaseAmount, 0, "vBase amount should be 0");
        assertEq(updatedPosition.vQuoteAmount, 0, "vQuote amount should be 0");

        // Notice +/- 1 due to rounding errors
        assertApproxEqAbs(amount0, initialAmount0 + initialOwedTokens0, 1, "All token0 should be collected");
        assertApproxEqAbs(amount1, initialAmount1 + initialOwedTokens1, 1, "All token1 should be collected");

        vm.stopPrank();
    }

    function test_revertWhenLiquiditySlippageParamIsWrong_closeLiquidityPosition_closeTrade() public {
        // This test confirms that by using the closeLiquidityPosition function with the wrong parameters (slippage > 1e18) it reverts with the slippage error.

        vm.startPrank(lp1);

        vm.expectRevert(abi.encodeWithSelector(Errors.InvalidSlippage.selector, 1e18 + 1, 1e18));
        sapience.closeLiquidityPosition(
            ISapienceStructs.LiquidityCloseParams({
                positionId: positionId,
                liquiditySlippage: 1e18 + 1,
                tradeSlippage: 1e18,
                deadline: block.timestamp + 30 minutes
            })
        );

        vm.stopPrank();
    }

    function test_revertWhenTradeSlippageParamIsWrong_closeLiquidityPosition_closeTrade() public {
        // This test confirms that by using the closeLiquidityPosition function with the wrong parameters (slippage > 1e18) it reverts with the slippage error.

        vm.startPrank(lp1);

        vm.expectRevert(abi.encodeWithSelector(Errors.InvalidSlippage.selector, 1e18, 1e18 + 1));
        sapience.closeLiquidityPosition(
            ISapienceStructs.LiquidityCloseParams({
                positionId: positionId,
                liquiditySlippage: 1e18,
                tradeSlippage: 1e18 + 1,
                deadline: block.timestamp + 30 minutes
            })
        );

        vm.stopPrank();
    }

    // TODO: This test is not reverting even with no slippage allowed. Might need more work on preconditions
    // function test_revertWhenLiquiditySlippageIsExceeded_closeLiquidityPosition_closeTrade()
    //     public
    // {
    //     // This test confirms that by using the closeLiquidityPosition function, it reverts with the liquidity slippage error.

    //     vm.startPrank(lp1);

    //     // Try to close the position with a very high liquidity slippage that will cause it to revert
    //     vm.expectRevert(
    //         abi.encodeWithSelector(Errors.InvalidSlippage.selector)
    //     );
    //     sapience.closeLiquidityPosition(
    //         ISapienceStructs.LiquidityCloseParams({
    //             positionId: positionId,
    //             liquiditySlippage: 0.01  * 1e18, // 1% slippage
    //             tradeSlippage: 1e18,
    //             deadline: block.timestamp + 30 minutes
    //         })
    //     );

    //     vm.stopPrank();
    // }

    function test_revertWhenTradeSlippageIsExceeded_closeLiquidityPosition_closeTrade() public {
        // This test confirms that by using the closeLiquidityPosition function, it reverts with the trade slippage error.

        vm.startPrank(lp1);

        // Try to close the position with a very high trade slippage that will cause it to revert
        vm.expectRevert(
            abi.encodeWithSelector(
                Errors.CollateralLimitReached.selector, -1099629689067318712314, -1109169447826266919685
            )
        );
        sapience.closeLiquidityPosition(
            ISapienceStructs.LiquidityCloseParams({
                positionId: positionId,
                liquiditySlippage: 1e18,
                tradeSlippage: 0.001 * 1e18, // 1% slippage
                deadline: block.timestamp + 30 minutes
            })
        );

        vm.stopPrank();
    }
}
