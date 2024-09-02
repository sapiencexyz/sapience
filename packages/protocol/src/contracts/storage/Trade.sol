// SPDX-License-Identifier: GPL-3.0

pragma solidity >=0.8.2 <0.9.0;

import {Epoch} from "./Epoch.sol";
import {Market} from "./Market.sol";
import {Errors} from "./Errors.sol";
import {ISwapRouter} from "../interfaces/external/ISwapRouter.sol";
import "@synthetixio/core-contracts/contracts/utils/DecimalMath.sol";

library Trade {
    using Epoch for Epoch.Data;
    using DecimalMath for uint256;

    struct SwapTokensExactInParams {
        uint256 epochId;
        uint256 amountInVEth;
        uint256 amountInVGas;
        uint256 amountOutLimitVEth;
        uint256 amountOutLimitVGas;
    }

    struct SwapTokensExactOutParams {
        uint256 epochId;
        uint256 availableAmountInVEth;
        uint256 availableAmountInVGas;
        uint160 amountInLimitVEth;
        uint160 amountInLimitVGas;
        uint256 expectedAmountOutVEth;
        uint256 expectedAmountOutVGas;
    }

    function swapTokensExactIn(
        SwapTokensExactInParams memory params
    ) internal returns (uint256 amountOutVEth, uint256 amountOutVGas) {
        if (params.amountInVEth > 0 && params.amountInVGas > 0) {
            revert("Only one token can be traded at a time");
        }

        if (params.amountInVEth == 0 && params.amountInVGas == 0) {
            revert("At least one token should be traded");
        }

        Market.Data storage market = Market.load();
        Epoch.Data storage epoch = Epoch.load(params.epochId);

        if (epoch.settled) {
            (amountOutVEth, amountOutVGas) = _afterSettlementSwapExactIn(
                epoch,
                params.amountInVEth,
                params.amountInVGas
            );
        } else {
            ISwapRouter.ExactInputSingleParams memory swapParams;
            swapParams.fee = epoch.params.feeRate;
            swapParams.recipient = address(this);
            swapParams.deadline = block.timestamp;

            if (params.amountInVEth > 0) {
                swapParams.tokenIn = address(epoch.ethToken);
                swapParams.tokenOut = address(epoch.gasToken);
                swapParams.amountIn = params.amountInVEth;
                swapParams.amountOutMinimum = params.amountOutLimitVGas;
                // TODO -- We also set the sqrtPriceLimitx96 to be 0 to ensure we swap our exact input amount.
                swapParams.sqrtPriceLimitX96 = 0;
            } else {
                swapParams.tokenIn = address(epoch.gasToken);
                swapParams.tokenOut = address(epoch.ethToken);
                swapParams.amountIn = params.amountInVGas;
                swapParams.amountOutMinimum = params.amountOutLimitVEth;
                // TODO -- We also set the sqrtPriceLimitx96 to be 0 to ensure we swap our exact input amount.
                swapParams.sqrtPriceLimitX96 = 0;
            }

            uint256 amountOut = market.uniswapSwapRouter.exactInputSingle(
                swapParams
            );

            if (params.amountInVEth > 0) {
                amountOutVGas = amountOut;
            } else {
                amountOutVEth = amountOut;
            }
        }
    }

    function swapTokensExactOut(
        SwapTokensExactOutParams memory params
    )
        internal
        returns (
            uint256 refundAmountVEth,
            uint256 refundAmountVGas,
            uint256 tokenAmountVEth,
            uint256 tokenAmountVGas
        )
    {
        if (
            params.expectedAmountOutVEth > 0 && params.expectedAmountOutVGas > 0
        ) {
            revert Errors.InvalidData("Only one token can be traded at a time");
        }

        if (
            params.expectedAmountOutVEth == 0 &&
            params.expectedAmountOutVGas == 0
        ) {
            revert Errors.InvalidData("At least one token should be traded");
        }

        Market.Data storage market = Market.load();
        Epoch.Data storage epoch = Epoch.load(params.epochId);

        if (epoch.settled) {
            uint256 requiredAmountInVEth;
            uint256 requiredAmountInVGas;
            (
                requiredAmountInVEth,
                requiredAmountInVGas
            ) = _afterSettlementSwapExactOut(
                epoch,
                params.expectedAmountOutVEth,
                params.expectedAmountOutVGas
            );

            if (requiredAmountInVEth > params.availableAmountInVEth) {
                revert Errors.InsufficientVEth(
                    requiredAmountInVEth,
                    params.availableAmountInVEth
                );
            }

            refundAmountVEth =
                params.availableAmountInVEth -
                requiredAmountInVEth;

            refundAmountVGas =
                params.availableAmountInVGas -
                requiredAmountInVGas;
        } else {
            address tokenIn;
            address tokenOut;
            uint256 amountOut;
            // uint160 sqrtPriceLimitX96;
            uint256 amountInMaximum;

            if (params.expectedAmountOutVEth > 0) {
                tokenIn = address(epoch.gasToken);
                tokenOut = address(epoch.ethToken);
                amountOut = params.expectedAmountOutVEth;
                amountInMaximum = params.amountInLimitVGas == 0
                    ? type(uint256).max
                    : params.amountInLimitVGas;
            } else {
                tokenIn = address(epoch.ethToken);
                tokenOut = address(epoch.gasToken);
                amountOut = params.expectedAmountOutVGas;
                amountInMaximum = params.amountInLimitVEth == 0
                    ? type(uint256).max
                    : params.amountInLimitVEth;
            }

            ISwapRouter.ExactOutputSingleParams memory swapParams = ISwapRouter
                .ExactOutputSingleParams({
                    tokenIn: tokenIn,
                    tokenOut: tokenOut,
                    fee: epoch.params.feeRate,
                    recipient: address(this),
                    deadline: block.timestamp,
                    amountOut: amountOut,
                    amountInMaximum: amountInMaximum,
                    sqrtPriceLimitX96: 0
                });

            uint256 amountIn = market.uniswapSwapRouter.exactOutputSingle(
                swapParams
            );

            tokenAmountVEth = params.expectedAmountOutVEth;
            tokenAmountVGas = params.expectedAmountOutVGas;

            if (params.expectedAmountOutVEth > 0) {
                if (params.availableAmountInVGas > amountIn) {
                    refundAmountVGas = params.availableAmountInVGas - amountIn;
                } else {
                    revert Errors.InsufficientVGas(
                        amountIn,
                        params.availableAmountInVGas
                    );
                }
                refundAmountVGas = params.availableAmountInVGas - amountIn;
            } else {
                if (params.availableAmountInVEth > amountIn) {
                    refundAmountVEth = params.availableAmountInVEth - amountIn;
                } else {
                    revert Errors.InsufficientVEth(
                        amountIn,
                        params.availableAmountInVEth
                    );
                }
            }
        }
    }

    function _afterSettlementSwapExactIn(
        Epoch.Data storage epoch,
        uint256 amountInVEth,
        uint256 amountInVGas
    ) internal view returns (uint256 amountOutVEth, uint256 amountOutVGas) {
        if (amountInVEth > 0) {
            amountOutVEth = 0;
            amountOutVGas = amountInVEth.divDecimal(epoch.settlementPriceD18);
        } else {
            amountOutVEth = amountInVGas.mulDecimal(epoch.settlementPriceD18);
            amountOutVGas = 0;
        }
    }

    function _afterSettlementSwapExactOut(
        Epoch.Data storage epoch,
        uint256 amountOutVEth,
        uint256 amountOutVGas
    )
        internal
        view
        returns (uint256 requiredAmountInVEth, uint256 requiredAmountInVGas)
    {
        if (amountOutVGas > 0) {
            requiredAmountInVEth = amountOutVGas.mulDecimal(
                epoch.settlementPriceD18
            );
            requiredAmountInVGas = 0;
        } else {
            requiredAmountInVEth = 0;
            requiredAmountInVGas = amountOutVEth.divDecimal(
                epoch.settlementPriceD18
            );
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

    function deltaPriceMultiplier(
        uint256 price0D18,
        uint256 price1D18,
        uint256 feeD18
    ) internal pure returns (uint256) {
        return
            price0D18.mulDecimal(DecimalMath.UNIT + feeD18) -
            price1D18.mulDecimal(DecimalMath.UNIT - feeD18);
    }
}
