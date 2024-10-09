// SPDX-License-Identifier: GPL-3.0

pragma solidity >=0.8.2 <0.9.0;

import {Epoch} from "./Epoch.sol";
import {Market} from "./Market.sol";
import {Errors} from "./Errors.sol";
import {ISwapRouter} from "../interfaces/external/ISwapRouter.sol";
import {IUniswapV3Quoter} from "../interfaces/external/IUniswapV3Quoter.sol";
import "@synthetixio/core-contracts/contracts/utils/DecimalMath.sol";

import "forge-std/console2.sol";

library Trade {
    using Epoch for Epoch.Data;
    using DecimalMath for uint256;

    function swapOrQuoteTokensExactIn(
        Epoch.Data storage epoch,
        uint256 amountInVEth,
        uint256 amountInVGas,
        bool isQuote
    ) internal returns (uint256 amountOutVEth, uint256 amountOutVGas) {
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
            amountOut = IUniswapV3Quoter(epoch.params.uniswapQuoter)
                .quoteExactInputSingle(
                    tokenIn,
                    tokenOut,
                    epoch.params.feeRate,
                    amountIn,
                    0
                );
        } else {
            ISwapRouter.ExactInputSingleParams memory swapParams = ISwapRouter
                .ExactInputSingleParams({
                    fee: epoch.params.feeRate,
                    recipient: address(this),
                    deadline: block.timestamp,
                    tokenIn: tokenIn,
                    tokenOut: tokenOut,
                    amountIn: amountIn,
                    // Notice, not limiting the trade in any way since we are limiting the collateral required afterwards.
                    amountOutMinimum: 0,
                    sqrtPriceLimitX96: 0
                });

            amountOut = ISwapRouter(epoch.params.uniswapSwapRouter)
                .exactInputSingle(swapParams);
            console2.log("amountIn at trade (EXACT IN)", amountOut);
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
        returns (uint256 requiredAmountInVEth, uint256 requiredAmountInVGas)
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
            amountIn = IUniswapV3Quoter(epoch.params.uniswapQuoter)
                .quoteExactOutputSingle(
                    tokenIn,
                    tokenOut,
                    epoch.params.feeRate,
                    amountOut,
                    0
                );
        } else {
            ISwapRouter.ExactOutputSingleParams memory swapParams = ISwapRouter
                .ExactOutputSingleParams({
                    tokenIn: tokenIn,
                    tokenOut: tokenOut,
                    amountOut: amountOut,
                    fee: epoch.params.feeRate,
                    recipient: address(this),
                    deadline: block.timestamp,
                    // Notice, not limiting the trade in any way since we are limiting the collateral required afterwards.
                    sqrtPriceLimitX96: 0,
                    amountInMaximum: type(uint256).max
                });

            amountIn = ISwapRouter(epoch.params.uniswapSwapRouter)
                .exactOutputSingle(swapParams);
            console2.log("amountIn at trade (EXACT OUT)", amountIn);
        }
        if (expectedAmountOutVEth > 0) {
            requiredAmountInVGas = amountIn;
        } else {
            requiredAmountInVEth = amountIn;
        }
    }

    function getReferencePrice(
        uint256 epochId
    ) internal view returns (uint256 price18Digits) {
        Epoch.Data storage epoch = Epoch.load(epochId);

        if (epoch.settled) {
            return epoch.settlementPriceD18;
        } else {
            return epoch.getCurrentPoolPrice();
        }
    }
}
