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

    struct QuoteRuntine {
        uint256 vGasTrade;
        uint256 vEthTrade;
        int256 afterTradeDeltaCollateral;
        uint256 afterTradePositionVEth;
        uint256 afterTradePositionVGas;
        uint256 extraCollateralToClose;
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

        QuoteRuntine memory runtime;

        runtime.vGasTrade = deltaSize.toUint();
        (runtime.vEthTrade, ) = Trade.swapOrQuoteTokensExactOut(
            epoch,
            0,
            runtime.vGasTrade,
            true
        );

        // get average trade ratio (price)
        require(runtime.vGasTrade > 0, "Invalid trade size - 0 tokens traded");

        // adjust vEth and vGas amounts if the position was in the short direction (change sides)
        runtime.afterTradePositionVEth = position.vEthAmount;
        runtime.afterTradePositionVGas = position.borrowedVGas;
        if (
            position.borrowedVGas > 0 &&
            runtime.vGasTrade > position.borrowedVGas
        ) {
            (
                runtime.vGasTrade,
                runtime.vEthTrade,
                runtime.extraCollateralToClose,

            ) = _getTradeResultsAfterClose(
                runtime.vGasTrade,
                runtime.vEthTrade,
                position.borrowedVGas,
                position.vEthAmount
            );

            runtime.afterTradeDeltaCollateral = (position
                .depositedCollateralAmount
                .toInt() - runtime.extraCollateralToClose.toInt());
            runtime.afterTradePositionVGas = 0;
            runtime.afterTradePositionVEth = 0;
        }

        requiredCollateral = (epoch
            .getCollateralRequirementsForTrade(
                position.vGasAmount + runtime.vGasTrade,
                runtime.afterTradePositionVEth,
                runtime.afterTradePositionVGas,
                position.borrowedVEth + runtime.vEthTrade
            )
            .toInt() + runtime.afterTradeDeltaCollateral).toUint();
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

        QuoteRuntine memory runtime;

        runtime.vGasTrade = (deltaSize * -1).toUint();
        (runtime.vEthTrade, ) = Trade.swapOrQuoteTokensExactIn(
            epoch,
            0,
            runtime.vGasTrade,
            true
        );

        // get average trade ratio (price)
        require(runtime.vGasTrade > 0, "Invalid trade size - 0 tokens traded");

        // adjust vEth and vGas amounts if the position was in the long direction (change sides)
        runtime.afterTradePositionVEth = position.borrowedVEth;
        runtime.afterTradePositionVGas = position.vGasAmount;
        if (
            position.vGasAmount > 0 && runtime.vGasTrade > position.vGasAmount
        ) {
            (
                runtime.vGasTrade,
                runtime.vEthTrade,
                runtime.extraCollateralToClose,

            ) = _getTradeResultsAfterClose(
                runtime.vGasTrade,
                runtime.vEthTrade,
                position.vGasAmount,
                position.borrowedVEth
            );

            runtime.afterTradeDeltaCollateral = (position
                .depositedCollateralAmount
                .toInt() - runtime.extraCollateralToClose.toInt());
            runtime.afterTradePositionVGas = 0;
            runtime.afterTradePositionVEth = 0;
        }

        requiredCollateral = (epoch
            .getCollateralRequirementsForTrade(
                runtime.afterTradePositionVGas,
                position.vEthAmount + runtime.vEthTrade,
                position.borrowedVGas + runtime.vGasTrade,
                runtime.afterTradePositionVEth
            )
            .toInt() + runtime.afterTradeDeltaCollateral).toUint();
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

        // get average trade ratio (price)
        require(vGasTokens > 0, "Invalid trade size - 0 tokens traded");

        // Check if the trade changed sides and update the position accordingly
        uint256 extraCollateralToClose;
        if (position.borrowedVGas > 0 && vGasTokens > position.borrowedVGas) {
            // it changed sides from short to long, first we need to pay the debt and then we can move to the other side
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
                extraCollateralToClose =
                    extraCollateralToClose -
                    position.depositedCollateralAmount;
                position.depositedCollateralAmount = 0;
            } else {
                // if there's enough collateral to pay the debt, we need to reduce the amount of collateral proportionally (lose position, use collateral to pay debt)
                position.depositedCollateralAmount -= extraCollateralToClose;
            }

            // the SHORT positon was "closed" at this point
            position.vEthAmount = 0;
            position.borrowedVGas = 0;
        }

        // Update the position vGas
        position.vGasAmount = vGasTokens;
        position.borrowedVEth = requiredAmountInVEth;

        // get required collateral from the position
        collateralRequired =
            position.getRequiredCollateral() +
            extraCollateralToClose;

        vEthDebt = requiredAmountInVEth;
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

        // get average trade ratio (price)
        require(vGasDebt > 0, "Invalid trade size - 0 tokens traded");

        uint256 extraCollateralToClose;
        // Check if the trade changed sides and update the position accordingly
        if (position.vGasAmount > 0 && vGasDebt > position.vGasAmount) {
            // it changed sides from short to long, first we need to pay the debt and then we can move to the other side

            (
                vGasDebt,
                vEthTokens,
                extraCollateralToClose,
                tradeRatioD18
            ) = _getTradeResultsAfterClose(
                vGasDebt,
                vEthTokens,
                position.vGasAmount,
                position.borrowedVEth
            );

            if (extraCollateralToClose > position.depositedCollateralAmount) {
                extraCollateralToClose =
                    extraCollateralToClose -
                    position.depositedCollateralAmount;
                position.depositedCollateralAmount = 0;
            } else {
                // if there's enough collateral to pay the debt, we need to reduce the amount of collateral proportionally (lose position, use collateral to pay debt)
                position.depositedCollateralAmount -= extraCollateralToClose;
            }

            // the LONG positon was "closed" at this point
            position.borrowedVEth = 0;
            position.vGasAmount = 0;
        }
        // Update the position vGas
        position.borrowedVGas = vGasDebt;
        position.vEthAmount = vEthTokens;

        // get required collateral from the position
        collateralRequired =
            position.getRequiredCollateral() +
            extraCollateralToClose;

        vEthTokens = amountOutVEth;
    }

    function _getTradeResultsAfterClose(
        uint256 tradedVGas,
        uint256 tradedVEth,
        uint256 currentVGas,
        uint256 currentVEth
    )
        internal
        pure
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
