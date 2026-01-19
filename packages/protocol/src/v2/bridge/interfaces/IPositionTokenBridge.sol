// SPDX-License-Identifier: MIT
pragma solidity ^0.8.19;

import {MessagingFee} from "@layerzerolabs/oapp-evm/contracts/oapp/OApp.sol";

/// @title IPositionTokenBridge
/// @notice Interface for position token bridge on Ethereal (source chain)
/// @dev Permissionless bridge with two-phase commit (ACK) for safety
interface IPositionTokenBridge {
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
        uint64 createdAt
    );

    /// @notice Emitted when bridge is retried
    event BridgeRetried(bytes32 indexed bridgeId, uint256 retryCount);

    /// @notice Emitted when bridge is completed (ACK received)
    event BridgeCompleted(bytes32 indexed bridgeId);

    /// @notice Emitted when bridge is cancelled (expired)
    event BridgeCancelled(bytes32 indexed bridgeId, address indexed sender, uint256 amount);

    /// @notice Emitted when tokens are released from escrow (bridgeBack completed)
    event TokensReleased(
        bytes32 indexed bridgeId,
        address indexed token,
        address indexed recipient,
        uint256 amount
    );

    /// @notice Emitted when bridge config is updated
    event BridgeConfigUpdated(BridgeConfig config);

    /// @notice Emitted when a bridge back is processed (for idempotency tracking)
    event BridgeBackProcessed(bytes32 indexed bridgeId, bool alreadyProcessed);

    // ============ Errors ============

    /// @notice Zero address provided
    error ZeroAddress();

    /// @notice Zero amount provided
    error ZeroAmount();

    /// @notice Insufficient ETH for LZ fee
    error InsufficientFee(uint256 required, uint256 provided);

    /// @notice Token does not implement IPositionToken
    error InvalidToken(address token);

    /// @notice Invalid source chain
    error InvalidSourceChain(uint32 expected, uint32 actual);

    /// @notice Invalid sender
    error InvalidSender(address expected, address actual);

    /// @notice Invalid command type
    error InvalidCommandType(uint16 commandType);

    /// @notice Insufficient escrowed balance
    error InsufficientEscrowBalance(uint256 requested, uint256 available);

    /// @notice Bridge not found or wrong status
    error InvalidBridgeStatus(bytes32 bridgeId, BridgeStatus expected, BridgeStatus actual);

    /// @notice Bridge not yet expired for emergency cancel
    error BridgeNotExpiredForEmergencyCancel(bytes32 bridgeId, uint64 createdAt, uint64 currentTime);

    /// @notice Retry too soon
    error RetryTooSoon(bytes32 bridgeId, uint64 lastRetryAt, uint64 minNextRetry);

    /// @notice Not the bridge sender
    error NotBridgeSender(bytes32 bridgeId, address expected, address actual);

    /// @notice ETH transfer failed
    error ETHTransferFailed();

    /// @notice Refund failed
    error RefundFailed();

    // ============ Bridge Functions ============

    /// @notice Bridge tokens to remote chain
    /// @param token The position token address
    /// @param recipient Recipient on remote chain
    /// @param amount Amount to bridge
    /// @return bridgeId The unique bridge identifier
    function bridge(
        address token,
        address recipient,
        uint256 amount
    ) external payable returns (bytes32 bridgeId);

    /// @notice Retry a pending bridge (resend the message)
    /// @param bridgeId The bridge identifier
    function retryBridge(bytes32 bridgeId) external payable;

    /// @notice Emergency cancel a bridge after extended period (7 days)
    /// @param bridgeId The bridge identifier
    function emergencyCancelBridge(bytes32 bridgeId) external payable;

    /// @notice Quote the fee for bridging
    /// @param token The position token address
    /// @param amount Amount to bridge
    /// @return fee The messaging fee
    function quoteBridge(
        address token,
        uint256 amount
    ) external view returns (MessagingFee memory fee);

    /// @notice Quote the fee for retrying a bridge
    /// @param bridgeId The bridge identifier
    /// @return fee The messaging fee
    function quoteRetryBridge(bytes32 bridgeId) external view returns (MessagingFee memory fee);

    /// @notice Quote the fee for emergency cancel
    /// @return fee The messaging fee
    function quoteEmergencyCancelBridge() external view returns (MessagingFee memory fee);

    // ============ View Functions ============

    /// @notice Get pending bridge details
    /// @param bridgeId The bridge identifier
    /// @return The pending bridge record
    function getPendingBridge(bytes32 bridgeId) external view returns (PendingBridge memory);

    /// @notice Get all pending bridge IDs for a sender
    /// @param sender The sender address
    /// @return bridgeIds Array of pending bridge IDs
    function getPendingBridges(address sender) external view returns (bytes32[] memory bridgeIds);

    /// @notice Get escrowed balance for a token
    /// @param token The position token address
    /// @return The escrowed amount
    function getEscrowedBalance(address token) external view returns (uint256);

    /// @notice Get bridge configuration
    /// @return The bridge config
    function getBridgeConfig() external view returns (BridgeConfig memory);

    /// @notice Get the minimum retry delay
    /// @return The minimum delay between retries in seconds
    function getMinRetryDelay() external view returns (uint64);

    /// @notice Get the emergency cancel delay
    /// @return The delay before emergency cancel is allowed in seconds
    function getEmergencyCancelDelay() external view returns (uint64);

    /// @notice Check if a bridge back has been processed (for idempotency)
    /// @param bridgeId The bridge identifier
    /// @return True if the bridge back was already processed
    function isBridgeBackProcessed(bytes32 bridgeId) external view returns (bool);

    // ============ Ownership Management ============

    /// @notice Check if configuration is complete for safe ownership renouncement
    /// @return True if bridge config and LZ peer are set
    function isConfigComplete() external view returns (bool);

    /// @notice Renounce ownership after verifying config is complete
    /// @dev Reverts if config is incomplete
    function renounceOwnershipSafe() external;
}
