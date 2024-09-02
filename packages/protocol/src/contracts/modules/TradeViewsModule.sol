// SPDX-License-Identifier: MIT
pragma solidity >=0.8.25 <0.9.0;

import "../storage/Position.sol";
import "../storage/Trade.sol";
import "@synthetixio/core-contracts/contracts/utils/DecimalMath.sol";
import {SafeCastI256} from "@synthetixio/core-contracts/contracts/utils/SafeCast.sol";
import {SafeCastU256} from "@synthetixio/core-contracts/contracts/utils/SafeCast.sol";
import {ITradeViewsModule} from "../interfaces/ITradeViewsModule.sol";

import "forge-std/console2.sol";

/**
 * @title Module for trade positions.
 * @dev See ITradeViewsModule.
 */
contract TradeViewsModule is ITradeViewsModule {
    using Epoch for Epoch.Data;
    using Position for Position.Data;
    using DecimalMath for uint256;
    using SafeCastI256 for int256;
    using SafeCastU256 for uint256;

    /**
     * @inheritdoc ITradeViewsModule
     */
    function getReferencePrice(
        uint256 epochId
    ) external view override returns (uint256 price18Digits) {
        return Trade.getReferencePrice(epochId);
    }

    /**
     * @inheritdoc ITradeViewsModule
     */
    function getLongSizeForCollateral(
        uint256 epochId,
        uint256 collateral
    ) external view override returns (uint256 positionSize) {
        return Position.getLongSizeForCollateral(epochId, collateral);
    }

    /**
     * @inheritdoc ITradeViewsModule
     */
    function getShortSizeForCollateral(
        uint256 epochId,
        uint256 collateral
    ) external view override returns (uint256 modPositionSize) {
        return Position.getLongSizeForCollateral(epochId, collateral);
    }

    /**
     * @inheritdoc ITradeViewsModule
     */
    function getCollateralForLongSize(
        uint256 epochId,
        uint256 positionSize
    ) external view override returns (uint256 collateral) {
        return Position.getCollateralForLongSize(epochId, positionSize);
    }

    /**
     * @inheritdoc ITradeViewsModule
     */
    function getCollateralForShortSize(
        uint256 epochId,
        uint256 positionSize
    ) external view override returns (uint256 collateral) {
        return Position.getCollateralForShortSize(epochId, positionSize);
    }

    /**
     * @inheritdoc ITradeViewsModule
     */
    function getLongDeltaForCollateral(
        uint256 positionId,
        uint256 collateral
    ) external view override returns (uint256 modPositionSize) {
        return
            Position.loadValid(positionId).getLongDeltaForCollateral(
                collateral
            );
    }

    /**
     * @inheritdoc ITradeViewsModule
     */
    function getShortDeltaForCollateral(
        uint256 positionId,
        uint256 collateral
    ) external view override returns (uint256 modPositionSize) {
        return
            Position.loadValid(positionId).getShortDeltaForCollateral(
                collateral
            );
    }
}
