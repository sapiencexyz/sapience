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
        require(block.timestamp <= deadline, Errors.TransactionTooOld());

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

        console2.log(position.vEthAmount);
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
        require(block.timestamp <= deadline, Errors.TransactionTooOld());

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
    ) external returns (uint256 requiredCollateral) {
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

        return outputParams.requiredCollateral;
    }

    /**
     * @inheritdoc ITradeModule
     */
    function quoteModifyTraderPosition(
        uint256 positionId,
        int256 size
    ) external returns (int256 expectedCollateralDelta) {
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

        return outputParams.expectedDeltaCollateral;
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

    struct QuoteRuntime {
        bool isLongDirection;
        bool originalIsLong;
        int256 vEthFromZero;
        uint256 tradedVGas;
        uint256 tradedVEth;
        uint256 positionVGas;
        uint256 positionVEth;
        uint256 tradeRatioD18;
        int256 deltaCollateral;
        uint256 extraCollateralRequired;
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
        uint256 tradeRatioD18;
        uint256 requiredCollateral;
        int256 expectedDeltaCollateral;
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
            console2.log("LONG DIRECTION TRADE/QUOTE");
            console2.log(" ==== STEP ", params.isQuote ? "QUOTE" : "TRADE");
            // Pick the right values based on the direction
            runtime.tradedVGas = params.deltaSize.toUint();
            runtime.positionVGas = params.oldPosition.borrowedVGas;
            runtime.positionVEth = params.oldPosition.vEthAmount;

            console2.log(" ==== tradedVGas", runtime.tradedVGas);
            console2.log(" ==== positionVGas", runtime.positionVGas);
            console2.log(" ==== positionVEth", runtime.positionVEth);

            // Long direction; Quote or Trade
            (runtime.tradedVEth, ) = Trade.swapOrQuoteTokensExactOut(
                epoch,
                0,
                runtime.tradedVGas,
                params.isQuote
            );
            console2.log(" ==== tradedVEth", runtime.tradedVEth);
        } else {
            console2.log("SHORT TRADE");
            // Pick the right values based on the direction
            runtime.tradedVGas = (params.deltaSize * -1).toUint();
            runtime.positionVGas = params.oldPosition.vGasAmount;
            runtime.positionVEth = params.oldPosition.borrowedVEth;

            console2.log(" ==== STEP ", params.isQuote ? "QUOTE" : "TRADE");
            console2.log(" ==== tradedVGas", runtime.tradedVGas);
            console2.log(" ==== positionVGas", runtime.positionVGas);
            console2.log(" ==== positionVEth", runtime.positionVEth);

            // Short direction; Quote or Trade
            (runtime.tradedVEth, ) = Trade.swapOrQuoteTokensExactIn(
                epoch,
                0,
                runtime.tradedVGas,
                params.isQuote
            );
            console2.log(" ==== tradedVEth", runtime.tradedVEth);
        }

        // Sanity check. vGas on trade is zero means someting went really wrong (or )
        if (runtime.tradedVGas == 0) {
            revert Errors.InvalidTradeSize(0);
        }

        console2.log(" ==== BEFORE 2");
        // 2- Reconcile the collateral and vEth for the position doing a closure as a intermediate state, accrue pnl and then apply the change to the new size from zero.
        (
            runtime.vEthFromZero,
            runtime.deltaCollateral,
            output.tradeRatioD18
        ) = _getVirtualTokensAtZeroSize(
            runtime.tradedVGas,
            runtime.tradedVEth,
            params.initialSize,
            params.targetSize,
            runtime.positionVEth
        );
        console2.log(" ==== AFTER 2");

        int256 directionalDeltaCollateral;

        if (params.initialSize > 0) {
            // close long
            params.oldPosition.vGasAmount = 0;
            params.oldPosition.borrowedVEth = 0;
        } else {
            // close short
            params.oldPosition.borrowedVGas = 0;
            params.oldPosition.vEthAmount = 0;
        }

        if (runtime.isLongDirection) {
            directionalDeltaCollateral = runtime.deltaCollateral * -1;
        } else {
            directionalDeltaCollateral = runtime.deltaCollateral;
        }

        console2.log(
            " ==== directionalDeltaCollateral",
            directionalDeltaCollateral
        );

        uint256 deltaCollateralModulus = runtime.deltaCollateral >= 0
            ? runtime.deltaCollateral.toUint()
            : (runtime.deltaCollateral * -1).toUint();

        console2.log(" ==== deltaCollateralModulus", deltaCollateralModulus);

        if (directionalDeltaCollateral >= 0) {
            output.position.depositedCollateralAmount += deltaCollateralModulus;
        } else {
            if (
                deltaCollateralModulus >
                output.position.depositedCollateralAmount
            ) {
                output.position.depositedCollateralAmount = 0;
                runtime.extraCollateralRequired = (deltaCollateralModulus -
                    output.position.depositedCollateralAmount);
            } else {
                output
                    .position
                    .depositedCollateralAmount -= deltaCollateralModulus;
            }
        }

        console2.log(" ==== BEFORE 3");

        // 3- Update the `in memory` position with the new values
        if (params.targetSize > 0) {
            // End position is LONG
            output.position.vGasAmount = params.targetSize.toUint();
            output.position.vEthAmount = 0;
            output.position.borrowedVGas = 0;
            output.position.borrowedVEth =
                params.oldPosition.borrowedVEth +
                runtime.tradedVEth;
        } else {
            // End position is SHORT
            output.position.vGasAmount = 0;
            output.position.vEthAmount =
                params.oldPosition.vEthAmount +
                runtime.tradedVEth;
            output.position.borrowedVGas = (params.targetSize * -1).toUint();
            output.position.borrowedVEth = 0;
        }

        console2.log(" ==== AFTER 3");

        // 4- Get the required collateral for the trade\quote
        output.requiredCollateral =
            epoch.getCollateralRequirementsForTrade(
                output.position.vGasAmount,
                output.position.vEthAmount,
                output.position.borrowedVGas,
                output.position.borrowedVEth
            ) +
            runtime.extraCollateralRequired;

        output.expectedDeltaCollateral =
            output.requiredCollateral.toInt() -
            output.position.depositedCollateralAmount.toInt();
    }

    function _getVirtualTokensAtZeroSize(
        uint256 tradedVGas,
        uint256 tradedVEth,
        int256 initialSizeVGas,
        int256 finalSizeVGas,
        uint256 currentVEth
    )
        internal
        pure
        returns (
            int256 vEthFromZero,
            int256 deltaCollateralToZero,
            uint256 tradeRatioD18
        )
    {
        console2.log("IN _getVirtualTokensAtZeroSize");
        console2.log("tradedVGas", tradedVGas);
        console2.log("tradedVEth", tradedVEth);
        console2.log("initialSizeVGas", initialSizeVGas);
        console2.log("finalSizeVGas", finalSizeVGas);
        console2.log("currentVEth", currentVEth);

        tradeRatioD18 = tradedVEth.divDecimal(tradedVGas);
        console2.log("tradeRatioD18", tradeRatioD18);

        int256 vEthToZero = initialSizeVGas.mulDecimal(tradeRatioD18.toInt());
        console2.log("vEthToZero", vEthToZero);
        vEthFromZero = tradedVEth.toInt() - vEthToZero;
        console2.log("vEthFromZero", vEthFromZero);
        int256 netVEth = vEthFromZero + vEthToZero;
        console2.log("netVEth", netVEth);

        deltaCollateralToZero = currentVEth.toInt() - vEthToZero;
        console2.log("deltaCollateralToZero", deltaCollateralToZero);
    }
}
