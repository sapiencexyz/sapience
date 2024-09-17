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
        uint256 maxCollateral,
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
        if (requiredCollateralAmount > maxCollateral) {
            revert Errors.CollateralLimitReached(
                requiredCollateralAmount,
                maxCollateral
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
        uint256 maxCollateral,
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

        if (size == 0) {
            // Closing the position. No need to check collateral limit
            // We need to:
            // 1. Reconcile the tokens
            position.reconcileTokens();

            // 2. Confirm no vgas tokens
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

            // 3. Confirm collateral is enough to pay for borrowed veth
            if (position.borrowedVEth > 0) {
                uint256 collateralRequired = position.getRequiredCollateral();
                if (collateralRequired > position.depositedCollateralAmount) {
                    // Notice. This error should not happen. If it's here it means something went wrong
                    revert Errors.InsufficientCollateral(
                        collateralRequired,
                        position.depositedCollateralAmount
                    );
                }
            }

            // 4. Reconcile collateral
            position.reconcileCollateral();

            // 5. Transfer the released collateral to the trader (pnl)
            position.updateCollateral(0);

            // Now the position should be closed. All the vToken and collateral values set to zero
        } else {
            // Not closing, proced as a normal trade

            // Check if the collateral is within the limit
            if (requiredCollateralAmount > maxCollateral) {
                revert Errors.CollateralLimitReached(
                    requiredCollateralAmount,
                    maxCollateral
                );
            }

            // Ensures that the position only have single side tokens
            position.reconcileTokens();

            if (size == 0) {
                // close position
                // gas should be zero, reconcile vEth tokens to collateral
                assert(position.vGasAmount == 0);
                assert(position.borrowedVGas == 0);
            }

            // Transfer the locked collateral to the market or viceversa
            position.updateCollateral(requiredCollateralAmount);

            // Validate after trading that collateral is enough
            position.afterTradeCheck();
        }

        uint256 finalPrice = Trade.getReferencePrice(position.epochId);

        epoch.validateCurrentPoolPriceInRange();

        emit TraderPositionCreated(
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
        if (size == 0) {
            // closing cannot happen after endTime, before settlement
            Epoch.load(position.epochId).validateSettlementSanity();
        } else {
            // trading (not closing), can only happen if before endTime
            Epoch.load(position.epochId).validateNotSettled();
        }

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
        uint256 vGasDeltaTokens = deltaSize.toUint();
        Epoch.Data storage epoch = Epoch.load(position.epochId);

        (uint256 requiredAmountInVEth, ) = Trade.swapOrQuoteTokensExactOut(
            epoch,
            0,
            vGasDeltaTokens,
            true
        );

        requiredCollateral = epoch.getCollateralRequirementsForTrade(
            position.vGasAmount + vGasDeltaTokens,
            position.vEthAmount,
            position.borrowedVGas,
            position.borrowedVEth + requiredAmountInVEth
        );
    }

    function _quoteModifyShortDirection(
        Position.Data storage position,
        int256 deltaSize
    ) internal returns (uint256 requiredCollateral) {
        uint256 vGasDeltaDebt = (deltaSize * -1).toUint();

        Epoch.Data storage epoch = Epoch.load(position.epochId);

        (uint256 amountOutVEth, ) = Trade.swapOrQuoteTokensExactIn(
            epoch,
            0,
            vGasDeltaDebt,
            true
        );

        requiredCollateral = epoch.getCollateralRequirementsForTrade(
            position.vGasAmount,
            position.vEthAmount + amountOutVEth,
            position.borrowedVGas + vGasDeltaDebt,
            position.borrowedVEth
        );
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

        // Update the position
        position.borrowedVEth += vEthDebt;
        position.vGasAmount += vGasTokens;

        // get required collateral from the position
        collateralRequired = position.getRequiredCollateral();

        // get average trade ratio (price)
        if (vGasTokens == 0) {
            tradeRatioD18 = 0;
        } else {
            tradeRatioD18 = requiredAmountInVEth.divDecimal(vGasTokens);
        }
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

        // Update the position
        position.vEthAmount += vEthTokens;
        position.borrowedVGas += vGasDebt;

        // get required collateral from the position
        collateralRequired = position.getRequiredCollateral();

        // get average trade ratio (price)
        if (vGasDebt == 0) {
            tradeRatioD18 = 0;
        } else {
            tradeRatioD18 = amountOutVEth.divDecimal(vGasDebt);
        }
    }
}
