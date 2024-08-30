// SPDX-License-Identifier: MIT
pragma solidity >=0.8.2 <0.9.0;

import "./IFoilStructs.sol";
import "../storage/Position.sol";
import "./ILiquidityModule.sol";
import "./ITradeModule.sol";
import "./ITradeViewsModule.sol";
import "./IConfigurationModule.sol";
import "./IViewsModule.sol";
import "./IUMASettlementModule.sol";
import "./ISettlementModule.sol";

interface IFoil is
    ILiquidityModule,
    ITradeModule,
    ITradeViewsModule,
    IConfigurationModule,
    IViewsModule,
    IUMASettlementModule,
    ISettlementModule
{}
