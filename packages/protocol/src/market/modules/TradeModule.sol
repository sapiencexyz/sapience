// SPDX-License-Identifier: MIT
pragma solidity >=0.8.25 <0.9.0;

import "../storage/Position.sol";
import "../storage/ERC721Storage.sol";
import "../storage/ERC721EnumerableStorage.sol";
import "../storage/Trade.sol";
import "../storage/Market.sol";
import "../storage/MarketGroup.sol";
import "../libraries/DecimalMath.sol";
import "../libraries/DecimalPrice.sol";
import {ISapiencePositionEvents} from "../interfaces/ISapiencePositionEvents.sol";
import {ISapienceStructs} from "../interfaces/ISapienceStructs.sol";
import {Errors} from "../storage/Errors.sol";

import "@openzeppelin/contracts-upgradeable/utils/ReentrancyGuardUpgradeable.sol";
import {SafeCastI256} from "@synthetixio/core-contracts/contracts/utils/SafeCast.sol";
import {SafeCastU256} from "@synthetixio/core-contracts/contracts/utils/SafeCast.sol";
import {ITradeModule} from "../interfaces/ITradeModule.sol";

/**
 * @title Module for trade positions.
 * @dev See ITradeModule.
 */
contract TradeModule is ITradeModule, ReentrancyGuardUpgradeable {
    using Market for Market.Data;
    using Position for Position.Data;
    using DecimalMath for uint256;
    using DecimalMath for int256;
    using SafeCastI256 for int256;
    using SafeCastU256 for uint256;

    /**
     * @inheritdoc ITradeModule
     */
    function createTraderPosition(
        uint256 marketId,
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

        Market.Data storage market = Market.load(marketId);

        // check if market is not settled
        market.validateNotSettled();

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
        position.marketId = marketId;
        position.kind = ISapienceStructs.PositionKind.Trade;

        uint256 initialPrice = market.getReferencePrice();

        Trade.QuoteOrTradeInputParams memory inputParams = Trade
            .QuoteOrTradeInputParams({
                oldPosition: position,
                initialSize: 0,
                targetSize: size,
                deltaSize: size,
                isQuote: false
            });

        Trade.QuoteOrTradeOutputParams memory outputParams = Trade.quoteOrTrade(
            inputParams
        );

        position.vQuoteAmount = outputParams.position.vQuoteAmount;
        position.vBaseAmount = outputParams.position.vBaseAmount;
        position.borrowedVQuote = outputParams.position.borrowedVQuote;
        position.borrowedVBase = outputParams.position.borrowedVBase;

        // Check if the collateral is within the limit
        // Notice: if deltaCollateralLimit is zero, it means no limit, so no need to check
        if (
            deltaCollateralLimit > 0 &&
            outputParams.requiredCollateral > deltaCollateralLimit
        ) {
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

        uint256 finalPrice = market.getReferencePrice();

        market.validateCurrentPoolPriceInRange();

        _emitTraderPositionCreated(
            ISapiencePositionEvents.TraderPositionCreatedEventData({
                sender: msg.sender,
                marketId: marketId,
                positionId: positionId,
                requiredCollateral: outputParams.requiredCollateral,
                initialPrice: initialPrice,
                finalPrice: finalPrice,
                tradeRatio: outputParams.tradeRatioD18,
                positionCollateralAmount: position.depositedCollateralAmount,
                positionVquoteAmount: position.vQuoteAmount,
                positionVbaseAmount: position.vBaseAmount,
                positionBorrowedVquote: position.borrowedVQuote,
                positionBorrowedVbase: position.borrowedVBase,
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

        if (position.kind != ISapienceStructs.PositionKind.Trade) {
            revert Errors.InvalidPositionKind();
        }

        runtime.deltaSize = size - position.positionSize();
        if (runtime.deltaSize == 0) {
            revert Errors.DeltaTradeIsZero();
        }

        // Checking both the new size and the delta size to avoid small trades that can mess with rounding errors
        _checkTradeSize(size);
        _checkTradeSize(runtime.deltaSize);

        Market.Data storage market = Market.load(position.marketId);

        // check if market is not settled
        market.validateNotSettled();

        runtime.initialPrice = market.getReferencePrice();

        Trade.QuoteOrTradeInputParams memory inputParams = Trade
            .QuoteOrTradeInputParams({
                oldPosition: position,
                initialSize: position.positionSize(),
                targetSize: size,
                deltaSize: runtime.deltaSize,
                isQuote: false
            });

        // Do the trade
        Trade.QuoteOrTradeOutputParams memory outputParams = Trade.quoteOrTrade(
            inputParams
        );

        position.updateWithNewPosition(outputParams.position);

        // Ensures that the position only have single side tokens
        position.rebalanceVirtualTokens();

        if (size == 0) {
            // Closing the position. No need to check collateral limit
            // We need to:

            // 1. Confirm no vgas tokens
            if (position.vBaseAmount > 0) {
                // Notice. This error should not happen. If it's here it means something went wrong
                revert Errors.InvalidData(
                    "Cannot close position with vGas tokens"
                );
            }
            if (position.borrowedVBase > 0) {
                // Notice. This error should not happen. If it's here it means something went wrong
                revert Errors.InvalidData(
                    "Cannot close position with borrowed vGas tokens"
                );
            }

            // 2. Confirm collateral is enough to pay for borrowed veth
            if (
                position.borrowedVQuote > 0 &&
                position.borrowedVQuote > position.depositedCollateralAmount
            ) {
                // Notice. This error should not happen. If it's here it means something went wrong
                revert Errors.InsufficientCollateral(
                    position.borrowedVQuote,
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
            Trade.checkDeltaCollateralLimit(
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
            Trade.checkDeltaCollateralLimit(
                runtime.deltaCollateral,
                deltaCollateralLimit
            );

            // Validate after trading that collateral is enough
            position.afterTradeCheck();
        }

        runtime.finalPrice = market.getReferencePrice();

        market.validateCurrentPoolPriceInRange();

        _emitTraderPositionModified(
            ISapiencePositionEvents.TraderPositionModifiedEventData({
                sender: msg.sender,
                marketId: position.marketId,
                positionId: positionId,
                requiredCollateral: outputParams.requiredCollateral,
                initialPrice: runtime.initialPrice,
                finalPrice: runtime.finalPrice,
                tradeRatio: outputParams.tradeRatioD18,
                positionCollateralAmount: position.depositedCollateralAmount,
                positionVquoteAmount: position.vQuoteAmount,
                positionVbaseAmount: position.vBaseAmount,
                positionBorrowedVquote: position.borrowedVQuote,
                positionBorrowedVbase: position.borrowedVBase,
                deltaCollateral: runtime.deltaCollateral
            })
        );
    }

    /**
     * @inheritdoc ITradeModule
     */
    function quoteCreateTraderPosition(
        uint256 marketId,
        int256 size
    )
        external
        returns (
            uint256 requiredCollateral,
            uint256 fillPrice,
            uint256 price18DigitsAfter
        )
    {
        if (size == 0) {
            revert Errors.InvalidData("Size cannot be 0");
        }

        Market.Data storage market = Market.load(marketId);

        // check if market is not settled
        market.validateNotSettled();

        Position.Data memory position;
        position.marketId = marketId;

        Trade.QuoteOrTradeInputParams memory inputParams = Trade
            .QuoteOrTradeInputParams({
                oldPosition: position,
                initialSize: 0,
                targetSize: size,
                deltaSize: size,
                isQuote: true
            });

        Trade.QuoteOrTradeOutputParams memory outputParams = Trade.quoteOrTrade(
            inputParams
        );

        market.validatePriceInRange(outputParams.sqrtPriceX96After);
        price18DigitsAfter = DecimalPrice.sqrtRatioX96ToPrice(
            outputParams.sqrtPriceX96After
        );

        return (
            outputParams.requiredCollateral,
            outputParams.tradeRatioD18,
            price18DigitsAfter
        );
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
            uint256 fillPrice,
            uint256 price18DigitsAfter
        )
    {
        if (ERC721Storage._ownerOf(positionId) != msg.sender) {
            revert Errors.NotAccountOwner(positionId, msg.sender);
        }

        Position.Data storage position = Position.loadValid(positionId);

        // check if market is not settled
        Market.Data storage market = Market.load(position.marketId);
        market.validateNotSettled();

        if (position.kind != ISapienceStructs.PositionKind.Trade) {
            revert Errors.InvalidPositionKind();
        }

        int256 deltaSize = size - position.positionSize();

        if (deltaSize == 0) {
            revert Errors.InvalidData("Size cannot be 0");
        }

        Trade.QuoteOrTradeInputParams memory inputParams = Trade
            .QuoteOrTradeInputParams({
                oldPosition: position,
                initialSize: position.positionSize(),
                targetSize: size,
                deltaSize: deltaSize,
                isQuote: true
            });

        Trade.QuoteOrTradeOutputParams memory outputParams = Trade.quoteOrTrade(
            inputParams
        );

        market.validatePriceInRange(outputParams.sqrtPriceX96After);
        price18DigitsAfter = DecimalPrice.sqrtRatioX96ToPrice(
            outputParams.sqrtPriceX96After
        );

        return (
            outputParams.expectedDeltaCollateral,
            outputParams.closePnL,
            outputParams.tradeRatioD18,
            price18DigitsAfter
        );
    }

    function _checkTradeSize(int256 size) internal view {
        if (size == 0) {
            return;
        }

        uint256 modSize = size > 0 ? size.toUint() : (size * -1).toUint();
        if (modSize < MarketGroup.load().minTradeSize) {
            revert Errors.PositionSizeBelowMin();
        }
    }

    function _emitTraderPositionCreated(
        ISapiencePositionEvents.TraderPositionCreatedEventData memory eventData
    ) internal {
        emit ISapiencePositionEvents.TraderPositionCreated(
            eventData.sender,
            eventData.marketId,
            eventData.positionId,
            eventData.requiredCollateral,
            eventData.initialPrice,
            eventData.finalPrice,
            eventData.tradeRatio,
            eventData.positionCollateralAmount,
            eventData.positionVquoteAmount,
            eventData.positionVbaseAmount,
            eventData.positionBorrowedVquote,
            eventData.positionBorrowedVbase,
            eventData.deltaCollateral
        );
    }

    function _emitTraderPositionModified(
        ISapiencePositionEvents.TraderPositionModifiedEventData memory eventData
    ) internal {
        emit ISapiencePositionEvents.TraderPositionModified(
            eventData.sender,
            eventData.marketId,
            eventData.positionId,
            eventData.requiredCollateral,
            eventData.initialPrice,
            eventData.finalPrice,
            eventData.tradeRatio,
            eventData.positionCollateralAmount,
            eventData.positionVquoteAmount,
            eventData.positionVbaseAmount,
            eventData.positionBorrowedVquote,
            eventData.positionBorrowedVbase,
            eventData.deltaCollateral
        );
    }
}