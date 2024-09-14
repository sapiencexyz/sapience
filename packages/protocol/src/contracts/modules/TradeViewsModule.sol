// SPDX-License-Identifier: MIT
pragma solidity >=0.8.25 <0.9.0;

import "../storage/Trade.sol";
import {ITradeViewsModule} from "../interfaces/ITradeViewsModule.sol";

/**
 * @title Module for trade positions.
 * @dev See ITradeViewsModule.
 */
contract TradeViewsModule is ITradeViewsModule {
    /**
     * @inheritdoc ITradeViewsModule
     */
    function getReferencePrice(
        uint256 epochId
    ) external view override returns (uint256 price18Digits) {
        return Trade.getReferencePrice(epochId);
    }
}
