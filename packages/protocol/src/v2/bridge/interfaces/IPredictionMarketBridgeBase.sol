// SPDX-License-Identifier: MIT
pragma solidity ^0.8.19;

import { MessagingFee } from "@layerzerolabs/oapp-evm/contracts/oapp/OApp.sol";

/// @title IPredictionMarketBridgeBase
/// @notice Base interface for position token bridges
/// @dev Shared types, events, and errors for both Ethereal and Arbitrum bridges
interface IPredictionMarketBridgeBase {
    // ============ Enums ============

    /// @notice Bridge status
    enum BridgeStatus {
        NONE,
        PENDING,
        COMPLETED,
        CANCELLED
    }

    // ============ Structs ============

    /// @notice Bridge configuration (LZ settings)
    struct BridgeConfig {
        uint32 remoteEid;
        address remoteBridge;
        uint128 ackFeeEstimate; // Estimated fee for ACK message on remote chain
    }

    /// @notice Pending bridge record
    struct PendingBridge {
        address token;
        address sender;
        address recipient;
        uint256 amount;
        uint64 createdAt;
        uint64 lastRetryAt;
        BridgeStatus status;
    }

    // ============ Events ============

    /// @notice Emitted when bridge is initiated
    event BridgeInitiated(
        bytes32 indexed bridgeId,
        address indexed token,
        address indexed sender,
        address recipient,
        uint256 amount,
        uint64 createdAt,
        bytes32 refCode
    );

    /// @notice Emitted when bridge is retried
    event BridgeRetried(bytes32 indexed bridgeId, bytes32 refCode);

    /// @notice Emitted when bridge is completed (ACK received)
    event BridgeCompleted(bytes32 indexed bridgeId);

    /// @notice Emitted when a bridge is processed (for idempotency tracking)
    event BridgeProcessed(bytes32 indexed bridgeId, bool alreadyProcessed);

    /// @notice Emitted when bridge config is updated
    event BridgeConfigUpdated(BridgeConfig config);

    /// @notice Emitted when ACK is sent successfully
    event AckSent(bytes32 indexed bridgeId, uint256 fee);

    /// @notice Emitted when ACK send fails (for monitoring)
    event AckSendFailed(bytes32 indexed bridgeId);

    /// @notice Emitted when ACK cannot be sent due to insufficient balance
    event AckInsufficientBalance(
        bytes32 indexed bridgeId, uint256 required, uint256 available
    );

    /// @notice Emitted when ETH is withdrawn from the contract
    event ETHWithdrawn(address indexed to, uint256 amount);

    // ============ Errors ============

    /// @notice Zero address provided
    error ZeroAddress();

    /// @notice Zero amount provided
    error ZeroAmount();

    /// @notice Insufficient ETH for LZ fee
    error InsufficientFee(uint256 required, uint256 provided);

    /// @notice Invalid source chain
    error InvalidSourceChain(uint32 expected, uint32 actual);

    /// @notice Invalid sender
    error InvalidSender(address expected, address actual);

    /// @notice Invalid command type
    error InvalidCommandType(uint16 commandType);

    /// @notice Insufficient escrowed balance
    error InsufficientEscrowBalance(uint256 requested, uint256 available);

    /// @notice Bridge not found or wrong status
    error InvalidBridgeStatus(
        bytes32 bridgeId, BridgeStatus expected, BridgeStatus actual
    );

    /// @notice Retry too soon
    error RetryTooSoon(
        bytes32 bridgeId, uint64 lastRetryAt, uint64 minNextRetry
    );

    /// @notice ETH transfer failed
    error ETHTransferFailed();

    /// @notice Refund failed
    error RefundFailed();

    // ============ Bridge Functions ============

    /// @notice Retry a pending bridge (resend the message)
    /// @param bridgeId The bridge identifier
    /// @param refCode Referral code for tracking
    function retry(bytes32 bridgeId, bytes32 refCode) external payable;

    /// @notice Quote the fee for retrying a bridge
    /// @param bridgeId The bridge identifier
    /// @return fee The messaging fee
    function quoteRetry(bytes32 bridgeId)
        external
        view
        returns (MessagingFee memory fee);

    // ============ View Functions ============

    /// @notice Get pending bridge details
    /// @param bridgeId The bridge identifier
    /// @return The pending bridge record
    function getPendingBridge(bytes32 bridgeId)
        external
        view
        returns (PendingBridge memory);

    /// @notice Get all pending bridge IDs for a sender
    /// @param sender The sender address
    /// @return bridgeIds Array of pending bridge IDs
    function getPendingBridges(address sender)
        external
        view
        returns (bytes32[] memory bridgeIds);

    /// @notice Check if a bridge has been processed (for idempotency)
    /// @param bridgeId The bridge identifier
    /// @return True if the bridge was already processed
    function isBridgeProcessed(bytes32 bridgeId) external view returns (bool);

    /// @notice Get escrowed balance for a token
    /// @param token The token address
    /// @return The escrowed amount
    function getEscrowedBalance(address token) external view returns (uint256);

    /// @notice Get bridge configuration
    /// @return The bridge config
    function getBridgeConfig() external view returns (BridgeConfig memory);

    /// @notice Get the minimum retry delay
    /// @return The minimum delay between retries in seconds
    function getMinRetryDelay() external view returns (uint64);

    // ============ Ownership Management ============

    /// @notice Check if configuration is complete for safe ownership renouncement
    /// @return True if bridge config and LZ peer are set
    function isConfigComplete() external view returns (bool);

    /// @notice Renounce ownership after verifying config is complete
    /// @dev Reverts if config is incomplete
    function renounceOwnershipSafe() external;

    // ============ ETH Management ============

    /// @notice Withdraw accumulated ETH from the contract
    /// @param to Address to receive the ETH
    /// @param amount Amount to withdraw (use 0 for full balance)
    function withdrawETH(address payable to, uint256 amount) external;
}
