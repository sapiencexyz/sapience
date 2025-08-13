// SPDX-License-Identifier: MIT
pragma solidity ^0.8.22;

import {BridgeTypes} from "../BridgeTypes.sol";

/**
 * @title ILayerZeroBridge
 * @notice Common interface for LayerZero bridge contracts
 */
interface ILayerZeroBridge {
    // Events
    event BridgeConfigUpdated(BridgeTypes.BridgeConfig config);

    // Common functions
    function setBridgeConfig(
        BridgeTypes.BridgeConfig calldata _config
    ) external;
    function getBridgeConfig()
        external
        view
        returns (BridgeTypes.BridgeConfig memory);
}
