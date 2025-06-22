// SPDX-License-Identifier: MIT
pragma solidity >=0.8.2 <0.9.0;

import {Epoch} from "./Epoch.sol";
import {Market} from "./Market.sol";
import {Errors} from "./Errors.sol";
import {Position} from "./Position.sol";
import {ISwapRouter} from "../interfaces/external/ISwapRouter.sol";
import {IQuoterV2} from "../interfaces/external/IQuoterV2.sol";
import {DecimalMath} from "../libraries/DecimalMath.sol";
import {SafeCastI256} from "@synthetixio/core-contracts/contracts/utils/SafeCast.sol";
import {SafeCastU256} from "@synthetixio/core-contracts/contracts/utils/SafeCast.sol";

library Trade {
    using Epoch for Epoch.Data;
    using Position for Position.Data;
    using DecimalMath for uint256;
    using DecimalMath for int256;
    using SafeCastU256 for uint256;
    using SafeCastI256 for int256;

    function swapOrQuoteTokensExactIn(
        Epoch.Data storage epoch,
        uint256 amountInVEth,
        uint256 amountInVGas,
        bool isQuote
    )
        internal
        returns (
            uint256 amountOutVEth,
            uint256 amountOutVGas,
            uint160 sqrtPriceX96After
        )
    {
        if (amountInVEth > 0 && amountInVGas > 0) {
            revert Errors.InvalidData("Only one token can be traded at a time");
        }

        if (amountInVEth == 0 && amountInVGas == 0) {
            revert Errors.InvalidData("At least one token should be traded");
        }

        address tokenIn;
        address tokenOut;
        uint256 amountIn;
        uint256 amountOut;

        if (amountInVEth > 0) {
            tokenIn = address(epoch.ethToken);
            tokenOut = address(epoch.gasToken);
            amountIn = amountInVEth;
        } else {
            tokenIn = address(epoch.gasToken);
            tokenOut = address(epoch.ethToken);
            amountIn = amountInVGas;
        }

        if (isQuote) {
            IQuoterV2.QuoteExactInputSingleParams memory params = IQuoterV2
                .QuoteExactInputSingleParams({
                    tokenIn: tokenIn,
                    tokenOut: tokenOut,
                    amountIn: amountIn,
                    fee: epoch.marketParams.feeRate,
                    sqrtPriceLimitX96: 0
                });
            (amountOut, sqrtPriceX96After, , ) = IQuoterV2(
                epoch.marketParams.uniswapQuoter
            ).quoteExactInputSingle(params);
        } else {
            ISwapRouter.ExactInputSingleParams memory swapParams = ISwapRouter
                .ExactInputSingleParams({
                    fee: epoch.marketParams.feeRate,
                    recipient: address(this),
                    deadline: block.timestamp,
                    tokenIn: tokenIn,
                    tokenOut: tokenOut,
                    amountIn: amountIn,
                    // Notice, not limiting the trade in any way since we are limiting the collateral required afterwards.
                    amountOutMinimum: 0,
                    sqrtPriceLimitX96: 0
                });

            amountOut = ISwapRouter(epoch.marketParams.uniswapSwapRouter)
                .exactInputSingle(swapParams);
        }

        if (amountInVEth > 0) {
            amountOutVGas = amountOut;
        } else {
            amountOutVEth = amountOut;
        }
    }

    function swapOrQuoteTokensExactOut(
        Epoch.Data storage epoch,
        uint256 expectedAmountOutVEth,
        uint256 expectedAmountOutVGas,
        bool isQuote
    )
        internal
        returns (
            uint256 requiredAmountInVEth,
            uint256 requiredAmountInVGas,
            uint160 sqrtPriceX96After
        )
    {
        if (expectedAmountOutVEth > 0 && expectedAmountOutVGas > 0) {
            revert Errors.InvalidData("Only one token can be traded at a time");
        }

        if (expectedAmountOutVEth == 0 && expectedAmountOutVGas == 0) {
            revert Errors.InvalidData("At least one token should be traded");
        }

        address tokenIn;
        address tokenOut;
        uint256 amountOut;
        uint256 amountIn;

        if (expectedAmountOutVEth > 0) {
            tokenIn = address(epoch.gasToken);
            tokenOut = address(epoch.ethToken);
            amountOut = expectedAmountOutVEth;
        } else {
            tokenIn = address(epoch.ethToken);
            tokenOut = address(epoch.gasToken);
            amountOut = expectedAmountOutVGas;
        }

        if (isQuote) {
            IQuoterV2.QuoteExactOutputSingleParams memory params = IQuoterV2
                .QuoteExactOutputSingleParams({
                    tokenIn: tokenIn,
                    tokenOut: tokenOut,
                    amount: amountOut,
                    fee: epoch.marketParams.feeRate,
                    sqrtPriceLimitX96: 0
                });

            (amountIn, sqrtPriceX96After, , ) = IQuoterV2(
                epoch.marketParams.uniswapQuoter
            ).quoteExactOutputSingle(params);
        } else {
            ISwapRouter.ExactOutputSingleParams memory swapParams = ISwapRouter
                .ExactOutputSingleParams({
                    tokenIn: tokenIn,
                    tokenOut: tokenOut,
                    amountOut: amountOut,
                    fee: epoch.marketParams.feeRate,
                    recipient: address(this),
                    deadline: block.timestamp,
                    // Notice, not limiting the trade in any way since we are limiting the collateral required afterwards.
                    sqrtPriceLimitX96: 0,
                    amountInMaximum: type(uint256).max
                });

            amountIn = ISwapRouter(epoch.marketParams.uniswapSwapRouter)
                .exactOutputSingle(swapParams);
        }
        if (expectedAmountOutVEth > 0) {
            requiredAmountInVGas = amountIn;
        } else {
            requiredAmountInVEth = amountIn;
        }
    }

    struct QuoteRuntime {
        bool isLongDirection;
        uint256 tradedVGas;
        uint256 tradedVEth;
        int256 signedTradedVGas;
        int256 signedTradedVEth;
        uint256 vEthFromZero; // vEth involved in the transaction from zero to target size
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
        uint256 tradeRatioD18; // tradedVEth / tradedVGas
        uint256 requiredCollateral;
        int256 expectedDeltaCollateral;
        int256 closePnL; // PnL from initial position to zero
        uint160 sqrtPriceX96After;
    }

    function quoteOrTrade(
        QuoteOrTradeInputParams memory params
    ) internal returns (QuoteOrTradeOutputParams memory output) {
        QuoteRuntime memory runtime;
        Epoch.Data storage epoch = Epoch.load(params.oldPosition.epochId);

        runtime.isLongDirection = params.deltaSize > 0;

        output.position.depositedCollateralAmount = params
            .oldPosition
            .depositedCollateralAmount;

        // 1- Get or quote the transacted tokens (vEth and vGas)
        runtime.signedTradedVGas = params.deltaSize;
        runtime.tradedVGas = params.deltaSize.abs();
        if (runtime.isLongDirection) {
            // Long direction; Quote or Trade
            (runtime.tradedVEth, , output.sqrtPriceX96After) = Trade
                .swapOrQuoteTokensExactOut(
                    epoch,
                    0,
                    runtime.tradedVGas,
                    params.isQuote
                );
            runtime.signedTradedVEth = runtime.tradedVEth.toInt();
        } else {
            // Short direction; Quote or Trade
            (runtime.tradedVEth, , output.sqrtPriceX96After) = Trade
                .swapOrQuoteTokensExactIn(
                    epoch,
                    0,
                    runtime.tradedVGas,
                    params.isQuote
                );
            runtime.signedTradedVEth = runtime.tradedVEth.toInt() * -1;
        }

        // Sanity check. vEth on trade is zero means someting went really wrong (maybe too small trade size, or not enough virtual tokens in the pool)
        if (runtime.tradedVEth == 0) {
            revert Errors.InvalidInternalTradeSize(0);
        }

        // 2- Get PnL and vEth involved in the transaction from initial size to zero (intermediate close the position).
        (
            runtime.tradeRatioD18RoundDown,
            runtime.tradeRatioD18RoundUp,
            output.closePnL,
            runtime.vEthFromZero
        ) = calculateCloseEthAndPnl(
            runtime.tradedVEth,
            runtime.tradedVGas,
            runtime.signedTradedVEth,
            params.initialSize,
            params.targetSize,
            params.oldPosition
        );

        // Check if the tradeRatioD18 is within the bounds
        if (runtime.tradeRatioD18RoundDown < epoch.minPriceD18) {
            revert Errors.TradePriceOutOfBounds(
                runtime.tradeRatioD18RoundDown,
                epoch.minPriceD18,
                epoch.maxPriceD18
            );
        }

        if (runtime.tradeRatioD18RoundUp > epoch.maxPriceD18) {
            revert Errors.TradePriceOutOfBounds(
                runtime.tradeRatioD18RoundUp,
                epoch.minPriceD18,
                epoch.maxPriceD18
            );
        }

        // Use the truncated value as the tradeRatioD18 (used later in the event, the difference between roundDown and roundUp is not important in the event and quote functions as it is informative)
        output.tradeRatioD18 = runtime.tradeRatioD18RoundDown;

        // 3- Regenerate the new position after the trade and closure
        if (params.targetSize > 0) {
            // End position is LONG
            // Sanity check. borrowedVEth should be larger than zero if the position is long
            if (runtime.vEthFromZero == 0) {
                revert Errors.InvalidInternalTradeSize(runtime.vEthFromZero);
            }
            output.position.vGasAmount = params.targetSize.abs();
            output.position.vEthAmount = 0;
            output.position.borrowedVGas = 0;
            output.position.borrowedVEth = runtime.vEthFromZero;
        } else {
            // End position is SHORT
            output.position.vGasAmount = 0;
            output.position.vEthAmount = runtime.vEthFromZero;
            output.position.borrowedVGas = params.targetSize.abs();
            output.position.borrowedVEth = 0;
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
        uint256 newPositionCollateralRequired = epoch
            .getCollateralRequirementsForTrade(
                output.position.vGasAmount,
                output.position.vEthAmount,
                output.position.borrowedVGas,
                output.position.borrowedVEth
            );

        output.requiredCollateral =
            newPositionCollateralRequired +
            extraCollateralRequired;

        output.expectedDeltaCollateral =
            output.requiredCollateral.toInt() -
            output.position.depositedCollateralAmount.toInt();
    }

    function calculateCloseEthAndPnl(
        uint256 tradedVEth,
        uint256 tradedVGas,
        int256 signedTradedVEth,
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
            uint256 vEthFromZero
        )
    {
        // Notice: This function will use rounding up/low depending on the direction of the trade and the initial/final position size
        // This is to avoid rounding errors when the position is closed
        // The assumption (to allow the market to always be in a good state) is that the rounding up/down will always punish the trader
        // It means:
        // - closePnL will always tend to be more negative (-1 if rounding is needed)

        // Get both versions of the tradeRatioD18 (rounded down and rounded up)
        tradeRatioD18RoundDown = tradedVEth.divDecimal(tradedVGas);
        tradeRatioD18RoundUp = tradedVEth.divDecimalRoundUp(tradedVGas);

        // get both versions of vEthToZero using both tradeRatioD18
        // vEth to compensate the gas (either to pay borrowedVGas or borrowedVEth tokens from the close trade)
        int256 vEthToZeroRoundDown = (initialSize * -1).mulDecimal(
            tradeRatioD18RoundDown.toInt()
        );
        int256 vEthToZeroRoundUp = (initialSize * -1).mulDecimal(
            tradeRatioD18RoundUp.toInt()
        );

        // Calculate the closePnL as net vEth from original positon minus the vEth to zero
        // net vEth from original positon minus the vEth to zero (closing Profit based on the new trade ratio. Using the worst case scenario)
        closePnL =
            oldPosition.vEthAmount.toInt() -
            oldPosition.borrowedVEth.toInt() -
            (initialSize > 0 ? vEthToZeroRoundDown : vEthToZeroRoundUp);

        // vEth from the trade that wasn't used to close the initial position (should be same as targetSize*tradeRatio, but there can be some rounding errors)
        // vEthFromZero = signedTradedVEth - vEthToZero
        // But we need to use the worst case scenario on the tradeRatio rounding depending on the target size
        // If target size is positive (LONG) the vEth is debt => should be the higher
        // If target size is negative (SHORT) the vEth is credit => should be the lower
        if (targetSize == 0) {
            vEthFromZero = 0;
            // Skip the rest since is just for getting the vEthFromZero with the proper rounding
        } else {
            uint256 vEthFromZeroFromRoundDown = (signedTradedVEth -
                vEthToZeroRoundDown).abs();
            uint256 vEthFromZeroFromRoundUp = (signedTradedVEth -
                vEthToZeroRoundUp).abs();
            if (targetSize > 0) {
                vEthFromZero = vEthFromZeroFromRoundDown >
                    vEthFromZeroFromRoundUp
                    ? vEthFromZeroFromRoundDown
                    : vEthFromZeroFromRoundUp;
            } else {
                vEthFromZero = vEthFromZeroFromRoundDown <
                    vEthFromZeroFromRoundUp
                    ? vEthFromZeroFromRoundDown
                    : vEthFromZeroFromRoundUp;
            }
        }

        return (
            tradeRatioD18RoundDown,
            tradeRatioD18RoundUp,
            closePnL,
            vEthFromZero
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
