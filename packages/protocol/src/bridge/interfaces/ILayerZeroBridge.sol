// SPDX-License-Identifier: UNLICENSED
pragma solidity ^0.8.22;

interface ILayerZeroBridge {
    // Structs
    struct BridgeConfig {
        address optimisticOracleV3;   // UMA's OptimisticOracleV3 address (UMA side only)
        uint256 assertionLiveness;    // UMA's assertion liveness period
        uint16 remoteChainId;         // LayerZero chain ID of the other bridge
        address remoteBridge;         // Address of the other bridge contract
        uint256 balanceUpdateTimeout; // Timeout for balance updates
        uint256 withdrawalDelay;      // Waiting period for withdrawals
    }

    struct MarketBondConfig {
        address bondToken;            // Token used for bonds
        uint256 bondAmount;           // Amount of bond tokens required
    }

    struct WithdrawalIntent {
        uint256 amount;
        uint256 timestamp;
        bool executed;
    }

    enum BalanceUpdateType {
        DEPOSIT,
        WITHDRAWAL,
        ASSERTION_USED,
        ASSERTION_RETURNED
    }

    struct BalanceUpdate {
        address submitter;
        address bondToken;
        uint256 newBalance;
        BalanceUpdateType updateType;
    }

    // Events
    event SettlementSubmitted(address indexed market, uint256 indexed epochId, bytes32 assertionId);
    event SettlementVerified(address indexed market, uint256 indexed epochId, bool verified);
    event SettlementDisputed(address indexed market, uint256 indexed epochId);
    event DisputeResolved(address indexed market, uint256 indexed epochId, bool asserterWon);
    event BridgeConfigUpdated(BridgeConfig newConfig);
    event MarketBondConfigUpdated(address indexed market, MarketBondConfig newConfig);
    event GasReserveLow(uint256 currentBalance);
    event GasReserveCritical(uint256 currentBalance);
    event BondDeposited(address indexed submitter, address indexed bondToken, uint256 amount);
    event WithdrawalIntentCreated(address indexed submitter, address indexed bondToken, uint256 amount);
    event WithdrawalExecuted(address indexed submitter, address indexed bondToken, uint256 amount);
    event WithdrawalCancelled(address indexed submitter, address indexed bondToken);
    event InsufficientBondBalance(address indexed submitter, address indexed bondToken, uint256 required);
    event BalanceUpdateSent(address indexed submitter, address indexed bondToken, uint256 newBalance);
    event BalanceUpdateReceived(address indexed submitter, address indexed bondToken, uint256 newBalance);
    event BalanceUpdateFailed(address indexed submitter, address indexed bondToken);
    event BalanceSyncError(address indexed submitter, address indexed bondToken);

    // Bond Management Functions
    function depositBond(address bondToken, uint256 amount) external;
    function intentToWithdrawBond(address bondToken, uint256 amount) external;
    function executeWithdrawal(address bondToken) external;
    function getBondBalance(address submitter, address bondToken) external view returns (uint256);
    function getPendingWithdrawal(address submitter, address bondToken) external view returns (uint256, uint256);

    // Settlement Functions
    function submitSettlement(
        address market,
        uint256 epochId,
        uint256 settlementPrice,
        address bondToken,
        uint256 bondAmount
    ) external payable returns (bytes32);

    function verifySettlement(
        address market,
        uint256 epochId,
        bytes32 assertionId,
        bool verified
    ) external payable;

    // Configuration Functions
    function setBridgeConfig(BridgeConfig calldata newConfig) external;
    function setMarketBondConfig(address market, MarketBondConfig calldata newConfig) external;

    // View Functions
    function getBridgeConfig() external view returns (BridgeConfig memory);
    function getMarketBondConfig(address market) external view returns (MarketBondConfig memory);
} 