// SPDX-License-Identifier: MIT
pragma solidity >=0.8.2 <0.9.0;

import "./IFoilStructs.sol";
import "../storage/Position.sol";
import "../storage/FAccount.sol";
import "./IEpochLiquidityModule.sol";
import "./IEpochTradeModule.sol";
import "./IEpochConfigurationModule.sol";

interface IFoil is
    IEpochLiquidityModule,
    IEpochTradeModule,
    IEpochConfigurationModule
{}
