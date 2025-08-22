// SPDX-License-Identifier: MIT
pragma solidity ^0.8.22;

import {BridgeTypes} from "../BridgeTypes.sol";

/**
 * @title ILayerZeroBridge
 * @notice Common interface for LayerZero bridge contracts
 */
interface ILayerZeroBridge {
    // Custom errors
    error InvalidSourceChain(uint32 expectedEid, uint32 actualEid);
    error InvalidSender(address expectedSender, address actualSender);
    error InvalidCommandType(uint16 commandType);
    error OnlySelfCallAllowed(address caller);

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
