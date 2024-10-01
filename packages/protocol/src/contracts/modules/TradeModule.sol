// SPDX-License-Identifier: MIT
pragma solidity >=0.8.25 <0.9.0;

import "../storage/Position.sol";
import "../storage/ERC721Storage.sol";
import "../storage/Trade.sol";
import "@synthetixio/core-contracts/contracts/utils/DecimalMath.sol";
import "@openzeppelin/contracts-upgradeable/utils/ReentrancyGuardUpgradeable.sol";
import {SafeCastI256} from "@synthetixio/core-contracts/contracts/utils/SafeCast.sol";
import {SafeCastU256} from "@synthetixio/core-contracts/contracts/utils/SafeCast.sol";
import {ITradeModule} from "../interfaces/ITradeModule.sol";

import "forge-std/console2.sol";

/**
 * @title Module for trade positions.
 * @dev See ITradeModule.
 */
contract TradeModule is ITradeModule, ReentrancyGuardUpgradeable {
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
        int256 size,
        uint256 deltaCollateralLimit,
        uint256 deadline
    ) external nonReentrant returns (uint256 positionId) {
        require(block.timestamp <= deadline, "Transaction too old");

        if (size == 0) {
            revert Errors.InvalidData("Size cannot be 0");
        }

        Epoch.Data storage epoch = Epoch.load(epochId);

        // check if epoch is not settled
        epoch.validateNotSettled();

        // Mint position NFT and initialize position
        positionId = ERC721EnumerableStorage.totalSupply() + 1;
        Position.Data storage position = Position.createValid(positionId);
        ERC721Storage._checkOnERC721Received(
            address(this),
            msg.sender,
            positionId,
            ""
        );
        ERC721Storage._mint(msg.sender, positionId);
        position.epochId = epochId;
        position.kind = IFoilStructs.PositionKind.Trade;

        uint256 initialPrice = Trade.getReferencePrice(epochId);

        // Create the position
        uint256 requiredCollateralAmount;
        uint256 vEthAmount;
        uint256 vGasAmount;
        uint256 tradeRatioD18;

        if (size > 0) {
            (
                vEthAmount,
                vGasAmount,
                requiredCollateralAmount,
                tradeRatioD18
            ) = _moveToLongDirection(position, epoch, size);
        } else {
            (
                vEthAmount,
                vGasAmount,
                requiredCollateralAmount,
                tradeRatioD18
            ) = _moveToShortDirection(position, epoch, size);
        }

        // Check if the collateral is within the limit
        if (requiredCollateralAmount > deltaCollateralLimit) {
            revert Errors.CollateralLimitReached(
                requiredCollateralAmount.toInt(),
                deltaCollateralLimit.toInt()
            );
        }

        // Transfer the locked collateral to the market
        position.updateCollateral(requiredCollateralAmount);

        // Validate after trading that collateral is enough
        position.afterTradeCheck();

        uint256 finalPrice = Trade.getReferencePrice(epochId);

        epoch.validateCurrentPoolPriceInRange();

        emit TraderPositionCreated(
            epochId,
            positionId,
            requiredCollateralAmount,
            position.vEthAmount,
            position.vGasAmount,
            position.borrowedVEth,
            position.borrowedVGas,
            initialPrice,
            finalPrice,
            tradeRatioD18
        );
    }

    /**
     * @inheritdoc ITradeModule
     */
    function modifyTraderPosition(
        uint256 positionId,
        int256 size,
        int256 deltaCollateralLimit,
        uint256 deadline
    ) external nonReentrant {
        require(block.timestamp <= deadline, "Transaction too old");

        if (ERC721Storage._ownerOf(positionId) != msg.sender) {
            revert Errors.NotAccountOwnerOrAuthorized(positionId, msg.sender);
        }

        Position.Data storage position = Position.loadValid(positionId);

        if (position.kind != IFoilStructs.PositionKind.Trade) {
            revert Errors.InvalidPositionKind();
        }

        int256 deltaSize = size - position.positionSize();
        if (deltaSize == 0) {
            revert Errors.InvalidData("Size not changed");
        }

        Epoch.Data storage epoch = Epoch.load(position.epochId);

        // check if epoch is not settled
        epoch.validateNotSettled();

        uint256 initialPrice = Trade.getReferencePrice(position.epochId);

        uint256 requiredCollateralAmount;
        uint256 vEthAmount;
        uint256 vGasAmount;
        uint256 tradeRatioD18;

        if (deltaSize > 0) {
            (
                vEthAmount,
                vGasAmount,
                requiredCollateralAmount,
                tradeRatioD18
            ) = _moveToLongDirection(position, epoch, deltaSize);
        } else {
            (
                vEthAmount,
                vGasAmount,
                requiredCollateralAmount,
                tradeRatioD18
            ) = _moveToShortDirection(position, epoch, deltaSize);
        }

        // Ensures that the position only have single side tokens
        position.reconcileTokens();

        if (size == 0) {
            // Closing the position. No need to check collateral limit
            // We need to:

            // 1. Confirm no vgas tokens
            if (position.vGasAmount > 0) {
                // Notice. This error should not happen. If it's here it means something went wrong
                revert Errors.InvalidData(
                    "Cannot close position with vGas tokens"
                );
            }
            if (position.borrowedVGas > 0) {
                // Notice. This error should not happen. If it's here it means something went wrong
                revert Errors.InvalidData(
                    "Cannot close position with borrowed vGas tokens"
                );
            }

            // 2. Confirm collateral is enough to pay for borrowed veth
            if (position.borrowedVEth > 0) {
                if (
                    position.borrowedVEth > position.depositedCollateralAmount
                ) {
                    // Notice. This error should not happen. If it's here it means something went wrong
                    revert Errors.InsufficientCollateral(
                        position.borrowedVEth,
                        position.depositedCollateralAmount
                    );
                }
            }

            // 3. Reconcile collateral
            position.reconcileCollateral();

            // 4. Transfer the released collateral to the trader (pnl)
            int256 deltaCollateral = position.updateCollateral(0);

            // Check if the collateral is within the limit
            _checkDeltaCollateralLimit(deltaCollateral, deltaCollateralLimit);

            // Now the position should be closed. All the vToken and collateral values set to zero
        } else {
            // Not closing, proced as a normal trade

            // Transfer the locked collateral to the market or viceversa
            int256 deltaCollateral = position.updateCollateral(
                requiredCollateralAmount
            );

            // Check if the collateral is within the limit
            _checkDeltaCollateralLimit(deltaCollateral, deltaCollateralLimit);

            // Validate after trading that collateral is enough
            position.afterTradeCheck();
        }

        uint256 finalPrice = Trade.getReferencePrice(position.epochId);

        epoch.validateCurrentPoolPriceInRange();

        emit TraderPositionModified(
            position.epochId,
            positionId,
            requiredCollateralAmount,
            position.vEthAmount,
            position.vGasAmount,
            position.borrowedVEth,
            position.borrowedVGas,
            initialPrice,
            finalPrice,
            tradeRatioD18
        );
    }

    function _checkDeltaCollateralLimit(
        int256 deltaCollateral,
        int256 deltaCollateralLimit
    ) internal pure {
        if (
            deltaCollateralLimit > 0 && deltaCollateral > deltaCollateralLimit
        ) {
            revert Errors.CollateralLimitReached(
                deltaCollateral,
                deltaCollateralLimit
            );
        }
        if (
            deltaCollateralLimit < 0 && deltaCollateral < deltaCollateralLimit
        ) {
            revert Errors.CollateralLimitReached(
                deltaCollateral,
                deltaCollateralLimit
            );
        }
    }
    /**
     * @inheritdoc ITradeModule
     */
    function quoteCreateTraderPosition(
        uint256 epochId,
        int256 size
    ) external returns (uint256 requiredCollateral) {
        if (size == 0) {
            revert Errors.InvalidData("Size cannot be 0");
        }

        Epoch.Data storage epoch = Epoch.load(epochId);

        // check if epoch is not settled
        epoch.validateNotSettled();

        if (size > 0) {
            return _quoteCreateLongPosition(epoch, size);
        } else {
            return _quoteCreateShortPosition(epoch, size);
        }
    }

    /**
     * @inheritdoc ITradeModule
     */
    function quoteModifyTraderPosition(
        uint256 positionId,
        int256 size
    ) external returns (uint256 requiredCollateral) {
        // TODO C-09 return an int256 expectedCollateralDelta
        if (ERC721Storage._ownerOf(positionId) != msg.sender) {
            revert Errors.NotAccountOwnerOrAuthorized(positionId, msg.sender);
        }

        Position.Data storage position = Position.loadValid(positionId);

        // check if epoch is not settled
        Epoch.load(position.epochId).validateNotSettled();

        if (position.kind != IFoilStructs.PositionKind.Trade) {
            revert Errors.InvalidPositionKind();
        }

        int256 deltaSize = size - position.positionSize();

        if (deltaSize == 0) {
            revert Errors.InvalidData("Size cannot be 0");
        }

        // check settlement state
        Epoch.load(position.epochId).validateNotSettled();

        // uint requiredCollateral;
        if (deltaSize > 0) {
            requiredCollateral = _quoteModifyLongDirection(position, deltaSize);
        } else {
            requiredCollateral = _quoteModifyShortDirection(
                position,
                deltaSize
            );
        }
    }

    function _quoteModifyLongDirection(
        Position.Data storage position,
        int256 deltaSize
    ) internal returns (uint256 requiredCollateral) {
        Epoch.Data storage epoch = Epoch.load(position.epochId);

        if (deltaSize == 0) {
            return
                epoch.getCollateralRequirementsForTrade(
                    position.vGasAmount,
                    position.vEthAmount,
                    position.borrowedVGas,
                    position.borrowedVEth
                );
        }

        uint256 vGasDeltaTokens = deltaSize.toUint();

        (uint256 requiredAmountInVEth, ) = Trade.swapOrQuoteTokensExactOut(
            epoch,
            0,
            vGasDeltaTokens,
            true
        );

        // adjust vEth and vGas amounts if the position was in the short direction (change sides)
        uint256 extraCollateralToClose;
        if (
            position.borrowedVGas > 0 && vGasDeltaTokens > position.borrowedVGas
        ) {
            (
                vGasDeltaTokens,
                requiredAmountInVEth,
                extraCollateralToClose,

            ) = _getTradeResultsAfterClose(
                vGasDeltaTokens,
                requiredAmountInVEth,
                position.borrowedVGas,
                position.vEthAmount
            );
            // uint256 tradeRatioD18 = requiredAmountInVEth.divDecimal(
            //     vGasDeltaTokens
            // );
            // uint256 vEthRequiredToClose = position.borrowedVGas.mulDecimal(
            //     tradeRatioD18
            // );
            // if (requiredAmountInVEth > vEthRequiredToClose) {
            //     requiredAmountInVEth -= vEthRequiredToClose;
            // } else {
            //     extraCollateralToClose =
            //         vEthRequiredToClose -
            //         requiredAmountInVEth;
            //     requiredAmountInVEth = 0;
            // }
            // vGasDeltaTokens -= position.borrowedVGas;
        }

        requiredCollateral =
            epoch.getCollateralRequirementsForTrade(
                position.vGasAmount + vGasDeltaTokens,
                position.vEthAmount,
                position.borrowedVGas,
                position.borrowedVEth + requiredAmountInVEth
            ) +
            extraCollateralToClose;
    }

    function _quoteModifyShortDirection(
        Position.Data storage position,
        int256 deltaSize
    ) internal returns (uint256 requiredCollateral) {
        Epoch.Data storage epoch = Epoch.load(position.epochId);

        if (deltaSize == 0) {
            return
                epoch.getCollateralRequirementsForTrade(
                    position.vGasAmount,
                    position.vEthAmount,
                    position.borrowedVGas,
                    position.borrowedVEth
                );
        }

        uint256 vGasDeltaDebt = (deltaSize * -1).toUint();

        (uint256 amountOutVEth, ) = Trade.swapOrQuoteTokensExactIn(
            epoch,
            0,
            vGasDeltaDebt,
            true
        );

        // adjust vEth and vGas amounts if the position was in the long direction (change sides)
        uint256 extraCollateralToClose;
        if (position.vGasAmount > 0 && vGasDeltaDebt > position.vGasAmount) {
            (
                vGasDeltaDebt,
                amountOutVEth,
                extraCollateralToClose,

            ) = _getTradeResultsAfterClose(
                vGasDeltaDebt,
                amountOutVEth,
                position.vGasAmount,
                position.borrowedVEth
            );
            // uint256 tradeRatioD18 = amountOutVEth.divDecimal(vGasDeltaDebt);
            // uint256 vEthFromClose = position.vGasAmount.mulDecimal(
            //     tradeRatioD18
            // );
            // if (vEthFromClose > position.borrowedVEth) {
            //     amountOutVEth -= position.borrowedVEth;
            // } else {
            //     extraCollateralToClose = position.borrowedVEth - vEthFromClose;
            //     amountOutVEth = 0;
            // }
            // vGasDeltaDebt -= position.vGasAmount;
        }

        requiredCollateral =
            epoch.getCollateralRequirementsForTrade(
                position.vGasAmount,
                position.vEthAmount + amountOutVEth,
                position.borrowedVGas + vGasDeltaDebt,
                position.borrowedVEth
            ) +
            extraCollateralToClose;
    }

    function _quoteCreateLongPosition(
        Epoch.Data storage epoch,
        int256 size
    ) internal returns (uint256 collateralDelta) {
        uint256 vGasTokens = size.toUint();

        (uint256 requiredAmountInVEth, ) = Trade.swapOrQuoteTokensExactOut(
            epoch,
            0,
            vGasTokens,
            true
        );

        collateralDelta = epoch.getCollateralRequirementsForTrade(
            vGasTokens,
            0,
            0,
            requiredAmountInVEth
        );
    }

    function _quoteCreateShortPosition(
        Epoch.Data storage epoch,
        int256 size
    ) internal returns (uint256 collateralDelta) {
        uint256 vGasDebt = (size * -1).toUint();

        (uint256 amountOutVEth, ) = Trade.swapOrQuoteTokensExactIn(
            epoch,
            0,
            vGasDebt,
            true
        );

        collateralDelta = epoch.getCollateralRequirementsForTrade(
            0,
            amountOutVEth,
            vGasDebt,
            0
        );
    }

    /**
     * @dev Move the position to the long direction.
     * @notice it expects the position was in a "reconcilled" state, that means, vGas and vEth tokens are single sided.
     */
    function _moveToLongDirection(
        Position.Data storage position,
        Epoch.Data storage epoch,
        int256 deltaSize
    )
        internal
        returns (
            uint256 vEthDebt,
            uint256 vGasTokens,
            uint256 collateralRequired,
            uint256 tradeRatioD18
        )
    {
        vGasTokens = deltaSize.toUint();
        (uint256 requiredAmountInVEth, ) = Trade.swapOrQuoteTokensExactOut(
            epoch,
            0,
            vGasTokens,
            false
        );

        vEthDebt = requiredAmountInVEth;

        // get average trade ratio (price)
        require(vGasTokens > 0, "Invalid trade size - 0 tokens traded");

        uint256 extraCollateralRequiredToClose;
        // uint256 vEthRequiredToClose;
        // Check if the trade changed sides and update the position accordingly
        if (position.borrowedVGas > 0 && vGasTokens > position.borrowedVGas) {
            // it changed sides from short to long, first we need to pay the debt and then we can move to the other side
            uint256 extraCollateralToClose;
            (
                vGasTokens,
                requiredAmountInVEth,
                extraCollateralToClose,
                tradeRatioD18
            ) = _getTradeResultsAfterClose(
                vGasTokens,
                requiredAmountInVEth,
                position.borrowedVGas,
                position.vEthAmount
            );

            if (extraCollateralToClose > position.depositedCollateralAmount) {
                extraCollateralRequiredToClose =
                    extraCollateralToClose -
                    position.depositedCollateralAmount;
                position.depositedCollateralAmount = 0;
            } else {
                // if there's enough collateral to pay the debt, we need to reduce the amount of collateral proportionally (lose position, use collateral to pay debt)
                position.depositedCollateralAmount -= extraCollateralToClose;
            }

            // // fist we need to get how much vEth is required to move from short to zero (close the position)
            // vEthRequiredToClose = position.borrowedVGas.mulDecimal(
            //     tradeRatioD18
            // );

            // // check if there was enough vEth to pay the debt
            // if (vEthRequiredToClose > position.vEthAmount) {
            //     // if there's not enough vEth tokes to pay the debt we need to reduce the amount of collateral proportionally (lose position, use collateral to pay debt)
            //     uint256 collateralRequiredToClose = vEthRequiredToClose -
            //         position.vEthAmount;
            //     if (
            //         collateralRequiredToClose >
            //         position.depositedCollateralAmount
            //     ) {
            //         extraCollateralRequiredToClose =
            //             collateralRequiredToClose -
            //             position.depositedCollateralAmount;
            //         position.depositedCollateralAmount = 0;
            //     } else {
            //         // if there's enough collateral to pay the debt, we need to reduce the amount of collateral proportionally (lose position, use collateral to pay debt)
            //         position
            //             .depositedCollateralAmount -= collateralRequiredToClose;
            //     }
            // } else {
            //     // if there's more vEth than required to pay the debt, we need to increase the amount of collateral proportionally (profit position, add profits to depositedCollateral)
            //     position.depositedCollateralAmount +=
            //         position.vEthAmount -
            //         vEthRequiredToClose;
            // }

            position.vEthAmount = 0; // the positon was "closed" at this point
        }

        // Update the position vGas
        position.vGasAmount += vGasTokens;
        position.borrowedVEth += requiredAmountInVEth;

        // get required collateral from the position
        collateralRequired =
            position.getRequiredCollateral() +
            extraCollateralRequiredToClose;
    }

    function _moveToShortDirection(
        Position.Data storage position,
        Epoch.Data storage epoch,
        int256 deltaSize
    )
        internal
        returns (
            uint256 vEthTokens,
            uint256 vGasDebt,
            uint256 collateralRequired,
            uint256 tradeRatioD18
        )
    {
        vGasDebt = (deltaSize * -1).toUint();
        (uint256 amountOutVEth, ) = Trade.swapOrQuoteTokensExactIn(
            epoch,
            0,
            vGasDebt,
            false
        );

        vEthTokens = amountOutVEth;

        // get average trade ratio (price)
        if (vGasDebt == 0) {
            tradeRatioD18 = 0;
        } else {
            tradeRatioD18 = amountOutVEth.divDecimal(vGasDebt);
        }

        uint256 extraCollateralRequiredToClose;
        uint256 vEthFromClose;
        // Check if the trade changed sides and update the position accordingly
        if (position.vGasAmount > 0 && vGasDebt > position.vGasAmount) {
            // it changed sides from short to long, first we need to pay the debt and then we can move to the other side
            // fist we need to get how much vEth we received from closing the positon (move from long to zero)
            vEthFromClose = position.vGasAmount.mulDecimal(tradeRatioD18);

            // check if there is enough vEth to pay the debt
            if (position.borrowedVEth > vEthFromClose) {
                // if there's not enough vEth tokes to pay the debt we need to reduce the amount of collateral proportionally (lose position, use collateral to pay debt)
                uint256 collateralRequiredToClose = position.borrowedVEth -
                    vEthFromClose;

                if (
                    collateralRequiredToClose >
                    position.depositedCollateralAmount
                ) {
                    extraCollateralRequiredToClose =
                        collateralRequiredToClose -
                        position.depositedCollateralAmount;
                    position.depositedCollateralAmount = 0;
                } else {
                    // if there's enough collateral to pay the debt, we need to reduce the amount of collateral proportionally (lose position, use collateral to pay debt)
                    position
                        .depositedCollateralAmount -= collateralRequiredToClose;
                }
            } else {
                // if there's more vEth than required to pay the debt, we need to increase the amount of collateral proportionally (profit position, add profits to depositedCollateral)
                position.depositedCollateralAmount +=
                    vEthFromClose -
                    position.borrowedVEth;
            }

            position.borrowedVEth = 0; // the positon was "closed" at this point
        }

        // Update the position vGas and vEth
        position.vEthAmount += vEthTokens > vEthFromClose
            ? vEthTokens - vEthFromClose
            : 0;
        position.borrowedVGas += vGasDebt;

        // get required collateral from the position
        collateralRequired =
            position.getRequiredCollateral() +
            extraCollateralRequiredToClose;
    }

    function _getTradeResultsAfterClose(
        uint256 tradedVGas,
        uint256 tradedVEth,
        uint256 currentVGas,
        uint256 currentVEth
    )
        internal
        returns (
            uint256 newVGas,
            uint256 newVEth,
            uint256 collateralAdjustment,
            uint256 tradeRatioD18
        )
    {
        tradeRatioD18 = tradedVEth.divDecimal(tradedVGas);

        uint256 vEthToClose = currentVGas.mulDecimal(tradeRatioD18);

        if (vEthToClose > currentVEth) {
            // notice tradedVGas > currentVGas if this function is called
            // => tradedVEth > vEthToClose
            // => tradedVEth > currentVEth
            newVEth = tradedVEth - currentVEth;
        } else {
            newVEth = tradedVEth - vEthToClose;
            collateralAdjustment = currentVEth - vEthToClose;
        }
        newVGas = tradedVGas - currentVGas;
    }
}
