// SPDX-License-Identifier: MIT
pragma solidity >=0.8.2 <0.9.0;

import {Market} from "./Market.sol";
import {MarketGroup} from "./MarketGroup.sol";
import {Errors} from "./Errors.sol";
import {Position} from "./Position.sol";
import {ISwapRouter} from "../interfaces/external/ISwapRouter.sol";
import {IQuoterV2} from "../interfaces/external/IQuoterV2.sol";
import {DecimalMath} from "../libraries/DecimalMath.sol";
import {SafeCastI256} from "@synthetixio/core-contracts/contracts/utils/SafeCast.sol";
import {SafeCastU256} from "@synthetixio/core-contracts/contracts/utils/SafeCast.sol";

library Trade {
    using Market for Market.Data;
    using Position for Position.Data;
    using DecimalMath for uint256;
    using DecimalMath for int256;
    using SafeCastU256 for uint256;
    using SafeCastI256 for int256;

    function swapOrQuoteTokensExactIn(
        Market.Data storage market,
        uint256 amountInVQuote,
        uint256 amountInVBase,
        bool isQuote
    )
        internal
        returns (
            uint256 amountOutVQuote,
            uint256 amountOutVBase,
            uint160 sqrtPriceX96After
        )
    {
        if (amountInVQuote > 0 && amountInVBase > 0) {
            revert Errors.InvalidData("Only one token can be traded at a time");
        }

        if (amountInVQuote == 0 && amountInVBase == 0) {
            revert Errors.InvalidData("At least one token should be traded");
        }

        MarketGroup.Data storage marketGroup = MarketGroup.load();
        
        address tokenIn;
        address tokenOut;
        uint256 amountIn;
        uint256 amountOut;

        if (amountInVQuote > 0) {
            tokenIn = address(market.quoteToken);
            tokenOut = address(market.baseToken);
            amountIn = amountInVQuote;
        } else {
            tokenIn = address(market.baseToken);
            tokenOut = address(market.quoteToken);
            amountIn = amountInVBase;
        }

        if (isQuote) {
            IQuoterV2.QuoteExactInputSingleParams memory params = IQuoterV2
                .QuoteExactInputSingleParams({
                    tokenIn: tokenIn,
                    tokenOut: tokenOut,
                    amountIn: amountIn,
                    fee: marketGroup.marketParams.feeRate,
                    sqrtPriceLimitX96: 0
                });
            (amountOut, sqrtPriceX96After, , ) = IQuoterV2(
                marketGroup.marketParams.uniswapQuoter
            ).quoteExactInputSingle(params);
        } else {
            ISwapRouter.ExactInputSingleParams memory swapParams = ISwapRouter
                .ExactInputSingleParams({
                    fee: marketGroup.marketParams.feeRate,
                    recipient: address(this),
                    deadline: block.timestamp,
                    tokenIn: tokenIn,
                    tokenOut: tokenOut,
                    amountIn: amountIn,
                    // Notice, not limiting the trade in any way since we are limiting the collateral required afterwards.
                    amountOutMinimum: 0,
                    sqrtPriceLimitX96: 0
                });

            amountOut = ISwapRouter(marketGroup.marketParams.uniswapSwapRouter)
                .exactInputSingle(swapParams);
        }

        if (amountInVQuote > 0) {
            amountOutVBase = amountOut;
        } else {
            amountOutVQuote = amountOut;
        }
    }

    function swapOrQuoteTokensExactOut(
        Market.Data storage market,
        uint256 expectedAmountOutVQuote,
        uint256 expectedAmountOutVBase,
        bool isQuote
    )
        internal
        returns (
            uint256 requiredAmountInVQuote,
            uint256 requiredAmountInVBase,
            uint160 sqrtPriceX96After
        )
    {
        if (expectedAmountOutVQuote > 0 && expectedAmountOutVBase > 0) {
            revert Errors.InvalidData("Only one token can be traded at a time");
        }

        if (expectedAmountOutVQuote == 0 && expectedAmountOutVBase == 0) {
            revert Errors.InvalidData("At least one token should be traded");
        }

        MarketGroup.Data storage marketGroup = MarketGroup.load();
        
        address tokenIn;
        address tokenOut;
        uint256 amountOut;
        uint256 amountIn;

        if (expectedAmountOutVQuote > 0) {
            tokenIn = address(market.baseToken);
            tokenOut = address(market.quoteToken);
            amountOut = expectedAmountOutVQuote;
        } else {
            tokenIn = address(market.quoteToken);
            tokenOut = address(market.baseToken);
            amountOut = expectedAmountOutVBase;
        }

        if (isQuote) {
            IQuoterV2.QuoteExactOutputSingleParams memory params = IQuoterV2
                .QuoteExactOutputSingleParams({
                    tokenIn: tokenIn,
                    tokenOut: tokenOut,
                    amount: amountOut,
                    fee: marketGroup.marketParams.feeRate,
                    sqrtPriceLimitX96: 0
                });

            (amountIn, sqrtPriceX96After, , ) = IQuoterV2(
                marketGroup.marketParams.uniswapQuoter
            ).quoteExactOutputSingle(params);
        } else {
            ISwapRouter.ExactOutputSingleParams memory swapParams = ISwapRouter
                .ExactOutputSingleParams({
                    tokenIn: tokenIn,
                    tokenOut: tokenOut,
                    amountOut: amountOut,
                    fee: marketGroup.marketParams.feeRate,
                    recipient: address(this),
                    deadline: block.timestamp,
                    // Notice, not limiting the trade in any way since we are limiting the collateral required afterwards.
                    sqrtPriceLimitX96: 0,
                    amountInMaximum: type(uint256).max
                });

            amountIn = ISwapRouter(marketGroup.marketParams.uniswapSwapRouter)
                .exactOutputSingle(swapParams);
        }
        if (expectedAmountOutVQuote > 0) {
            requiredAmountInVBase = amountIn;
        } else {
            requiredAmountInVQuote = amountIn;
        }
    }

    struct QuoteRuntime {
        bool isLongDirection;
        uint256 tradedVBase;
        uint256 tradedVQuote;
        int256 signedTradedVBase;
        int256 signedTradedVQuote;
        uint256 vQuoteFromZero; // vQuote involved in the transaction from zero to target size
        uint256 tradeRatioD18RoundDown;
        uint256 tradeRatioD18RoundUp;
    }

    struct QuoteOrTradeInputParams {
        Position.Data oldPosition;
        int256 initialSize;
        int256 targetSize;
        int256 deltaSize;
        bool isQuote;
    }

    struct QuoteOrTradeOutputParams {
        Position.Data position;
        uint256 tradeRatioD18; // tradedVQuote / tradedVBase
        uint256 requiredCollateral;
        int256 expectedDeltaCollateral;
        int256 closePnL; // PnL from initial position to zero
        uint160 sqrtPriceX96After;
    }

    function quoteOrTrade(
        QuoteOrTradeInputParams memory params
    ) internal returns (QuoteOrTradeOutputParams memory output) {
        QuoteRuntime memory runtime;
        Market.Data storage market = Market.load(params.oldPosition.marketId);

        runtime.isLongDirection = params.deltaSize > 0;

        output.position.depositedCollateralAmount = params
            .oldPosition
            .depositedCollateralAmount;

        // 1- Get or quote the transacted tokens (vQuote and vBase)
        runtime.signedTradedVBase = params.deltaSize;
        runtime.tradedVBase = params.deltaSize.abs();
        if (runtime.isLongDirection) {
            // Long direction; Quote or Trade
            (runtime.tradedVQuote, , output.sqrtPriceX96After) = Trade
                .swapOrQuoteTokensExactOut(
                    market,
                    0,
                    runtime.tradedVBase,
                    params.isQuote
                );
            runtime.signedTradedVQuote = runtime.tradedVQuote.toInt();
        } else {
            // Short direction; Quote or Trade
            (runtime.tradedVQuote, , output.sqrtPriceX96After) = Trade
                .swapOrQuoteTokensExactIn(
                    market,
                    0,
                    runtime.tradedVBase,
                    params.isQuote
                );
            runtime.signedTradedVQuote = runtime.tradedVQuote.toInt() * -1;
        }

        // Sanity check. vQuote on trade is zero means someting went really wrong (maybe too small trade size, or not enough virtual tokens in the pool)
        if (runtime.tradedVQuote == 0) {
            revert Errors.InvalidInternalTradeSize(0);
        }

        // 2- Get PnL and vQuote involved in the transaction from initial size to zero (intermediate close the position).
        (
            runtime.tradeRatioD18RoundDown,
            runtime.tradeRatioD18RoundUp,
            output.closePnL,
            runtime.vQuoteFromZero
        ) = calculateCloseQuoteAndPnl(
            runtime.tradedVQuote,
            runtime.tradedVBase,
            runtime.signedTradedVQuote,
            params.initialSize,
            params.targetSize,
            params.oldPosition
        );

        // Check if the tradeRatioD18 is within the bounds
        if (runtime.tradeRatioD18RoundDown < market.minPriceD18) {
            revert Errors.TradePriceOutOfBounds(
                runtime.tradeRatioD18RoundDown,
                market.minPriceD18,
                market.maxPriceD18
            );
        }

        if (runtime.tradeRatioD18RoundUp > market.maxPriceD18) {
            revert Errors.TradePriceOutOfBounds(
                runtime.tradeRatioD18RoundUp,
                market.minPriceD18,
                market.maxPriceD18
            );
        }

        // Use the truncated value as the tradeRatioD18 (used later in the event, the difference between roundDown and roundUp is not important in the event and quote functions as it is informative)
        output.tradeRatioD18 = runtime.tradeRatioD18RoundDown;

        // 3- Regenerate the new position after the trade and closure
        if (params.targetSize > 0) {
            // End position is LONG
            // Sanity check. borrowedVQuote should be larger than zero if the position is long
            if (runtime.vQuoteFromZero == 0) {
                revert Errors.InvalidInternalTradeSize(runtime.vQuoteFromZero);
            }
            output.position.vBaseAmount = params.targetSize.abs();
            output.position.vQuoteAmount = 0;
            output.position.borrowedVBase = 0;
            output.position.borrowedVQuote = runtime.vQuoteFromZero;
        } else {
            // End position is SHORT
            output.position.vBaseAmount = 0;
            output.position.vQuoteAmount = runtime.vQuoteFromZero;
            output.position.borrowedVBase = params.targetSize.abs();
            output.position.borrowedVQuote = 0;
        }

        // 4- Adjust position collateral with PNL
        uint256 extraCollateralRequired;
        if (output.closePnL >= 0) {
            output.position.depositedCollateralAmount =
                params.oldPosition.depositedCollateralAmount +
                output.closePnL.toUint();
        } else {
            // If closePnL is negative, it means that the position is in a loss
            // and the collateral should be reduced
            uint256 collateralLoss = (output.closePnL * -1).toUint();

            if (collateralLoss > params.oldPosition.depositedCollateralAmount) {
                // If the collateral to return is more than the deposited collateral, then the position is in a loss
                // and the collateral should be reduced to zero
                output.position.depositedCollateralAmount = 0;
                extraCollateralRequired =
                    collateralLoss -
                    params.oldPosition.depositedCollateralAmount;
            } else {
                output.position.depositedCollateralAmount =
                    params.oldPosition.depositedCollateralAmount -
                    collateralLoss;
            }
        }

        // 5- Get the required collateral for the trade\quote
        uint256 newPositionCollateralRequired = market
            .getCollateralRequirementsForTrade(
                output.position.vBaseAmount,
                output.position.vQuoteAmount,
                output.position.borrowedVBase,
                output.position.borrowedVQuote
            );

        output.requiredCollateral =
            newPositionCollateralRequired +
            extraCollateralRequired;

        output.expectedDeltaCollateral =
            output.requiredCollateral.toInt() -
            output.position.depositedCollateralAmount.toInt();
    }

    function calculateCloseQuoteAndPnl(
        uint256 tradedVQuote,
        uint256 tradedVBase,
        int256 signedTradedVQuote,
        int256 initialSize,
        int256 targetSize,
        Position.Data memory oldPosition
    )
        internal
        pure
        returns (
            uint256 tradeRatioD18RoundDown,
            uint256 tradeRatioD18RoundUp,
            int256 closePnL,
            uint256 vQuoteFromZero
        )
    {
        // Notice: This function will use rounding up/low depending on the direction of the trade and the initial/final position size
        // This is to avoid rounding errors when the position is closed
        // The assumption (to allow the market to always be in a good state) is that the rounding up/down will always punish the trader
        // It means:
        // - closePnL will always tend to be more negative (-1 if rounding is needed)

        // Get both versions of the tradeRatioD18 (rounded down and rounded up)
        tradeRatioD18RoundDown = tradedVQuote.divDecimal(tradedVBase);
        tradeRatioD18RoundUp = tradedVQuote.divDecimalRoundUp(tradedVBase);

        // get both versions of vQuoteToZero using both tradeRatioD18
        // vQuote to compensate the base (either to pay borrowedVBase or borrowedVQuote tokens from the close trade)
        int256 vQuoteToZeroRoundDown = (initialSize * -1).mulDecimal(
            tradeRatioD18RoundDown.toInt()
        );
        int256 vQuoteToZeroRoundUp = (initialSize * -1).mulDecimal(
            tradeRatioD18RoundUp.toInt()
        );

        // Calculate the closePnL as net vQuote from original positon minus the vQuote to zero
        // net vQuote from original positon minus the vQuote to zero (closing Profit based on the new trade ratio. Using the worst case scenario)
        closePnL =
            oldPosition.vQuoteAmount.toInt() -
            oldPosition.borrowedVQuote.toInt() -
            (initialSize > 0 ? vQuoteToZeroRoundDown : vQuoteToZeroRoundUp);

        // vQuote from the trade that wasn't used to close the initial position (should be same as targetSize*tradeRatio, but there can be some rounding errors)
        // vQuoteFromZero = signedTradedVQuote - vQuoteToZero
        // But we need to use the worst case scenario on the tradeRatio rounding depending on the target size
        // If target size is positive (LONG) the vQuote is debt => should be the higher
        // If target size is negative (SHORT) the vQuote is credit => should be the lower
        if (targetSize == 0) {
            vQuoteFromZero = 0;
            // Skip the rest since is just for getting the vQuoteFromZero with the proper rounding
        } else {
            uint256 vQuoteFromZeroFromRoundDown = (signedTradedVQuote -
                vQuoteToZeroRoundDown).abs();
            uint256 vQuoteFromZeroFromRoundUp = (signedTradedVQuote -
                vQuoteToZeroRoundUp).abs();
            if (targetSize > 0) {
                vQuoteFromZero = vQuoteFromZeroFromRoundDown >
                    vQuoteFromZeroFromRoundUp
                    ? vQuoteFromZeroFromRoundDown
                    : vQuoteFromZeroFromRoundUp;
            } else {
                vQuoteFromZero = vQuoteFromZeroFromRoundDown <
                    vQuoteFromZeroFromRoundUp
                    ? vQuoteFromZeroFromRoundDown
                    : vQuoteFromZeroFromRoundUp;
            }
        }

        return (
            tradeRatioD18RoundDown,
            tradeRatioD18RoundUp,
            closePnL,
            vQuoteFromZero
        );
    }

    function checkDeltaCollateralLimit(
        int256 deltaCollateral,
        int256 deltaCollateralLimit
    ) internal pure {
        // limit is 1.01, deltaCollateral is 1.02 => revert
        if (deltaCollateralLimit == 0) {
            // no limit, so no need to check
            return;
        }

        // check if collateral limit is reached (positive means collateral deposit to the position, negative means collateral withdrawal from the position)
        // For positive limit (deposit), deltaCollateral > deltaCollateralLimit revert (i.e. collateral limit is 1.02, deltaCollateral is 1.03 => revert)
        // For negative limit (withdrawal), deltaCollateral < deltaCollateralLimit revert (i.e. collateral limit is -1.02, deltaCollateral is -1.01 => revert)
        if (deltaCollateral > deltaCollateralLimit) {
            revert Errors.CollateralLimitReached(
                deltaCollateral,
                deltaCollateralLimit
            );
        }
    }

}
