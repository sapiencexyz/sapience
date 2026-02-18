// SPDX-License-Identifier: MIT
pragma solidity ^0.8.19;

/// @title LZTypes
/// @notice Minimal types for LayerZero bridge communication
library LZTypes {
    struct BridgeConfig {
        uint32 remoteEid;
        address remoteBridge;
    }
}
