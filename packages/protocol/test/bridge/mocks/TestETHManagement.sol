// SPDX-License-Identifier: MIT
pragma solidity ^0.8.22;

import {OApp} from "@layerzerolabs/oapp-evm/contracts/oapp/OApp.sol";
import {Origin} from "@layerzerolabs/lz-evm-protocol-v2/contracts/interfaces/ILayerZeroEndpointV2.sol";
import {ETHManagement} from "../../../src/bridge/abstract/ETHManagement.sol";
import {ILayerZeroBridge} from "../../../src/bridge/interfaces/ILayerZeroBridge.sol";
import {BridgeTypes} from "../../../src/bridge/BridgeTypes.sol";

/**
 * @title TestETHManagement
 * @notice Simple test contract that extends ETHManagement to test abstract functionality
 */
contract TestETHManagement is OApp, ETHManagement, ILayerZeroBridge {
    BridgeTypes.BridgeConfig private bridgeConfig;

    constructor(address _endpoint, address _owner) OApp(_endpoint, _owner) ETHManagement(_owner) {}

    function setBridgeConfig(BridgeTypes.BridgeConfig calldata _config) external override onlyOwner {
        bridgeConfig = _config;
        emit ILayerZeroBridge.BridgeConfigUpdated(_config);
    }

    function getBridgeConfig() external view override returns (BridgeTypes.BridgeConfig memory) {
        return bridgeConfig;
    }

    function _lzReceive(Origin calldata, bytes32, bytes calldata, address, bytes calldata)
        internal
        override
    {
        // Stub implementation for testing
    }
}
