// SPDX-License-Identifier: MIT
pragma solidity ^0.8.22;

/**
 * @title BridgeTypes
 * @notice Shared structs and types for LayerZero bridge contracts
 */
library BridgeTypes {
    struct BridgeConfig {
        uint32 remoteEid;
        address remoteBridge;
    }

    struct WithdrawalIntent {
        uint256 amount;
        uint256 timestamp;
        bool executed;
    }
}
