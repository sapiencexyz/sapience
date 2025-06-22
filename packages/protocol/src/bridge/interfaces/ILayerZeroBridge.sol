// SPDX-License-Identifier: UNLICENSED
pragma solidity ^0.8.22;

import { IERC20 } from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import { BridgeTypes } from "../BridgeTypes.sol";

/**
 * @title ILayerZeroBridge
 * @notice Common interface for LayerZero bridge contracts
 */
interface ILayerZeroBridge {
    // Common structs
    struct BridgeConfig {
        uint16 remoteChainId;
        address remoteBridge;
    }

    struct SettlementData {
        address market;
        uint256 epochId;
        uint256 settlementPrice;
        uint256 timestamp;
    }

    // Common events
    event BridgeConfigUpdated(BridgeTypes.BridgeConfig config);
    event SettlementSubmitted(address indexed market, uint256 indexed epochId, uint256 settlementPrice);
    event SettlementVerified(address indexed market, uint256 indexed epochId, bytes32 assertionId, bool verified);
    event BondDeposited(address indexed submitter, address indexed bondToken, uint256 amount);
    event BondWithdrawn(address indexed submitter, address indexed bondToken, uint256 amount);
    event WithdrawalIntentCreated(address indexed submitter, address indexed bondToken, uint256 amount, uint256 timestamp);
    event WithdrawalExecuted(address indexed submitter, address indexed bondToken, uint256 amount);
    event AssertionSubmitted(address indexed marketGroup, uint256 indexed marketId, uint256 assertionId);
    event GasReserveLow(uint256 currentBalance);
    event GasReserveCritical(uint256 currentBalance);

    // Common functions
    function setBridgeConfig(BridgeTypes.BridgeConfig calldata _config) external;
}

/**
 * @title IUMALayerZeroBridge
 * @notice Interface for UMA-side LayerZero bridge
 */
interface IUMALayerZeroBridge is ILayerZeroBridge {
    // UMA-side specific structs
    struct MarketBondConfig {
        address bondToken;
        uint256 bondAmount;
    }

    struct WithdrawalIntent {
        uint256 amount;
        uint256 timestamp;
        bool executed;
    }

    // UMA-side specific events
    event MarketBondConfigSet(address indexed market, address bondToken, uint256 bondAmount);
    event BondLostInDispute(address indexed submitter, address indexed bondToken, uint256 amount);
    event BondReturnedFromDispute(address indexed submitter, address indexed bondToken, uint256 amount);
    event ETHDeposited(address indexed depositor, uint256 amount);
    event ETHWithdrawn(address indexed recipient, uint256 amount);

    // UMA-side specific functions
    // function setMarketBondConfig(address market, MarketBondConfig calldata config) external;
    // function getMarketBondConfig(address market) external view returns (MarketBondConfig memory);
    // function getBondBalance(address market, uint256 epochId) external view returns (uint256);
    // function getWithdrawalIntent(address market) external view returns (WithdrawalIntent memory);
    // function createWithdrawalIntent(uint256 amount) external;
    // function executeWithdrawal() external;
    // function processSettlement(SettlementData calldata data) external payable;
    // function verifySettlement(VerificationData calldata data) external payable;
}

/**
 * @title IMarketLayerZeroBridge
 * @notice Interface for Market-side LayerZero bridge
 */
interface IMarketLayerZeroBridge is ILayerZeroBridge {
    // Market-side specific structs
    struct RemoteBalance {
        uint256 amount;
        uint256 lastUpdateTimestamp;
    }

    // Market-side specific events
    event RemoteBalanceUpdated(address indexed market, uint256 amount, uint256 timestamp);
    event SettlementProcessed(address indexed market, uint256 indexed epochId, uint256 settlementPrice);
    event MarketGroupEnabled(address indexed marketGroup);
    event MarketGroupDisabled(address indexed marketGroup);
    event ETHDeposited(address indexed depositor, uint256 amount);
    event ETHWithdrawn(address indexed recipient, uint256 amount);

    // Market-side specific functions
    // function getRemoteBalance(address submitter, address bondToken) external view returns (uint256);
    // function getRemoteBondBalance(address submitter, address bondToken) external view returns (uint256);
    function forwardAssertTruth(
        address marketGroup,
        uint256 marketId,
        bytes memory claim,
        address asserter,
        uint64 liveness,
        IERC20 currency,
        uint256 bond
    ) external returns (bytes32);
} 