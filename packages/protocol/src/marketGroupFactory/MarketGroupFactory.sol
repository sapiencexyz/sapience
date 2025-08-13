// SPDX-License-Identifier: MIT
pragma solidity >=0.8.2 <0.9.0;

import "@openzeppelin/contracts/proxy/Clones.sol";
import {IConfigurationModule} from "../market/interfaces/IConfigurationModule.sol";
import {ISapienceStructs} from "../market/interfaces/ISapienceStructs.sol";

contract MarketGroupFactory {
    using Clones for address;

    address public immutable implementation;

    event MarketGroupDeployed(address indexed sender, address indexed marketGroup, uint256 nonce);

    constructor(address _implementation) {
        implementation = _implementation;
    }

    function cloneAndInitializeMarketGroup(
        address collateralAsset,
        uint256 minTradeSize,
        bool bridgedSettlement,
        ISapienceStructs.MarketParams memory marketParams,
        uint256 nonce
    ) external returns (address) {
        address marketGroup = implementation.clone();

        IConfigurationModule(marketGroup).initializeMarketGroup(
            msg.sender, collateralAsset, minTradeSize, bridgedSettlement, marketParams
        );

        emit MarketGroupDeployed(msg.sender, marketGroup, nonce);

        return marketGroup;
    }
}
