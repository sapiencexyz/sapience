// SPDX-License-Identifier: MIT
pragma solidity >=0.8.25 <0.9.0;

import "../storage/Position.sol";
import "../storage/ERC721Storage.sol";
import "../storage/Trade.sol";
import "@synthetixio/core-contracts/contracts/utils/DecimalMath.sol";
import {SafeCastI256} from "@synthetixio/core-contracts/contracts/utils/SafeCast.sol";
import {SafeCastU256} from "@synthetixio/core-contracts/contracts/utils/SafeCast.sol";
import {ITradeModule} from "../interfaces/ITradeModule.sol";

import "forge-std/console2.sol";

/**
 * @title Module for trade positions.
 * @dev See ITradeModule.
 */
contract TradeModule is ITradeModule {
    using Epoch for Epoch.Data;
    using Position for Position.Data;
    using DecimalMath for uint256;
    using SafeCastI256 for int256;
    using SafeCastU256 for uint256;

    /**
     * @inheritdoc ITradeModule
     */
    function createTraderPosition(
        uint256 epochId,
        uint256 collateralAmount,
        int256 tokenAmount,
        int256 tokenAmountLimit
    ) external override returns (uint256 positionId) {
        // create/load account
        Epoch.Data storage epoch = Epoch.load(epochId);

        // check if epoch is not settled
        epoch.validateNotSettled();

        positionId = ERC721EnumerableStorage.totalSupply() + 1;
        Position.Data storage position = Position.createValid(positionId);
        ERC721Storage._mint(msg.sender, positionId);
        position.epochId = epochId;
        position.kind = IFoilStructs.PositionKind.Trade;

        uint256 initialPrice = Trade.getReferencePrice(epochId);

        if (tokenAmount > 0) {
            _createLongPosition(position, tokenAmount, tokenAmountLimit);
        } else {
            _createShortPosition(position, tokenAmount, tokenAmountLimit);
        }

        position.updateCollateral(collateralAmount);

        // Validate after trading that collateral is enough
        position.afterTradeCheck();

        uint256 finalPrice = Trade.getReferencePrice(epochId);

        emit TraderPositionCreated(
            epochId,
            positionId,
            collateralAmount,
            position.vEthAmount,
            position.vGasAmount,
            position.borrowedVEth,
            position.borrowedVGas,
            initialPrice,
            finalPrice
        );
    }

    /**
     * @inheritdoc ITradeModule
     */
    function modifyTraderPosition(
        uint256 positionId,
        uint256 collateralAmount,
        int256 tokenAmount,
        int256 tokenAmountLimit
    ) external override {
        // Notice: positionId is the tokenId
        if (ERC721Storage._ownerOf(positionId) != msg.sender) {
            revert Errors.NotAccountOwnerOrAuthorized(positionId, msg.sender);
        }

        Position.Data storage position = Position.loadValid(positionId);

        if (position.kind != IFoilStructs.PositionKind.Trade) {
            revert Errors.InvalidPositionKind();
        }

        // check settlement state
        if (tokenAmount == 0) {
            // closing, can happen at any time
            Epoch.load(position.epochId).validateSettlementSanity();
        } else {
            // not closing, can only happen if not settled
            Epoch.load(position.epochId).validateNotSettled();
        }

        uint256 initialPrice = Trade.getReferencePrice(position.epochId);

        // Ensures that the position only have single side tokens
        position.consolidateDebtsAndTokens();

        if (
            !sameSide(position.currentTokenAmount, tokenAmount) ||
            tokenAmount == 0
        ) {
            // go to zero before moving to the other side
            _closePosition(position);
        }

        // Notice: if/else won't enter on tokenAmount == 0 since it's already closed
        if (tokenAmount > 0) {
            _modifyLongPosition(position, tokenAmount, tokenAmountLimit);
        } else if (tokenAmount < 0) {
            _modifyShortPosition(position, tokenAmount, tokenAmountLimit);
        }

        position.updateCollateral(collateralAmount);

        // Validate after trading that collateral is enough
        position.afterTradeCheck();

        uint256 finalPrice = Trade.getReferencePrice(position.epochId);
        emit TraderPositionModified(
            position.epochId,
            positionId,
            collateralAmount,
            position.vEthAmount,
            position.vGasAmount,
            position.borrowedVEth,
            position.borrowedVGas,
            initialPrice,
            finalPrice
        );
    }

    /**
     * @dev Create a long position
     * With collateral get vEth (Loan)
     * With vEth (use enough to) get vGas (Swap)
     * End result:
     * - account.depositedCollateralAmount += depositedCollateralAmount
     * - account.borrowedVEth += vEthLoan
     * - position.tokenGasAmount += vGas from swap
     */
    function _createLongPosition(
        Position.Data storage position,
        int256 tokenAmount,
        int256 tokenAmountLimit
    ) internal {
        if (tokenAmount < 0 || tokenAmountLimit < 0) {
            revert Errors.InvalidData(
                "Long Position: Invalid tokenAmount or tokenAmountLimit"
            );
        }

        // with the collateral get vEth (Loan)
        uint256 highestPrice = Epoch.load(position.epochId).maxPriceD18;
        uint256 vEthToSwap = highestPrice.mulDecimal(uint(tokenAmount)); // Taking the max that can be required
        // Todo adjust for the fee. Edge case when the price is almost at max

        position.borrowedVEth += vEthToSwap;

        // with the vEth get vGas (Swap)
        SwapTokensExactOutParams memory params = SwapTokensExactOutParams({
            epochId: position.epochId,
            availableAmountInVEth: vEthToSwap,
            availableAmountInVGas: 0,
            amountInLimitVEth: tokenAmountLimit.toUint().to160(),
            amountInLimitVGas: 0,
            expectedAmountOutVEth: 0,
            expectedAmountOutVGas: tokenAmount.toUint()
        });

        (
            uint256 refundAmountVEth,
            ,
            ,
            uint256 tokenAmountVGas
        ) = swapTokensExactOut(params);

        // Refund excess vEth sent
        position.borrowedVEth -= refundAmountVEth;

        position.updateBalance(tokenAmount, 0, tokenAmountVGas.toInt());
    }

    /**
     * @dev Create a short position
     * With collateral get vGas (Loan)
     * With vGas tokenAmount get vEth (Swap)
     * End result:
     * - account.depositedCollateralAmount += depositedCollateralAmount
     * - account.borrowedVGas += vGasLoan
     * - position.tokenGweiAmount += vEth from swap
     */
    function _createShortPosition(
        Position.Data storage position,
        int256 tokenAmount,
        int256 tokenAmountLimit
    ) internal {
        if (tokenAmount > 0 || tokenAmountLimit > 0) {
            revert Errors.InvalidData(
                "Short Position: Invalid tokenAmount or tokenAmountLimit"
            );
        }

        // with the collateral get vGas (Loan)
        uint256 vGasLoan = (tokenAmount * -1).toUint(); //(collateralAmount).divDecimal(getReferencePrice()); // collatera / vEth = 1/1 ; vGas/vEth = 1/currentPrice

        position.borrowedVGas += vGasLoan;

        // with the vGas get vEth (Swap)
        SwapTokensExactInParams memory params = SwapTokensExactInParams({
            epochId: position.epochId,
            amountInVEth: 0,
            amountInVGas: (tokenAmount * -1).toUint(),
            amountOutLimitVEth: (tokenAmountLimit * -1).toUint(),
            amountOutLimitVGas: 0
        });
        (uint256 tokenAmountVEth, ) = swapTokensExactIn(params);

        position.updateBalance(tokenAmount, tokenAmountVEth.toInt(), 0);
    }

    /**
     * @dev Modify a long position. Can be increased, decreased. Closure or change sides is not allowed here and managed in the calling function
     * tokenAmount is the end result of vGas tokens in the position
     *
     * Increase:
     * With collateral get vEth (Loan)
     * With vEth (use enough to) get detal tokenAmount vGas (Swap)
     * End result:
     * - account.depositedCollateralAmount += depositedCollateralAmount
     * - account.borrowedVEth += vEthLoan
     * - position.tokenGasAmount += vGas from swap
     *
     * Decrease:
     * With vGas get vEth (Swap)
     * Use vEth to pay debt
     * End result:
     * - account.borrowedVEth -= vEth from swap
     * - position.tokenGasAmount -= vGas used on swap
     *
     */
    function _modifyLongPosition(
        Position.Data storage position,
        int256 tokenAmount,
        int256 tokenAmountLimit
    ) internal {
        if (tokenAmount < 0 || tokenAmountLimit < 0) {
            revert Errors.InvalidData(
                "Long Position: Invalid tokenAmount or tokenAmountLimit"
            );
        }

        if (tokenAmount > position.currentTokenAmount) {
            // Increase the position (LONG)
            uint256 delta = (tokenAmount - position.currentTokenAmount)
                .toUint();
            // with the collateral get vEth (Loan)
            uint256 highestPrice = Epoch.load(position.epochId).maxPriceD18;
            uint256 vEthToSwap = highestPrice.mulDecimal(uint(tokenAmount)); // Taking the max that can be required
            // Todo adjust for the fee. Edge case when the price is almost at max

            SwapTokensExactOutParams memory params = SwapTokensExactOutParams({
                epochId: position.epochId,
                availableAmountInVEth: vEthToSwap,
                availableAmountInVGas: 0,
                amountInLimitVEth: tokenAmountLimit.toUint().to160(),
                amountInLimitVGas: 0,
                expectedAmountOutVEth: 0,
                expectedAmountOutVGas: delta
            });

            // with the vEth get vGas (Swap)
            (
                uint256 refundAmountVEth,
                ,
                ,
                uint256 tokenAmountVGas
            ) = swapTokensExactOut(params);
            // Adjust the delta loan with the refund
            vEthToSwap -= refundAmountVEth;
            position.borrowedVEth += vEthToSwap;

            position.updateBalance(delta.toInt(), 0, tokenAmountVGas.toInt());
        } else {
            // Reduce the position (LONG)
            // Need to sell vGas and use it to pay the debt

            int256 delta = (tokenAmount - position.currentTokenAmount);
            int256 deltaEth; // usually is going to be zero

            SwapTokensExactInParams memory params = SwapTokensExactInParams({
                epochId: position.epochId,
                amountInVEth: 0,
                amountInVGas: (delta * -1).toUint(),
                amountOutLimitVEth: tokenAmountLimit.toUint(),
                amountOutLimitVGas: 0
            });

            // with the vGas get vEth (Swap)
            (uint256 tokenAmountVEth, ) = swapTokensExactIn(params);

            // Pay debt with vEth
            if (position.borrowedVEth > tokenAmountVEth) {
                position.borrowedVEth -= tokenAmountVEth;
            } else {
                // Got more vEth than required to pay the debt
                // Add it as available vETH
                deltaEth =
                    tokenAmountVEth.toInt() -
                    position.borrowedVEth.toInt();
                position.borrowedVEth = 0;
            }

            position.updateBalance(delta, deltaEth, delta);
        }
    }

    /**
     * @dev Modify a short position. Can be increased, decreased. Closure or change sides is not allowed here and managed in the calling function
     * tokenAmount is the end result of vGas debt tokens in the position
     *
     * Increase:
     * With collateral get vGas (Loan)
     * With delta tokenAmount vGas get vEth (Swap)
     * End result:
     * - account.borrowedVGas += vGasLoan
     * - position.tokenGweiAmount += vEth from swap
     *
     * Decrease:
     * With vEthTokens get vGas (Swap) to repay debt
     * Use vGas to pay debt
     * End result:
     * - account.borrowedVGas -= vGas from swap
     * - position.tokenGweiAmount -= vEth used on swap
     *
     */
    function _modifyShortPosition(
        Position.Data storage position,
        int256 tokenAmount,
        int256 tokenAmountLimit
    ) internal {
        uint256 tokenAmountAbs = (tokenAmount * -1).toUint();
        uint256 tokenAmountLimitAbs = (tokenAmountLimit * -1).toUint();
        uint256 currentTokenAmountAbs = (position.currentTokenAmount * -1)
            .toUint();

        if (tokenAmount < position.currentTokenAmount) {
            // Increase the position (SHORT)

            uint256 delta = tokenAmountAbs - currentTokenAmountAbs;

            // with the collateral get vGas (Loan)
            uint256 vGasLoan = delta;
            position.borrowedVGas += vGasLoan;

            SwapTokensExactInParams memory params = SwapTokensExactInParams({
                epochId: position.epochId,
                amountInVEth: 0,
                amountInVGas: vGasLoan,
                amountOutLimitVEth: tokenAmountLimitAbs,
                amountOutLimitVGas: 0
            });

            // with the vGas get vEth (Swap)
            (uint256 tokenAmountVEth, ) = swapTokensExactIn(params);

            position.updateBalance(
                delta.toInt() * -1,
                tokenAmountVEth.toInt(),
                0
            );
        } else {
            // Decrease the position (SHORT)
            uint256 delta = currentTokenAmountAbs - tokenAmountAbs;
            uint256 availableVEth = position.depositedCollateralAmount +
                position.vEthAmount;
            position.borrowedVGas -= delta;

            SwapTokensExactOutParams memory params = SwapTokensExactOutParams({
                epochId: position.epochId,
                availableAmountInVEth: availableVEth,
                availableAmountInVGas: 0,
                amountInLimitVEth: tokenAmountLimitAbs.to160(),
                amountInLimitVGas: 0,
                expectedAmountOutVEth: 0,
                expectedAmountOutVGas: delta
            });

            // with the vEth get vGas (Swap)
            (uint256 refundAmountVEth, , , ) = swapTokensExactOut(params);

            uint256 consumedVEth = availableVEth - refundAmountVEth;

            if (consumedVEth > position.vEthAmount) {
                // Not enough vEth to pay the debt
                // Use collateral to pay the remaining debt
                uint256 remainingDebt = consumedVEth - position.vEthAmount;
                position.depositedCollateralAmount -= remainingDebt;

                position.updateBalance(
                    delta.toInt(),
                    -(position.vEthAmount).toInt(), // reduce all vEth
                    0
                );
            } else {
                position.updateBalance(
                    delta.toInt(),
                    -(consumedVEth).toInt(), // reduce all vEth
                    0
                );
            }
        }
    }

    /**
     * @dev Close a position. Can be a long or short position
     *
     * LONG position:
     *
     * With vGas get vEth (Swap) to pay debt
     * If not enough vGas, use collateral to pay the remaining debt
     * End result:
     * - account.borrowedVEth = 0
     * - position.tokenGasAmount -= vGas used on swap (or zero)
     * - account.depositedCollateralAmount -= collateral used to pay the remaining debt
     *
     *
     * SHORT position:
     *
     * With vEth get vGas (Swap) to pay debt
     * If not enough vEth, use collateral as vEth (1:1) to swap for the required vGas to pay the remaining debt
     * End result:
     * - account.borrowedVGas = 0
     * - position.tokenGweiAmount -= vEth used on swap (or zero)
     * - account.depositedCollateralAmount -= collateral used to pay the remaining debt
     *
     * Note:
     * with the position closed, the remaining gas can be sold for vEth and converted to collateral, same for the remaining vEth that is converted 1:1 as colalteral
     * then the remaining collateral can be withdrawn
     */
    function _closePosition(Position.Data storage position) internal {
        if (position.currentTokenAmount > 0) {
            // Close LONG position
            SwapTokensExactInParams memory params = SwapTokensExactInParams({
                epochId: position.epochId,
                amountInVEth: 0,
                amountInVGas: position.vGasAmount,
                amountOutLimitVEth: 0,
                amountOutLimitVGas: 0
            });

            // with the vGas get vEth (Swap)
            (uint256 tokenAmountVEth, ) = swapTokensExactIn(params);

            if (position.borrowedVEth > tokenAmountVEth) {
                // Not enough vEth to pay the debt
                // Use collateral to pay the remaining debt
                uint256 remainingDebt = position.borrowedVEth - tokenAmountVEth;
                position.depositedCollateralAmount -= remainingDebt;
            } else if (position.borrowedVEth < tokenAmountVEth) {
                // Obtained more vEth than required to pay the debt
                // Add it as collateral
                position.depositedCollateralAmount +=
                    tokenAmountVEth -
                    position.borrowedVEth;
            }

            position.borrowedVEth = 0;
        } else {
            // Close SHORT position
            SwapTokensExactInParams memory params = SwapTokensExactInParams({
                epochId: position.epochId,
                amountInVEth: position.vEthAmount,
                amountInVGas: 0,
                amountOutLimitVEth: 0,
                amountOutLimitVGas: 0
            });

            // with the vEth get vGas (Swap)
            (, uint256 tokenAmountVGas) = swapTokensExactIn(params);

            if (position.borrowedVGas > tokenAmountVGas) {
                // Not enough vGas to pay the debt
                // Use collateral to pay the remaining debt
                uint256 remainingDebt = position.borrowedVGas - tokenAmountVGas;
                uint256 vEth = position.depositedCollateralAmount; // Not needed but is here for clarity
                position.depositedCollateralAmount = 0; // used all as vEth in the line above

                // Use collateral (as vEth) to get vGas
                SwapTokensExactOutParams
                    memory secondSwapParams = SwapTokensExactOutParams({
                        epochId: position.epochId,
                        availableAmountInVEth: vEth,
                        availableAmountInVGas: 0,
                        amountInLimitVEth: 0,
                        amountInLimitVGas: 0,
                        expectedAmountOutVEth: 0,
                        expectedAmountOutVGas: remainingDebt
                    });

                // with the vEth get vGas (Swap)
                (uint256 refundAmountVEth, , , ) = swapTokensExactOut(
                    secondSwapParams
                );
                position.depositedCollateralAmount = refundAmountVEth;
            } else if (position.borrowedVGas < tokenAmountVGas) {
                // Obtained more vGas than required to pay the debt
                // Sell it back and convert to collateral
                uint256 extraGas = tokenAmountVGas - position.borrowedVGas;

                SwapTokensExactInParams
                    memory secondSwapParams = SwapTokensExactInParams({
                        epochId: position.epochId,
                        amountInVEth: 0,
                        amountInVGas: extraGas,
                        amountOutLimitVEth: 0,
                        amountOutLimitVGas: 0
                    });

                // with the vGas get vEth (Swap)
                (uint256 tokenAmountVEth, ) = swapTokensExactIn(
                    secondSwapParams
                );

                // Add it as collateral
                position.depositedCollateralAmount += tokenAmountVEth;
            }

            position.borrowedVGas = 0;
        }
        position.resetBalance();
    }

    struct SwapTokensExactInParams {
        uint256 epochId;
        uint256 amountInVEth;
        uint256 amountInVGas;
        uint256 amountOutLimitVEth;
        uint256 amountOutLimitVGas;
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

    struct SwapTokensExactOutParams {
        uint256 epochId;
        uint256 availableAmountInVEth;
        uint256 availableAmountInVGas;
        uint160 amountInLimitVEth;
        uint160 amountInLimitVGas;
        uint256 expectedAmountOutVEth;
        uint256 expectedAmountOutVGas;
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

    function increaseSize(
        int256 currentTokenAmount,
        int256 newTokenAmount
    ) internal pure returns (bool) {
        return
            MigrationMathUtils.abs(newTokenAmount) >
            MigrationMathUtils.abs(currentTokenAmount);
    }

    function sameSide(
        int256 currentTokenAmount,
        int256 newTokenAmount
    ) internal pure returns (bool) {
        if (newTokenAmount == 0) {
            return (true);
        } else if (currentTokenAmount > 0 && newTokenAmount > 0) {
            return (true);
        } else if (currentTokenAmount < 0 && newTokenAmount < 0) {
            return (true);
        } else {
            return (false);
        }
    }
}
