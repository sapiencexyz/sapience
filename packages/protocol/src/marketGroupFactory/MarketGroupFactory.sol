// SPDX-License-Identifier: MIT
pragma solidity >=0.8.2 <0.9.0;

import "@openzeppelin/contracts/proxy/Clones.sol";
import {IConfigurationModule} from "../market/interfaces/IConfigurationModule.sol";
import {IFoilStructs} from "../market/interfaces/IFoilStructs.sol";

contract MarketGroupFactory {
    using Clones for address;

    address public immutable implementation;

    event MarketGroupInitialized(
        address indexed sender,
        address indexed marketGroup,
        uint256 nonce
    );

    constructor(address _implementation) {
        implementation = _implementation;
    }

    function cloneAndInitializeMarketGroup(
        address collateralAsset,
        address[] calldata feeCollectors,
        address callbackRecipient,
        uint256 minTradeSize,
        IFoilStructs.MarketParams memory marketParams,
        uint256 nonce
    ) external returns (address) {
        address marketGroup = implementation.clone();

        IConfigurationModule(marketGroup).initializeMarket(msg.sender, collateralAsset, feeCollectors, callbackRecipient, minTradeSize, marketParams);

        emit MarketGroupInitialized(msg.sender, marketGroup, nonce);

        return marketGroup;
    }
}