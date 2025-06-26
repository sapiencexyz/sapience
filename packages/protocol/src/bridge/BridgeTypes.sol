// SPDX-License-Identifier: MIT
pragma solidity ^0.8.22;

/**
 * @title BridgeTypes
 * @notice Shared structs and types for LayerZero bridge contracts
 */
library BridgeTypes {
    struct BridgeConfig {
        uint32 remoteChainId;
        address remoteBridge;
        address settlementModule;
    }

    struct SettlementData {
        address market;
        uint256 epochId;
        uint256 settlementPrice;
        uint256 timestamp;
    }

    struct VerificationData {
        address market;
        uint256 epochId;
        bytes32 assertionId;
        bool verified;
    }

    struct MarketBondConfig {
        address bondToken;
        uint256 bondAmount;
    }

    struct WithdrawalIntent {
        uint256 amount;
        uint256 timestamp;
        bool executed;
    }

    struct RemoteBalance {
        uint256 amount;
        uint256 lastUpdateTimestamp;
    }
} 