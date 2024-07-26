// SPDX-License-Identifier: MIT
pragma solidity >=0.8.25 <0.9.0;

import "../storage/FAccount.sol";
import "../storage/Position.sol";
import "../storage/ERC721Storage.sol";
import "../storage/ERC721EnumerableStorage.sol";
import "../../synthetix/utils/DecimalMath.sol";
import {SafeCastI256} from "../../synthetix/utils/SafeCast.sol";
import {SafeCastU256} from "../../synthetix/utils/SafeCast.sol";
import "@uniswap/v3-core/contracts/interfaces/IUniswapV3Pool.sol";

import "forge-std/console2.sol";

contract EpochTradeModule {
    using Epoch for Epoch.Data;
    using Position for Position.Data;
    using DecimalMath for uint256;
    using SafeCastI256 for int256;
    using SafeCastU256 for uint256;

    function createTraderPosition(
        uint256 collateralAmount,
        int256 tokenAmount,
        int256 tokenAmountLimit
    ) external returns (uint256 accountId) {
        // create/load account
        Epoch.Data storage epoch = Epoch.load();
        // check if epoch is not settled
        epoch.validateNotSettled();

        accountId = ERC721EnumerableStorage.totalSupply() + 1;

        FAccount.Data storage account = FAccount.createValid(accountId);
        ERC721Storage._mint(msg.sender, accountId);

        // Create empty position
        Position.Data storage position = Position.load(accountId);
        position.accountId = accountId;

        if (tokenAmount > 0) {
            _createLongPosition(
                account,
                position,
                collateralAmount,
                tokenAmount,
                tokenAmountLimit
            );
        } else {
            _createShortPosition(
                account,
                position,
                collateralAmount,
                tokenAmount,
                tokenAmountLimit
            );
        }
    }

    function modifyTraderPosition(
        uint256 accountId,
        uint256 collateralAmount,
        int256 tokenAmount,
        int256 tokenAmountLimit
    ) external {
        // console2.log("modifyTraderPosition");
        // identify the account and position
        // Notice: accountId is the tokenId
        require(
            ERC721Storage._ownerOf(accountId) == msg.sender,
            "Not NFT owner"
        );
        FAccount.Data storage account = FAccount.loadValid(accountId);
        Position.Data storage position = Position.loadValid(accountId);

        // console2.log("modifyTraderPosition collateralAmount", collateralAmount);
        // console2.log("modifyTraderPosition tokenAmount", tokenAmount);
        // console2.log("modifyTraderPosition tokenAmountLimit", tokenAmountLimit);
        // console2.log(
        //     "modifyTraderPosition position.currentTokenAmount",
        //     position.currentTokenAmount
        // );
        // console2.log(
        //     "sameSide",
        //     sameSide(position.currentTokenAmount, tokenAmount)
        // );

        // console2.log("PASO 1");
        if (
            !sameSide(position.currentTokenAmount, tokenAmount) ||
            tokenAmount == 0
        ) {
            // console2.log("PASO 2");
            // go to zero before moving to the other side
            _closePosition(account, position, collateralAmount);
            // console2.log("PASO 3");
        }

        // console2.log("PASO 4");

        if (tokenAmount > 0) {
            // console2.log("modifyTraderPosition LONG");
            _modifyLongPosition(
                account,
                position,
                collateralAmount,
                tokenAmount,
                tokenAmountLimit
            );
        } else if (tokenAmount < 0) {
            // console2.log("modifyTraderPosition SHORT");
            _modifyShortPosition(
                account,
                position,
                collateralAmount,
                tokenAmount,
                tokenAmountLimit
            );
        }
    }

    /**
     * @dev Create a long position
     * With collateral get vEth (Loan)
     * With vEth (use enough to) get vGas (Swap)
     * End result:
     * - account.collateralAmount += collateralAmount
     * - account.borrowedGwei += vEthLoan
     * - position.tokenGasAmount += vGas from swap
     */
    function _createLongPosition(
        FAccount.Data storage account,
        Position.Data storage position,
        uint256 collateralAmount,
        int256 tokenAmount,
        int256 tokenAmountLimit
    ) internal {
        // with the collateral get vEth (Loan)
        uint vEthLoan = collateralAmount; // 1:1

        account.collateralAmount += collateralAmount;
        account.borrowedGwei += vEthLoan;

        if (tokenAmount < 0 || tokenAmountLimit < 0) {
            console2.log("IT SHOULD REVERT WITH UNEXPECTED LONG POSITION");
            // TODO revert
        }

        // with the vEth get vGas (Swap)
        SwapTokensExactOutParams memory params = SwapTokensExactOutParams({
            availableAmountInVEth: vEthLoan,
            availableAmountInVGas: 0,
            amountInLimitVEth: 0,
            amountInLimitVGas: tokenAmountLimit.toUint(),
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
        account.borrowedGwei -= refundAmountVEth;

        position.updateBalance(
            tokenAmount,
            tokenAmountVEth.toInt(),
            tokenAmountVGas.toInt()
        );
        // TODO check if the collateral is enough for the position
    }

    /**
     * @dev Create a short position
     * With collateral get vGas (Loan)
     * With vGas tokenAmount get vEth (Swap)
     * End result:
     * - account.collateralAmount += collateralAmount
     * - account.borrowedGas += vGasLoan
     * - position.tokenGweiAmount += vEth from swap
     */
    function _createShortPosition(
        FAccount.Data storage account,
        Position.Data storage position,
        uint256 collateralAmount,
        int256 tokenAmount,
        int256 tokenAmountLimit
    ) internal {
        // with the collateral get vGas (Loan)
        uint vGasLoan = (tokenAmount * -1).toUint(); //(collateralAmount).divDecimal(getReferencePrice()); // collatera / vEth = 1/1 ; vGas/vEth = 1/currentPrice

        account.collateralAmount += collateralAmount;
        account.borrowedGas += vGasLoan;

        if (tokenAmount > 0 || tokenAmountLimit > 0) {
            console2.log("IT SHOULD REVERT WITH UNEXPECTED SHORT POSITION");
            // TODO revert
        }

        // with the vGas get vEth (Swap)
        SwapTokensExactInParams memory params = SwapTokensExactInParams({
            amountInVEth: 0,
            amountInVGas: (tokenAmount * -1).toUint(),
            amountOutLimitVEth: 0,
            amountOutLimitVGas: (tokenAmountLimit * -1).toUint()
        });
        (uint256 tokenAmountVEth, uint256 tokenAmountVGas) = swapTokensExactIn(
            params
        );
        // console2.log("_createShortPosition tokenAmountVEth", tokenAmountVEth);
        // console2.log("_createShortPosition tokenAmountVGas", tokenAmountVGas);

        position.updateBalance(
            tokenAmount,
            tokenAmountVEth.toInt(),
            tokenAmountVGas.toInt()
        );

        // TODO check if the collateral is enough for the position
    }

    /**
     * @dev Modify a long position. Can be increased, decreased. Closure or change sides is not allowed here and managed in the calling function
     * tokenAmount is the end result of vGas tokens in the position
     *
     * Increase:
     * With collateral get vEth (Loan)
     * With vEth (use enough to) get detal tokenAmount vGas (Swap)
     * End result:
     * - account.collateralAmount += collateralAmount
     * - account.borrowedGwei += vEthLoan
     * - position.tokenGasAmount += vGas from swap
     *
     * Decrease:
     * With vGas get vEth (Swap)
     * Use vEth to pay debt
     * End result:
     * - account.borrowedGwei -= vEth from swap
     * - position.tokenGasAmount -= vGas used on swap
     *
     */
    function _modifyLongPosition(
        FAccount.Data storage account,
        Position.Data storage position,
        uint256 collateralAmount,
        int256 tokenAmount,
        int256 tokenAmountLimit
    ) internal {
        // console2.log("_modifyLongPosition");
        // TODO check if after settlement and use the settlement price

        if (tokenAmount > position.currentTokenAmount) {
            // Increase the position (LONG)
            uint delta = (tokenAmount - position.currentTokenAmount).toUint();
            // with the collateral get vEth (Loan)
            uint vEthLoan = collateralAmount; // 1:1
            account.collateralAmount += collateralAmount;
            account.borrowedGwei += vEthLoan;

            SwapTokensExactOutParams memory params = SwapTokensExactOutParams({
                availableAmountInVEth: vEthLoan,
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
            account.borrowedGwei -= refundAmountVEth;

            position.updateBalance(
                delta.toInt(),
                tokenAmountVEth.toInt(),
                tokenAmountVGas.toInt()
            );
        } else {
            // Reduce the position (LONG)
            if (collateralAmount > 0) {
                console2.log("IT SHULD REVERT WITH UNEXPECTED COLLATERAL");
                // return;
            }

            int delta = (tokenAmount - position.currentTokenAmount);
            console2.log(
                "_modifyLongPosition position.currentTokenAmount",
                position.currentTokenAmount
            );
            console2.log("_modifyLongPosition tokenAmount", tokenAmount);
            console2.log("_modifyLongPosition delta", delta);
            console2.log("_modifyLongPosition price", getReferencePrice());

            SwapTokensExactInParams memory params = SwapTokensExactInParams({
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

            console2.log(
                "_modifyLongPosition amountInVGas         ",
                params.amountInVGas
            );
            console2.log(
                "_modifyLongPosition tokenAmountVGas      ",
                tokenAmountVGas
            );
            console2.log(
                "_modifyLongPosition tokenAmountVEth      ",
                tokenAmountVEth
            );
            console2.log(
                "_modifyLongPosition account.borrowedGwei ",
                account.borrowedGwei
            );

            // Pay debt with vEth
            account.borrowedGwei -= tokenAmountVEth;

            position.updateBalance(delta, 0, delta);
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
     * - account.collateralAmount += collateralAmount
     * - account.borrowedGas += vGasLoan
     * - position.tokenGweiAmount += vEth from swap
     *
     * Decrease:
     * With vEthTokens get vGas (Swap) to repay debt
     * Use vGas to pay debt
     * End result:
     * - account.borrowedGas -= vGas from swap
     * - position.tokenGweiAmount -= vEth used on swap
     *
     */
    function _modifyShortPosition(
        FAccount.Data storage account,
        Position.Data storage position,
        uint256 collateralAmount,
        int256 tokenAmount,
        int256 tokenAmountLimit
    ) internal {
        // console2.log("_modifyShortPosition");
        if (tokenAmount < position.currentTokenAmount) {
            // Increase the position (SHORT)

            int delta = (tokenAmount - position.currentTokenAmount);
            int deltaLimit = (tokenAmountLimit - position.currentTokenAmount);
            // console2.log("_modifyShortPosition delta", delta);
            // console2.log("_modifyShortPosition deltaLimit", deltaLimit);
            // console2.log(
            //     "_modifyShortPosition position.currentTokenAmount",
            //     position.currentTokenAmount
            // );
            // console2.log("_modifyShortPosition tokenAmount", tokenAmount);

            // with the collateral get vGas (Loan)
            uint vGasLoan = getReferencePrice() * (delta * -1).toUint(); //
            account.collateralAmount += collateralAmount;
            account.borrowedGas += vGasLoan;

            SwapTokensExactInParams memory params = SwapTokensExactInParams({
                amountInVEth: 0,
                amountInVGas: (delta * -1).toUint(),
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
            if (collateralAmount > 0) {
                console2.log("IT SHULD REVERT WITH UNEXPECTED COLLATERAL");
                // return;
            }

            int delta = (position.currentTokenAmount - tokenAmount);
            // console2.log("_modifyShortPosition delta", delta);
            // console2.log(
            //     "_modifyShortPosition position.currentTokenAmount",
            //     position.currentTokenAmount
            // );
            // console2.log("_modifyShortPosition tokenAmount", tokenAmount);

            SwapTokensExactOutParams memory params = SwapTokensExactOutParams({
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

            // console2.log(
            //     "_modifyShortPosition refundAmountVEth",
            //     refundAmountVEth
            // );
            // console2.log(
            //     "_modifyShortPosition refundAmountVGas",
            //     refundAmountVGas
            // );
            // console2.log(
            //     "_modifyShortPosition tokenAmountVEth",
            //     tokenAmountVEth
            // );
            // console2.log(
            //     "_modifyShortPosition tokenAmountVGas",
            //     tokenAmountVGas
            // );

            account.borrowedGas -= tokenAmountVGas;

            position.updateBalance(
                delta,
                (position.vEthAmount - refundAmountVEth).toInt(),
                0
            );
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
     * - account.borrowedGwei = 0
     * - position.tokenGasAmount -= vGas used on swap (or zero)
     * - account.collateralAmount -= collateral used to pay the remaining debt
     *
     *
     * SHORT position:
     *
     * With vEth get vGas (Swap) to pay debt
     * If not enough vEth, use collateral as vEth (1:1) to swap for the required vGas to pay the remaining debt
     * End result:
     * - account.borrowedGas = 0
     * - position.tokenGweiAmount -= vEth used on swap (or zero)
     * - account.collateralAmount -= collateral used to pay the remaining debt
     *
     * Note:
     * with the position closed, the remaining gas can be sold for vEth and converted to collateral, same for the remaining vEth that is converted 1:1 as colalteral
     * then the remaining collateral can be withdrawn
     */
    function _closePosition(
        FAccount.Data storage account,
        Position.Data storage position,
        uint256 collateralAmount
    ) internal {
        // TODO check if after settlement and use the settlement price

        // Add sent collateral
        account.collateralAmount += collateralAmount;

        if (position.currentTokenAmount > 0) {
            // Close LONG position
            SwapTokensExactInParams memory params = SwapTokensExactInParams({
                amountInVEth: 0,
                amountInVGas: position.vGasAmount,
                amountOutLimitVEth: 0,
                amountOutLimitVGas: 0
            });

            // with the vGas get vEth (Swap)
            (uint256 tokenAmountVEth, ) = swapTokensExactIn(params);

            if (account.borrowedGwei > tokenAmountVEth) {
                // Not enough vEth to pay the debt
                // Use collateral to pay the remaining debt
                uint256 remainingDebt = account.borrowedGwei - tokenAmountVEth;
                account.collateralAmount -= remainingDebt;
                account.borrowedGwei = 0;
            } else if (account.borrowedGwei < tokenAmountVEth) {
                // Obtained more vEth than required to pay the debt
                // Add it as collateral
                account.collateralAmount +=
                    tokenAmountVEth -
                    account.borrowedGwei;
            }

            account.borrowedGwei = 0;

            position.resetBalance();
        } else {
            // Close SHORT position

            SwapTokensExactInParams memory params = SwapTokensExactInParams({
                amountInVEth: position.vEthAmount,
                amountInVGas: 0,
                amountOutLimitVEth: 0,
                amountOutLimitVGas: 0
            });

            // with the vEth get vGas (Swap)
            (, uint256 tokenAmountVGas) = swapTokensExactIn(params);

            if (account.borrowedGas > tokenAmountVGas) {
                // Not enough vGas to pay the debt
                // Use collateral to pay the remaining debt
                uint256 remainingDebt = account.borrowedGas - tokenAmountVGas;
                uint256 vEth = account.collateralAmount; // Not needed but is here for clarity
                account.collateralAmount = 0; // used all as vEth in the line above

                // Use collateral (as vEth) to get vGas
                SwapTokensExactOutParams
                    memory secondSwapParams = SwapTokensExactOutParams({
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
                account.collateralAmount += refundAmountVEth;

                account.borrowedGwei = 0;
            } else if (account.borrowedGas < tokenAmountVGas) {
                // Obtained more vGas than required to pay the debt
                // Sell it back and convert to collateral
                uint256 extraGas = tokenAmountVGas - account.borrowedGas;

                SwapTokensExactInParams
                    memory secondSwapParams = SwapTokensExactInParams({
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
                account.collateralAmount += tokenAmountVEth;
            }

            account.borrowedGwei = 0;

            position.resetBalance();
        }
    }

    struct SwapTokensExactInParams {
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
        Epoch.Data storage epoch = Epoch.load();
        epoch.validateSettlmentState();

        if (epoch.settled) {
            (amountOutVEth, amountOutVGas) = _afterSettlementSwapExactIn(
                epoch,
                params.amountInVEth,
                params.amountInVGas
            );
        } else {
            ISwapRouter.ExactInputSingleParams memory swapParams;
            swapParams.fee = epoch.marketParams.feeRate;
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
                console2.log("Entered in the else => swap gas for eth");
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
            // console2.log("swapTokensExactIn amountOut", amountOut);

            if (params.amountInVEth > 0) {
                amountOutVGas = amountOut;
            } else {
                console2.log("Entered in the else => result is for  eth");
                amountOutVEth = amountOut;
            }
        }
    }

    struct SwapTokensExactOutParams {
        uint256 availableAmountInVEth;
        uint256 availableAmountInVGas;
        uint256 amountInLimitVEth;
        uint256 amountInLimitVGas;
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
            revert("Only one token can be traded at a time");
        }

        if (
            params.expectedAmountOutVEth == 0 &&
            params.expectedAmountOutVGas == 0
        ) {
            revert("At least one token should be traded");
        }

        Market.Data storage market = Market.load();
        Epoch.Data storage epoch = Epoch.load();
        epoch.validateSettlmentState();

        if (epoch.settled) {
            uint consumedAmountInVEth;
            uint consumedAmountInVGas;
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
                tokenIn = address(epoch.ethToken);
                tokenOut = address(epoch.gasToken);
                amountOut = params.expectedAmountOutVEth;
                sqrtPriceLimitX96 = TickMath.MIN_SQRT_RATIO + 1;
            } else {
                tokenIn = address(epoch.gasToken);
                tokenOut = address(epoch.ethToken);
                amountOut = params.expectedAmountOutVGas;
                sqrtPriceLimitX96 = TickMath.MAX_SQRT_RATIO - 1;
            }

            // {
            //     // LOG BLOCK
            //     (uint160 sqrtPriceX96, int24 tick, , , , , ) = IUniswapV3Pool(
            //         epoch.pool
            //     ).slot0();
            //     console2.log("exact out swap: tokenIn", tokenIn);
            //     console2.log("exact out swap: tokenOut", tokenOut);
            //     console2.log("exact out swap: amountOut", amountOut);
            //     console2.log(
            //         "exact out swap: sqrtPriceLimitX96",
            //         sqrtPriceLimitX96
            //     );
            //     console2.log(
            //         "exact out swap: MAX Sqrt Ratio   ",
            //         TickMath.MAX_SQRT_RATIO
            //     );
            //     console2.log("exact out swap: sqrtPriceX96     ", sqrtPriceX96);
            //     console2.log("exact out swap: tick", tick);
            // }

            // TODO amountInMaximum and sqrtPriceLimitX96 should be passed as param to prevent slippage
            // TODO -- Naively set amountInMaximum to maxUint . In production, use an oracle or other data source to choose a safer value for amountOutMinimum.
            // TODO -- We also set the sqrtPriceLimitx96 to be 0 to ensure we swap our exact input amount.
            ISwapRouter.ExactOutputSingleParams memory swapParams = ISwapRouter
                .ExactOutputSingleParams({
                    tokenIn: tokenIn,
                    tokenOut: tokenOut,
                    fee: epoch.marketParams.feeRate,
                    recipient: address(this),
                    deadline: block.timestamp,
                    amountOut: amountOut,
                    amountInMaximum: type(uint256).max,
                    sqrtPriceLimitX96: sqrtPriceLimitX96
                });

            uint256 amountIn = market.uniswapSwapRouter.exactOutputSingle(
                swapParams
            );
            // console2.log("swapTokensExactOut amountIn", amountIn);
            // console2.log(
            //     "swapTokensExactOut params.expectedAmountOutVEth",
            //     params.expectedAmountOutVEth
            // );
            // console2.log(
            //     "swapTokensExactOut params.expectedAmountOutVGas",
            //     params.expectedAmountOutVGas
            // );
            // console2.log(
            //     "swapTokensExactOut params.availableAmountInVGas",
            //     params.availableAmountInVGas
            // );
            // console2.log(
            //     "swapTokensExactOut params.availableAmountInVEth",
            //     params.availableAmountInVEth
            // );
            tokenAmountVEth = params.expectedAmountOutVEth;
            tokenAmountVGas = params.expectedAmountOutVGas;

            if (params.expectedAmountOutVEth > 0) {
                if (params.availableAmountInVGas > amountIn) {
                    refundAmountVGas = params.availableAmountInVGas - amountIn;
                } else {
                    console2.log(
                        "IT SHOULD REVERT WITH NOT ENOUGH availableAmountInVGas"
                    );
                }
                refundAmountVGas = params.availableAmountInVGas - amountIn;
            } else {
                if (params.availableAmountInVEth > amountIn) {
                    refundAmountVEth = params.availableAmountInVEth - amountIn;
                } else {
                    console2.log(
                        "IT SHOULD REVERT WITH NOT ENOUGH availableAmountInVEth"
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
        console2.log("_afterSettlementSwapExactIn");

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
        console2.log("_afterSettlementSwapExactIn");

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
        int currentTokenAmount,
        int newTokenAmount
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

    function getReferencePrice() public view returns (uint256 price18Digits) {
        Epoch.Data storage epoch = Epoch.load();

        // Just log data for debugging, remove this block after testing
        // {
        //     (uint160 sqrtRatioX96, int24 tick, , , , , ) = IUniswapV3Pool(
        //         epoch.pool
        //     ).slot0();
        //     int24 spacing = IUniswapV3Pool(epoch.pool).tickSpacing();
        //     uint256 price = (((uint256(sqrtRatioX96) * 1e18) / 2 ** 96) ** 2) /
        //         1e18;
        //     uint256 priceMulDiv = FullMath.mulDiv(
        //         uint256(sqrtRatioX96),
        //         uint256(sqrtRatioX96),
        //         FixedPoint96.Q96
        //     );

        //     // uint256 price2 = (sqrtRatioX96 * sqrtRatioX96) >> (96 * 2);
        //     uint256 price2 = (uint256(sqrtRatioX96) * uint256(sqrtRatioX96)) >>
        //         (192); // 192 == 96 * 2

        //     console2.log("Spacing : ", spacing);
        //     console2.log("SqrtPriceX96 : ", sqrtRatioX96);
        //     console2.log("Tick : ", tick);
        //     console2.log("Price : ", price);
        //     console2.log("priceMulDiv : ", priceMulDiv);
        //     console2.log("price2 : ", price2);
        // }

        if (epoch.settled) {
            return epoch.settlementPrice;
        } else {
            (uint160 sqrtRatioX96, , , , , , ) = IUniswapV3Pool(epoch.pool)
                .slot0();
            // TODO find a simple expression to calculate the price
            uint256 price = (((uint256(sqrtRatioX96) * 1e18) / 2 ** 96) ** 2) /
                1e18;
            return price;
        }
    }
}
