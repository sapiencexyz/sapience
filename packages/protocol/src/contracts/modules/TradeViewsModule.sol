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
        /*
        S = C / (Pe(1+fee) - Pl (1-fee))

        Where
        Pe = entry price (current price)
        Pl = lowest price set in market
        C = collateral
        Fee = Fee as D18 1/100 (1% in uni is 1000) => fee * 1e12
        */
        uint256 price = Trade.getReferencePrice(epochId);
        uint256 lowestPrice = Epoch.load(epochId).minPriceD18;
        uint256 fee = uint256(Epoch.load(epochId).params.feeRate) * 1e12; // scaled to 1e18 fee

        positionSize = collateral.divDecimal(
            deltaPriceMultiplier(price, lowestPrice, fee)
        );
    }

    /**
     * @inheritdoc ITradeViewsModule
     */
    function getShortSizeForCollateral(
        uint256 epochId,
        uint256 collateral
    ) external view override returns (uint256 modPositionSize) {
        /*
        S = C / ( Ph(1+fee) - Pe(1-fee))

        Where 
        Pe = entry price (current price)
        Ph = highest price set in market
        C = collateral
        Fee = Fee as D18 1/100 (1% in uni is 1000) => fee * 1e12
        */
        uint256 price = Trade.getReferencePrice(epochId);
        uint256 highestPrice = Epoch.load(epochId).maxPriceD18;
        uint256 fee = uint256(Epoch.load(epochId).params.feeRate) * 1e12; // scaled to 1e18 fee

        modPositionSize = collateral.divDecimal(
            deltaPriceMultiplier(highestPrice, price, fee)
        );
    }

    /**
     * @inheritdoc ITradeViewsModule
     */
    function getCollateralForLongSize(
        uint256 epochId,
        uint256 positionSize
    ) external view override returns (uint256 collateral) {
        uint256 price = Trade.getReferencePrice(epochId);
        uint256 lowestPrice = Epoch.load(epochId).minPriceD18;
        uint256 fee = uint256(Epoch.load(epochId).params.feeRate) * 1e12; // scaled to 1e18 fee

        collateral = positionSize.mulDecimal(
            deltaPriceMultiplier(price, lowestPrice, fee)
        );
    }

    /**
     * @inheritdoc ITradeViewsModule
     */
    function getCollateralForShortSize(
        uint256 epochId,
        uint256 positionSize
    ) external view override returns (uint256 collateral) {
        uint256 price = Trade.getReferencePrice(epochId);
        uint256 highestPrice = Epoch.load(epochId).maxPriceD18;
        uint256 fee = uint256(Epoch.load(epochId).params.feeRate) * 1e12; // scaled to 1e18 fee

        collateral = positionSize.mulDecimal(
            deltaPriceMultiplier(highestPrice, price, fee)
        );
    }

    function deltaPriceMultiplier(
        uint256 price0D18,
        uint256 price1D18,
        uint256 feeD18
    ) internal pure returns (uint256) {
        return
            price0D18.mulDecimal(DecimalMath.UNIT + feeD18) -
            price1D18.mulDecimal(DecimalMath.UNIT - feeD18);
    }
}
