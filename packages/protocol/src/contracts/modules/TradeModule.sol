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
        position.depositedCollateralAmount = outputParams
            .position
            .depositedCollateralAmount;

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

            console2.log("UPDATE: DELTA COLLATERAL", deltaCollateral);
            console2.log(
                "UPDATE: DELTA COLLATERAL LIMIT",
                deltaCollateralLimit
            );
            // Check if the collateral is within the limit
            _checkDeltaCollateralLimit(deltaCollateral, deltaCollateralLimit);

            // Now the position should be closed. All the vToken and collateral values set to zero
        } else {
            // Not closing, proced as a normal trade

            // Transfer the locked collateral to the market or viceversa
            int256 deltaCollateral = position.updateCollateral(
                outputParams.requiredCollateral
            );

            console2.log("UPDATE: DELTA COLLATERAL", deltaCollateral);
            console2.log(
                "UPDATE: DELTA COLLATERAL LIMIT",
                deltaCollateralLimit
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
    ) external returns (int256 expectedCollateralDelta, int256 closePnL) {
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

        return (outputParams.expectedDeltaCollateral, outputParams.closePnL);
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
        uint256 tradedVGas;
        uint256 tradedVEth;
        int256 signedTradedVGas;
        int256 signedTradedVEth;
        uint256 tradeRatioD18; // tradedVEth / tradedVGas
        int256 vEthToZero; // required vEth to close the initial position (to zero)
        int256 vEthFromZero; // vEth involved in the transaction from zero to target size
        // bool originalIsLong;
        // int256 vEthFromZero;
        // uint256 positionVGas;
        // uint256 positionVEth;
        // int256 deltaCollateral;
        // uint256 extraCollateralRequired;
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
            console2.log("LONG DIRECTION ", params.isQuote ? "QUOTE" : "TRADE");
            // Pick the right values based on the direction
            runtime.signedTradedVGas = params.deltaSize;
            runtime.tradedVGas = params.deltaSize.toUint();
            // runtime.positionVGas = params.oldPosition.borrowedVGas;
            // runtime.positionVEth = params.oldPosition.vEthAmount;

            console2.log(" ==== tradedVGas", runtime.tradedVGas);
            // console2.log(" ==== positionVGas", runtime.positionVGas);
            // console2.log(" ==== positionVEth", runtime.positionVEth);

            // Long direction; Quote or Trade
            (runtime.tradedVEth, ) = Trade.swapOrQuoteTokensExactOut(
                epoch,
                0,
                runtime.tradedVGas,
                params.isQuote
            );
            runtime.signedTradedVEth = runtime.tradedVEth.toInt();

            console2.log(" ==== tradedVEth", runtime.tradedVEth);
        } else {
            console2.log(
                "SHORT DIRECTION ",
                params.isQuote ? "QUOTE" : "TRADE"
            );
            // Pick the right values based on the direction
            runtime.signedTradedVGas = params.deltaSize;
            runtime.tradedVGas = (params.deltaSize * -1).toUint();
            // runtime.positionVGas = params.oldPosition.vGasAmount;
            // runtime.positionVEth = params.oldPosition.borrowedVEth;

            console2.log(" ==== tradedVGas", runtime.tradedVGas);
            // console2.log(" ==== positionVGas", runtime.positionVGas);
            // console2.log(" ==== positionVEth", runtime.positionVEth);

            // Short direction; Quote or Trade
            (runtime.tradedVEth, ) = Trade.swapOrQuoteTokensExactIn(
                epoch,
                0,
                runtime.tradedVGas,
                params.isQuote
            );
            runtime.signedTradedVEth = runtime.tradedVEth.toInt() * -1;

            console2.log(" ==== tradedVEth", runtime.tradedVEth);
        }

        // Sanity check. vGas on trade is zero means someting went really wrong (or )
        if (runtime.tradedVGas == 0) {
            revert Errors.InvalidTradeSize(0);
        }

        console2.log(" ==== BEFORE 2");
        // 2- Get PnL and vEth involved in the transaction from initial size to zero (intermediate close the position).
        runtime.tradeRatioD18 = runtime.tradedVEth.divDecimal(
            runtime.tradedVGas
        );
        // vEth to compensate the gas (either to pay borrowedVGas or borrowerVEth paid from the vGas tokens from the close trade)
        runtime.vEthToZero = (params.initialSize * -1).mulDecimal(
            runtime.tradeRatioD18.toInt()
        );
        // net vEth from oritinal positon minus the vEth to zero
        output.closePnL =
            params.oldPosition.vEthAmount.toInt() -
            params.oldPosition.borrowedVEth.toInt() -
            runtime.vEthToZero;
        // vEth from the trade that wasn't used to close the initial position (should be same as targetSize*tradeRatio, but there can be some rounding errors)
        runtime.vEthFromZero = runtime.signedTradedVEth - runtime.vEthToZero;

        console2.log(" ==  >> tradedVEth       ", runtime.tradedVEth);
        console2.log(" ==  >> tradedVGas       ", runtime.tradedVGas);
        console2.log(" ==  >> tradeRatioD18    ", runtime.tradeRatioD18);
        console2.log(" ==  >> vEthToZero       ", runtime.vEthToZero);
        console2.log(" ==  >> vEthFromZero     ", runtime.vEthFromZero);
        console2.log(" ==  >> closePnL         ", output.closePnL);
        console2.log(" ==  >> signedTradedVEth ", runtime.signedTradedVEth);
        console2.log(" ==  >> signedTradedVGas ", runtime.signedTradedVGas);

        console2.log(" ==== AFTER 2");

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
        // Adjust the collateral with the PnL
        uint256 extraCollateralRequired;
        if (output.closePnL >= 0) {
            console2.log(" ==== PnL is positive");
            console2.log(
                " ==== >> output.closePnL                       ",
                output.closePnL
            );
            console2.log(
                " ==== >> oldPosition.depositedCollateralAmount ",
                params.oldPosition.depositedCollateralAmount
            );
            output.position.depositedCollateralAmount =
                params.oldPosition.depositedCollateralAmount +
                output.closePnL.toUint();
        } else {
            console2.log(" ==== PnL is negative");
            // If closePnL is negative, it means that the position is in a loss
            // and the collateral should be reduced
            uint256 collateralToReturn = (output.closePnL * -1).toUint();
            console2.log(
                " ==== >> collateralToReturn                    ",
                collateralToReturn
            );
            console2.log(
                " ==== >> oldPosition.depositedCollateralAmount ",
                params.oldPosition.depositedCollateralAmount
            );

            if (
                collateralToReturn >
                params.oldPosition.depositedCollateralAmount
            ) {
                // If the collateral to return is more than the deposited collateral, then the position is in a loss
                // and the collateral should be reduced to zero
                output.position.depositedCollateralAmount = 0;
                extraCollateralRequired =
                    collateralToReturn -
                    params.oldPosition.depositedCollateralAmount;
            } else {
                output.position.depositedCollateralAmount =
                    params.oldPosition.depositedCollateralAmount -
                    collateralToReturn;
            }
        }
        console2.log(
            " ==== >> extraCollateralRequired               ",
            extraCollateralRequired
        );

        // 5- Get the required collateral for the trade\quote
        uint256 newPositionCollateralRequired = epoch
            .getCollateralRequirementsForTrade(
                output.position.vGasAmount,
                output.position.vEthAmount,
                output.position.borrowedVGas,
                output.position.borrowedVEth
            );
        console2.log(
            " ==== >> newPositionCollateralRequired           ",
            newPositionCollateralRequired
        );

        output.requiredCollateral =
            newPositionCollateralRequired +
            extraCollateralRequired;
        console2.log(
            " ==== >> requiredCollateral                   ",
            output.requiredCollateral
        );

        output.expectedDeltaCollateral =
            output.requiredCollateral.toInt() -
            output.position.depositedCollateralAmount.toInt();
        console2.log(
            " ==== >> expectedDeltaCollateral               ",
            output.expectedDeltaCollateral
        );
    }
}
