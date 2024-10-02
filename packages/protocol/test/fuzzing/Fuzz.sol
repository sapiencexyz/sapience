// SPDX-License-Identifier: GPL-3.0
pragma solidity ^0.8.0;

import "./FuzzEpochConfigurationModule.sol";
import "./FuzzEpochLiquidityModule.sol";
import "./FuzzEpochSettlementModule.sol";
import "./FuzzEpochTradeModule.sol";
import "./FuzzEpochUMASettlementModule.sol";

contract Fuzz is
    FuzzEpochConfigurationModule,
    FuzzEpochLiquidityModule,
    FuzzEpochSettlementModule,
    FuzzEpochTradeModule,
    FuzzEpochUMASettlementModule
{
    constructor() payable {
        setupFoil();
    }
}
