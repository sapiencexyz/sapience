// SPDX-License-Identifier: MIT
pragma solidity >=0.8.2 <0.9.0;

import "./ISapienceStructs.sol";
import "../storage/Position.sol";
import "./ILiquidityModule.sol";
import "./ITradeModule.sol";
import "./IConfigurationModule.sol";
import "./IViewsModule.sol";
import "./IUMASettlementModule.sol";
import "./ISettlementModule.sol";
import "./ISapiencePositionEvents.sol";

interface ISapience is
    ILiquidityModule,
    ITradeModule,
    IConfigurationModule,
    IViewsModule,
    IUMASettlementModule,
    ISettlementModule,
    ISapiencePositionEvents
{}
