// SPDX-License-Identifier: MIT
pragma solidity >=0.8.25 <0.9.0;

import "../storage/Position.sol";
import "../storage/ERC721Storage.sol";
import "../storage/Trade.sol";
import "../libraries/DecimalMath.sol";
import {IFoilPositionEvents} from "../interfaces/IFoilPositionEvents.sol";

import "@openzeppelin/contracts-upgradeable/utils/ReentrancyGuardUpgradeable.sol";
import {SafeCastI256} from "@synthetixio/core-contracts/contracts/utils/SafeCast.sol";
import {SafeCastU256} from "@synthetixio/core-contracts/contracts/utils/SafeCast.sol";
import {ITradeModule} from "../interfaces/ITradeModule.sol";

/**
 * @title Module for trade positions.
 * @dev See ITradeModule.
 */
contract TradeModule is ITradeModule, ReentrancyGuardUpgradeable {
    using Epoch for Epoch.Data;
    using Position for Position.Data;
    using DecimalMath for uint256;
    using DecimalMath for int256;
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
        if (block.timestamp > deadline) {
            revert Errors.TransactionExpired(deadline, block.timestamp);
        }

        if (size == 0) {
            revert Errors.DeltaTradeIsZero();
        }

        _checkTradeSize(size);

        Epoch.Data storage epoch = Epoch.load(epochId);

        if (block.timestamp < epoch.startTime) {
            revert Errors.EpochNotStarted(epochId, epoch.startTime);
        }

        // check if epoch is not settled
        epoch.validateNotSettled();

        // Mint position NFT and initialize position
        positionId = ERC721EnumerableStorage.totalSupply() + 1;
        Position.Data storage position = Position.createValid(positionId);

        if (
            !ERC721Storage._checkOnERC721Received(
                address(this),
                msg.sender,
                positionId,
                ""
            )
        ) {
            revert Errors.InvalidTransferRecipient(msg.sender);
        }
        ERC721Storage._mint(msg.sender, positionId);
        position.epochId = epochId;
        position.kind = IFoilStructs.PositionKind.Trade;

        uint256 initialPrice = epoch.getReferencePrice();

        QuoteOrTradeInputParams memory inputParams = QuoteOrTradeInputParams({
            oldPosition: position,
            initialSize: 0,
            targetSize: size,
            deltaSize: size,
            isQuote: false
        });

        QuoteOrTradeOutputParams memory outputParams = _quoteOrTrade(
            inputParams
        );

        position.vEthAmount = outputParams.position.vEthAmount;
        position.vGasAmount = outputParams.position.vGasAmount;
        position.borrowedVEth = outputParams.position.borrowedVEth;
        position.borrowedVGas = outputParams.position.borrowedVGas;

        // Check if the collateral is within the limit
        if (outputParams.requiredCollateral > deltaCollateralLimit) {
            revert Errors.CollateralLimitReached(
                outputParams.requiredCollateral.toInt(),
                deltaCollateralLimit.toInt()
            );
        }

        // Transfer the locked collateral to the market
        int256 deltaCollateral = position.updateCollateral(
            outputParams.requiredCollateral
        );

        // Validate after trading that collateral is enough
        position.afterTradeCheck();

        uint256 finalPrice = epoch.getReferencePrice();

        epoch.validateCurrentPoolPriceInRange();

        _emitTraderPositionCreated(
            IFoilPositionEvents.TraderPositionCreatedEventData({
                sender: msg.sender,
                epochId: epochId,
                positionId: positionId,
                requiredCollateral: outputParams.requiredCollateral,
                initialPrice: initialPrice,
                finalPrice: finalPrice,
                tradeRatio: outputParams.tradeRatioD18,
                positionCollateralAmount: position.depositedCollateralAmount,
                positionVethAmount: position.vEthAmount,
                positionVgasAmount: position.vGasAmount,
                positionBorrowedVeth: position.borrowedVEth,
                positionBorrowedVgas: position.borrowedVGas,
                deltaCollateral: deltaCollateral
            })
        );
    }

    struct ModifyTraderPositionRuntime {
        int256 deltaSize;
        int256 deltaCollateral;
        uint256 initialPrice;
        uint256 finalPrice;
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
        ModifyTraderPositionRuntime memory runtime;
        if (block.timestamp > deadline) {
            revert Errors.TransactionExpired(deadline, block.timestamp);
        }

        if (ERC721Storage._ownerOf(positionId) != msg.sender) {
            revert Errors.NotAccountOwner(positionId, msg.sender);
        }

        Position.Data storage position = Position.loadValid(positionId);

        if (position.kind != IFoilStructs.PositionKind.Trade) {
            revert Errors.InvalidPositionKind();
        }

        runtime.deltaSize = size - position.positionSize();
        if (runtime.deltaSize == 0) {
            revert Errors.DeltaTradeIsZero();
        }

        // Checking both the new size and the delta size to avoid small trades that can mess with rounding errors
        _checkTradeSize(size);
        _checkTradeSize(runtime.deltaSize);

        Epoch.Data storage epoch = Epoch.load(position.epochId);

        // check if epoch is not settled
        epoch.validateNotSettled();

        runtime.initialPrice = epoch.getReferencePrice();

        QuoteOrTradeInputParams memory inputParams = QuoteOrTradeInputParams({
            oldPosition: position,
            initialSize: position.positionSize(),
            targetSize: size,
            deltaSize: runtime.deltaSize,
            isQuote: false
        });

        // Do the trade
        QuoteOrTradeOutputParams memory outputParams = _quoteOrTrade(
            inputParams
        );

        position.vEthAmount = outputParams.position.vEthAmount;
        position.vGasAmount = outputParams.position.vGasAmount;
        position.borrowedVEth = outputParams.position.borrowedVEth;
        position.borrowedVGas = outputParams.position.borrowedVGas;
        position.depositedCollateralAmount = outputParams
            .position
            .depositedCollateralAmount;

        // Ensures that the position only have single side tokens
        position.rebalanceVirtualTokens();

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
            if (
                position.borrowedVEth > 0 &&
                position.borrowedVEth > position.depositedCollateralAmount
            ) {
                // Notice. This error should not happen. If it's here it means something went wrong
                revert Errors.InsufficientCollateral(
                    position.borrowedVEth,
                    position.depositedCollateralAmount
                );
            }

            // 3. Reconcile collateral (again)
            position.rebalanceCollateral();

            // 4. Transfer the released collateral to the trader (pnl)
            // Notice: under normal operations, the required collateral should be zero, but if somehow there is a "bad debt" it needs to be repaid.
            runtime.deltaCollateral = position.updateCollateral(
                outputParams.requiredCollateral
            );

            // Check if the collateral is within the limit
            _checkDeltaCollateralLimit(
                runtime.deltaCollateral,
                deltaCollateralLimit
            );

            // Now the position should be closed. All the vToken and collateral values set to zero
        } else {
            // Not closing, proced as a normal trade

            // Transfer the locked collateral to the market or viceversa
            runtime.deltaCollateral = position.updateCollateral(
                outputParams.requiredCollateral
            );

            // Check if the collateral is within the limit
            _checkDeltaCollateralLimit(
                runtime.deltaCollateral,
                deltaCollateralLimit
            );

            // Validate after trading that collateral is enough
            position.afterTradeCheck();
        }

        runtime.finalPrice = epoch.getReferencePrice();

        epoch.validateCurrentPoolPriceInRange();

        _emitTraderPositionModified(
            IFoilPositionEvents.TraderPositionModifiedEventData({
                sender: msg.sender,
                epochId: position.epochId,
                positionId: positionId,
                requiredCollateral: outputParams.requiredCollateral,
                initialPrice: runtime.initialPrice,
                finalPrice: runtime.finalPrice,
                tradeRatio: outputParams.tradeRatioD18,
                positionCollateralAmount: position.depositedCollateralAmount,
                positionVethAmount: position.vEthAmount,
                positionVgasAmount: position.vGasAmount,
                positionBorrowedVeth: position.borrowedVEth,
                positionBorrowedVgas: position.borrowedVGas,
                deltaCollateral: runtime.deltaCollateral
            })
        );
    }

    /**
     * @inheritdoc ITradeModule
     */
    function quoteCreateTraderPosition(
        uint256 epochId,
        int256 size
    ) external returns (uint256 requiredCollateral, uint256 fillPrice) {
        if (size == 0) {
            revert Errors.InvalidData("Size cannot be 0");
        }

        Epoch.Data storage epoch = Epoch.load(epochId);

        // check if epoch is not settled
        epoch.validateNotSettled();

        Position.Data memory position;
        position.epochId = epochId;

        QuoteOrTradeInputParams memory inputParams = QuoteOrTradeInputParams({
            oldPosition: position,
            initialSize: 0,
            targetSize: size,
            deltaSize: size,
            isQuote: true
        });

        QuoteOrTradeOutputParams memory outputParams = _quoteOrTrade(
            inputParams
        );

        return (outputParams.requiredCollateral, outputParams.tradeRatioD18);
    }

    /**
     * @inheritdoc ITradeModule
     */
    function quoteModifyTraderPosition(
        uint256 positionId,
        int256 size
    )
        external
        returns (
            int256 expectedCollateralDelta,
            int256 closePnL,
            uint256 fillPrice
        )
    {
        if (ERC721Storage._ownerOf(positionId) != msg.sender) {
            revert Errors.NotAccountOwner(positionId, msg.sender);
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

        QuoteOrTradeInputParams memory inputParams = QuoteOrTradeInputParams({
            oldPosition: position,
            initialSize: position.positionSize(),
            targetSize: size,
            deltaSize: deltaSize,
            isQuote: true
        });

        QuoteOrTradeOutputParams memory outputParams = _quoteOrTrade(
            inputParams
        );

        return (
            outputParams.expectedDeltaCollateral,
            outputParams.closePnL,
            outputParams.tradeRatioD18
        );
    }

    function _checkDeltaCollateralLimit(
        int256 deltaCollateral,
        int256 deltaCollateralLimit
    ) internal pure {
        // limit is 1.01, deltaCollateral is 1.02 => revert
        if (deltaCollateralLimit == 0) {
            // no limit, so no need to check
            return;
        }
        // check if collateral limit is reached (positive means collateral added to the position, negative means collateral removed from the position)
        // For positive limit, deltaCollateral > deltaCollateralLimit revert (i.e. collateral limit is 1.02, deltaCollateral is 1.03 => revert)
        // For negative limit, deltaCollateral > deltaCollateralLimit revert (i.e. collateral limit is -1.02, deltaCollateral is -1.01 => revert)
        if (deltaCollateral > deltaCollateralLimit) {
            revert Errors.CollateralLimitReached(
                deltaCollateral,
                deltaCollateralLimit
            );
        }
    }

    function _checkTradeSize(int256 size) internal view {
        if (size == 0) {
            return;
        }

        uint256 modSize = size > 0 ? size.toUint() : (size * -1).toUint();
        if (modSize < Market.load().minTradeSize) {
            revert Errors.PositionSizeBelowMin();
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
    }

    function _quoteOrTrade(
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
            (runtime.tradedVEth, ) = Trade.swapOrQuoteTokensExactOut(
                epoch,
                0,
                runtime.tradedVGas,
                params.isQuote
            );
            runtime.signedTradedVEth = runtime.tradedVEth.toInt();
        } else {
            // Short direction; Quote or Trade
            (runtime.tradedVEth, ) = Trade.swapOrQuoteTokensExactIn(
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

    function _emitTraderPositionCreated(
        IFoilPositionEvents.TraderPositionCreatedEventData memory eventData
    ) internal {
        emit IFoilPositionEvents.TraderPositionCreated(
            eventData.sender,
            eventData.epochId,
            eventData.positionId,
            eventData.requiredCollateral,
            eventData.initialPrice,
            eventData.finalPrice,
            eventData.tradeRatio,
            eventData.positionCollateralAmount,
            eventData.positionVethAmount,
            eventData.positionVgasAmount,
            eventData.positionBorrowedVeth,
            eventData.positionBorrowedVgas,
            eventData.deltaCollateral
        );
    }

    function _emitTraderPositionModified(
        IFoilPositionEvents.TraderPositionModifiedEventData memory eventData
    ) internal {
        emit IFoilPositionEvents.TraderPositionModified(
            eventData.sender,
            eventData.epochId,
            eventData.positionId,
            eventData.requiredCollateral,
            eventData.initialPrice,
            eventData.finalPrice,
            eventData.tradeRatio,
            eventData.positionCollateralAmount,
            eventData.positionVethAmount,
            eventData.positionVgasAmount,
            eventData.positionBorrowedVeth,
            eventData.positionBorrowedVgas,
            eventData.deltaCollateral
        );
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
}
