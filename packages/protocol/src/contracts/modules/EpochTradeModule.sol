// SPDX-License-Identifier: MIT
pragma solidity >=0.8.25 <0.9.0;

import "../storage/Position.sol";
import "../storage/ERC721Storage.sol";
import "../../synthetix/utils/DecimalMath.sol";
import {SafeCastI256} from "../../synthetix/utils/SafeCast.sol";
import {SafeCastU256} from "../../synthetix/utils/SafeCast.sol";
import {IEpochTradeModule} from "../interfaces/IEpochTradeModule.sol";

// import "forge-std/console2.sol";

contract EpochTradeModule is IEpochTradeModule {
    using Epoch for Epoch.Data;
    using Position for Position.Data;
    using DecimalMath for uint256;
    using SafeCastI256 for int256;
    using SafeCastU256 for uint256;

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

        if (tokenAmount > 0) {
            _createLongPosition(
                position,
                collateralAmount,
                tokenAmount,
                tokenAmountLimit
            );
        } else {
            _createShortPosition(
                position,
                collateralAmount,
                tokenAmount,
                tokenAmountLimit
            );
        }

        position.updateCollateral(
            Market.load().collateralAsset,
            collateralAmount
        );

        // Validate after trading that collateral is enough
        position.afterTradeCheck();
    }

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

        if (
            !sameSide(position.currentTokenAmount, tokenAmount) ||
            tokenAmount == 0
        ) {
            // go to zero before moving to the other side
            _closePosition(position);
        }

        // Notice: if/else won't enter on tokenAmount == 0 since it's already closed
        if (tokenAmount > 0) {
            _modifyLongPosition(
                position,
                collateralAmount,
                tokenAmount,
                tokenAmountLimit
            );
        } else if (tokenAmount < 0) {
            _modifyShortPosition(
                position,
                collateralAmount,
                tokenAmount,
                tokenAmountLimit
            );
        }

        position.updateCollateral(
            Market.load().collateralAsset,
            collateralAmount
        );

        // Validate after trading that collateral is enough
        position.afterTradeCheck();
    }

    function getReferencePrice(
        uint256 epochId
    ) public view override returns (uint256 price18Digits) {
        Epoch.Data storage epoch = Epoch.load(epochId);

        if (epoch.settled) {
            return epoch.settlementPrice;
        } else {
            return epoch.getCurrentPoolPrice();
        }
    }

    function getLongSizeForCollateral(
        uint256 epochId,
        uint256 collateral
    ) external view returns (uint256 positionSize) {
        /*
        PositionSize = C*K*(1-K*Pl) 
        K = (1-Fee)/Pt
        Where 
        Pt = price at time t 
        Pl = lowest price set in market
        C = collateral
        Fee = Fee ¯\_(ツ)_/¯
        */
        uint256 price = getReferencePrice(epochId);
        uint256 lowestPrice = Epoch.load(epochId).minPriceD18;
        uint256 fee = Epoch.load(epochId).params.feeRate;

        uint256 K = (DecimalMath.UNIT - fee).divDecimal(price);
        positionSize = collateral.mulDecimal(K).mulDecimal(
            DecimalMath.UNIT - K.mulDecimal(lowestPrice)
        );

        return positionSize;
    }

    function getShortSizeForCollateral(
        uint256 epochId,
        uint256 collateral
    ) external view returns (uint256 positionSize) {}

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
        uint256 collateralAmount,
        int256 tokenAmount,
        int256 tokenAmountLimit
    ) internal {
        // with the collateral get vEth (Loan)
        uint256 vEthLoan = collateralAmount; // 1:1

        position.borrowedVEth += vEthLoan;

        if (tokenAmount < 0 || tokenAmountLimit < 0) {
            revert Errors.InvalidData(
                "Long Position: Invalid tokenAmount or tokenAmountLimit"
            );
        }

        // with the vEth get vGas (Swap)
        SwapTokensExactOutParams memory params = SwapTokensExactOutParams({
            epochId: position.epochId,
            availableAmountInVEth: vEthLoan,
            availableAmountInVGas: 0,
            amountInLimitVEth: 0,
            amountInLimitVGas: tokenAmountLimit.toUint().to160(),
            expectedAmountOutVEth: 0,
            expectedAmountOutVGas: tokenAmount.toUint()
        });

        (
            uint256 refundAmountVEth,
            ,
            uint256 tokenAmountVEth,
            uint256 tokenAmountVGas
        ) = swapTokensExactOut(params);

        // Refund excess vEth sent
        position.borrowedVEth -= refundAmountVEth;

        position.updateCollateral(
            Market.load().collateralAsset,
            collateralAmount
        );

        position.updateBalance(
            tokenAmount,
            tokenAmountVEth.toInt(),
            tokenAmountVGas.toInt()
        );
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
        uint256 collateralAmount,
        int256 tokenAmount,
        int256 tokenAmountLimit
    ) internal {
        // with the collateral get vGas (Loan)
        uint256 vGasLoan = (tokenAmount * -1).toUint(); //(collateralAmount).divDecimal(getReferencePrice()); // collatera / vEth = 1/1 ; vGas/vEth = 1/currentPrice

        position.borrowedVGas += vGasLoan;

        if (tokenAmount > 0 || tokenAmountLimit > 0) {
            revert Errors.InvalidData(
                "Short Position: Invalid tokenAmount or tokenAmountLimit"
            );
        }

        // with the vGas get vEth (Swap)
        SwapTokensExactInParams memory params = SwapTokensExactInParams({
            epochId: position.epochId,
            amountInVEth: 0,
            amountInVGas: (tokenAmount * -1).toUint(),
            amountOutLimitVEth: 0,
            amountOutLimitVGas: (tokenAmountLimit * -1).toUint()
        });
        (uint256 tokenAmountVEth, uint256 tokenAmountVGas) = swapTokensExactIn(
            params
        );

        position.updateCollateral(
            Market.load().collateralAsset,
            collateralAmount
        );

        position.updateBalance(
            tokenAmount,
            tokenAmountVEth.toInt(),
            tokenAmountVGas.toInt()
        );
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
        uint256 collateralAmount,
        int256 tokenAmount,
        int256 tokenAmountLimit
    ) internal {
        // TODO check if after settlement and use the settlement price

        if (tokenAmount > position.currentTokenAmount) {
            // Increase the position (LONG)
            uint256 delta = (tokenAmount - position.currentTokenAmount)
                .toUint();
            // with the collateral get vEth (Loan)
            uint256 vEthDeltaLoan = collateralAmount; // 1:1

            SwapTokensExactOutParams memory params = SwapTokensExactOutParams({
                epochId: position.epochId,
                availableAmountInVEth: vEthDeltaLoan,
                availableAmountInVGas: 0,
                amountInLimitVEth: 0,
                amountInLimitVGas: 0,
                expectedAmountOutVEth: 0,
                expectedAmountOutVGas: delta
            });

            // with the vEth get vGas (Swap)
            (
                uint256 refundAmountVEth,
                ,
                uint256 tokenAmountVEth,
                uint256 tokenAmountVGas
            ) = swapTokensExactOut(params);
            // Adjust the delta loan with the refund
            vEthDeltaLoan -= refundAmountVEth;
            position.borrowedVEth += vEthDeltaLoan;

            position.updateBalance(
                delta.toInt(),
                tokenAmountVEth.toInt(),
                tokenAmountVGas.toInt()
            );
        } else {
            // Reduce the position (LONG)

            int256 delta = (tokenAmount - position.currentTokenAmount);

            SwapTokensExactInParams memory params = SwapTokensExactInParams({
                epochId: position.epochId,
                amountInVEth: 0,
                amountInVGas: (delta * -1).toUint(),
                amountOutLimitVEth: 0,
                amountOutLimitVGas: 0
            });

            // with the vGas get vEth (Swap)
            (
                uint256 tokenAmountVEth,
                uint256 tokenAmountVGas
            ) = swapTokensExactIn(params);

            // Pay debt with vEth
            position.borrowedVEth -= tokenAmountVEth;

            position.updateBalance(delta, 0, delta);
        }

        position.updateCollateral(
            Market.load().collateralAsset,
            collateralAmount
        );
    }

    /**
     * @dev Modify a short position. Can be increased, decreased. Closure or change sides is not allowed here and managed in the calling function
     * tokenAmount is the end result of vGas debt tokens in the position
     *
     * Increase:
     * With collateral get vGas (Loan)
     * With delta tokenAmount vGas get vEth (Swap)
     * End result:
     * - account.depositedCollateralAmount += depositedCollateralAmount
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
        uint256 collateralAmount,
        int256 tokenAmount,
        int256 tokenAmountLimit
    ) internal {
        // TODO check if after settlement and use the settlement price

        if (tokenAmount < position.currentTokenAmount) {
            // Increase the position (SHORT)

            int256 delta = (tokenAmount - position.currentTokenAmount);
            int256 deltaLimit;
            if (tokenAmountLimit >= position.currentTokenAmount) {
                deltaLimit = 0;
            } else {
                deltaLimit = (tokenAmountLimit - position.currentTokenAmount);
            }

            // with the collateral get vGas (Loan)
            uint256 vGasLoan = (delta * -1).toUint();
            position.borrowedVGas += vGasLoan;

            SwapTokensExactInParams memory params = SwapTokensExactInParams({
                epochId: position.epochId,
                amountInVEth: 0,
                amountInVGas: vGasLoan,
                amountOutLimitVEth: 0,
                amountOutLimitVGas: (deltaLimit * -1).toUint()
            });

            // with the vGas get vEth (Swap)
            (
                uint256 tokenAmountVEth,
                uint256 tokenAmountVGas
            ) = swapTokensExactIn(params);

            position.updateBalance(
                delta,
                tokenAmountVEth.toInt(),
                tokenAmountVGas.toInt()
            );
        } else {
            // Decrease the position (SHORT)
            int256 delta = (position.currentTokenAmount - tokenAmount);
            position.borrowedVGas -= (delta * -1).toUint();

            SwapTokensExactOutParams memory params = SwapTokensExactOutParams({
                epochId: position.epochId,
                availableAmountInVEth: position.vEthAmount,
                availableAmountInVGas: 0,
                amountInLimitVEth: 0,
                amountInLimitVGas: 0,
                expectedAmountOutVEth: 0,
                expectedAmountOutVGas: (delta * -1).toUint()
            });

            // with the vEth get vGas (Swap)
            (
                uint256 refundAmountVEth,
                uint256 refundAmountVGas,
                uint256 tokenAmountVEth,
                uint256 tokenAmountVGas
            ) = swapTokensExactOut(params);

            position.updateBalance(
                -delta,
                -(position.vEthAmount - refundAmountVEth).toInt(),
                0
            );
        }

        position.updateCollateral(
            Market.load().collateralAsset,
            collateralAmount
        );
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
        // TODO check if after settlement and use the settlement price

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
        epoch.validateSettlmentState();

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
        epoch.validateSettlmentState();

        if (epoch.settled) {
            uint256 consumedAmountInVEth;
            uint256 consumedAmountInVGas;
            (
                consumedAmountInVEth,
                consumedAmountInVGas,
                tokenAmountVEth,
                tokenAmountVGas
            ) = _afterSettlementSwapExactOut(
                epoch,
                params.expectedAmountOutVEth,
                params.expectedAmountOutVGas
            );
            refundAmountVEth =
                params.availableAmountInVEth -
                consumedAmountInVEth;
            refundAmountVGas =
                params.availableAmountInVGas -
                consumedAmountInVGas;
        } else {
            address tokenIn;
            address tokenOut;
            uint256 amountOut;
            uint160 sqrtPriceLimitX96;

            if (params.expectedAmountOutVEth > 0) {
                tokenIn = address(epoch.gasToken);
                tokenOut = address(epoch.ethToken);
                amountOut = params.expectedAmountOutVEth;
                sqrtPriceLimitX96 = params.amountInLimitVGas;
            } else {
                tokenIn = address(epoch.ethToken);
                tokenOut = address(epoch.gasToken);
                amountOut = params.expectedAmountOutVGas;
                sqrtPriceLimitX96 = params.amountInLimitVEth; // TODO use the input param
            }

            // TODO amountInMaximum and sqrtPriceLimitX96 should be passed as param to prevent slippage
            // TODO -- Naively set amountInMaximum to maxUint . In production, use an oracle or other data source to choose a safer value for amountOutMinimum.
            // TODO -- We also set the sqrtPriceLimitx96 to be 0 to ensure we swap our exact input amount.
            ISwapRouter.ExactOutputSingleParams memory swapParams = ISwapRouter
                .ExactOutputSingleParams({
                    tokenIn: tokenIn,
                    tokenOut: tokenOut,
                    fee: epoch.params.feeRate,
                    recipient: address(this),
                    deadline: block.timestamp,
                    amountOut: amountOut,
                    amountInMaximum: type(uint256).max,
                    sqrtPriceLimitX96: sqrtPriceLimitX96
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
            amountOutVGas = amountInVEth.divDecimal(epoch.settlementPrice);
        } else {
            amountOutVEth = amountInVGas.mulDecimal(epoch.settlementPrice);
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
        returns (
            uint256 consumedAmountInVEth,
            uint256 consumedAmountInVGas,
            uint256 tokenOutVEth,
            uint256 tokenOutVGas
        )
    {
        if (amountOutVGas > 0) {
            tokenOutVEth = 0;
            tokenOutVGas = amountOutVGas;
            consumedAmountInVEth = amountOutVGas.mulDecimal(
                epoch.settlementPrice
            );
            consumedAmountInVGas = 0;
        } else {
            tokenOutVEth = amountOutVEth;
            tokenOutVGas = 0;
            consumedAmountInVEth = 0;
            consumedAmountInVGas = amountOutVEth.divDecimal(
                epoch.settlementPrice
            );
        }
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
