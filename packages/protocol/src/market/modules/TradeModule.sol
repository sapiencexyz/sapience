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

// import "forge-std/console2.sol";

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
            revert Errors.InvalidData("Size cannot be 0");
        }

        Epoch.Data storage epoch = Epoch.load(epochId);

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

        uint256 initialPrice = Trade.getReferencePrice(epochId);

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
        position.updateCollateral(outputParams.requiredCollateral);

        // Validate after trading that collateral is enough
        position.afterTradeCheck();

        uint256 finalPrice = Trade.getReferencePrice(epochId);

        epoch.validateCurrentPoolPriceInRange();

        emit TraderPositionCreated(
            msg.sender,
            epochId,
            positionId,
            outputParams.requiredCollateral,
            position.vEthAmount,
            position.vGasAmount,
            position.borrowedVEth,
            position.borrowedVGas,
            initialPrice,
            finalPrice,
            outputParams.tradeRatioD18
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
        if (block.timestamp > deadline) {
            revert Errors.TransactionExpired(deadline, block.timestamp);
        }

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

        QuoteOrTradeInputParams memory inputParams = QuoteOrTradeInputParams({
            oldPosition: position,
            initialSize: position.positionSize(),
            targetSize: size,
            deltaSize: deltaSize,
            isQuote: false
        });

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
            int256 deltaCollateral = position.updateCollateral(0);

            // Check if the collateral is within the limit
            _checkDeltaCollateralLimit(deltaCollateral, deltaCollateralLimit);

            // Now the position should be closed. All the vToken and collateral values set to zero
        } else {
            // Not closing, proced as a normal trade

            // Transfer the locked collateral to the market or viceversa
            int256 deltaCollateral = position.updateCollateral(
                outputParams.requiredCollateral
            );

            // Check if the collateral is within the limit
            _checkDeltaCollateralLimit(deltaCollateral, deltaCollateralLimit);

            // Validate after trading that collateral is enough
            position.afterTradeCheck();
        }

        uint256 finalPrice = Trade.getReferencePrice(position.epochId);

        epoch.validateCurrentPoolPriceInRange();

        emit TraderPositionModified(
            msg.sender,
            position.epochId,
            positionId,
            outputParams.requiredCollateral,
            position.vEthAmount,
            position.vGasAmount,
            position.borrowedVEth,
            position.borrowedVGas,
            initialPrice,
            finalPrice,
            outputParams.tradeRatioD18
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

    struct QuoteRuntime {
        bool isLongDirection;
        uint256 tradedVGas;
        uint256 tradedVEth;
        int256 signedTradedVGas;
        int256 signedTradedVEth;
        int256 vEthToZero; // required vEth to close the initial position (to zero)
        int256 vEthFromZero; // vEth involved in the transaction from zero to target size
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
        if (runtime.isLongDirection) {
            // Pick the right values based on the direction
            runtime.signedTradedVGas = params.deltaSize;
            runtime.tradedVGas = params.deltaSize.toUint();

            // Long direction; Quote or Trade
            (runtime.tradedVEth, ) = Trade.swapOrQuoteTokensExactOut(
                epoch,
                0,
                runtime.tradedVGas,
                params.isQuote
            );
            runtime.signedTradedVEth = runtime.tradedVEth.toInt();
        } else {
            // Pick the right values based on the direction
            runtime.signedTradedVGas = params.deltaSize;
            runtime.tradedVGas = (params.deltaSize * -1).toUint();

            // Short direction; Quote or Trade
            (runtime.tradedVEth, ) = Trade.swapOrQuoteTokensExactIn(
                epoch,
                0,
                runtime.tradedVGas,
                params.isQuote
            );
            runtime.signedTradedVEth = runtime.tradedVEth.toInt() * -1;
        }

        // Sanity check. vGas on trade is zero means someting went really wrong (or )
        if (runtime.tradedVGas == 0) {
            revert Errors.InvalidTradeSize(0);
        }

        // 2- Get PnL and vEth involved in the transaction from initial size to zero (intermediate close the position).
        output.tradeRatioD18 = runtime.tradedVEth.divDecimal(
            runtime.tradedVGas
        );
        // vEth to compensate the gas (either to pay borrowedVGas or borrowerVEth paid from the vGas tokens from the close trade)
        runtime.vEthToZero = (params.initialSize * -1).mulDecimal(
            output.tradeRatioD18.toInt()
        );
        // net vEth from oritinal positon minus the vEth to zero
        output.closePnL =
            params.oldPosition.vEthAmount.toInt() -
            params.oldPosition.borrowedVEth.toInt() -
            runtime.vEthToZero;
        // vEth from the trade that wasn't used to close the initial position (should be same as targetSize*tradeRatio, but there can be some rounding errors)
        runtime.vEthFromZero = runtime.signedTradedVEth - runtime.vEthToZero;

        // 3- Regenerate the new position after the trade and closure
        if (params.targetSize > 0) {
            // End position is LONG
            output.position.vGasAmount = params.targetSize.toUint();
            output.position.vEthAmount = 0;
            output.position.borrowedVGas = 0;
            output.position.borrowedVEth = runtime.vEthFromZero > 0
                ? runtime.vEthFromZero.toUint()
                : (runtime.vEthFromZero * -1).toUint();
        } else {
            // End position is SHORT
            output.position.vGasAmount = 0;
            output.position.vEthAmount = runtime.vEthFromZero > 0
                ? runtime.vEthFromZero.toUint()
                : (runtime.vEthFromZero * -1).toUint();
            output.position.borrowedVGas = (params.targetSize * -1).toUint();
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
                output.position.depositedCollateralAmount = params
                    .oldPosition
                    .depositedCollateralAmount;
                extraCollateralRequired = collateralLoss;
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
}
