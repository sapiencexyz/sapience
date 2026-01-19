// SPDX-License-Identifier: MIT
pragma solidity ^0.8.19;

import {MessagingFee} from "@layerzerolabs/oapp-evm/contracts/oapp/OApp.sol";

/// @title IPositionTokenBridgeRemote
/// @notice Interface for position token bridge on Arbitrum (remote chain)
/// @dev Permissionless bridge with two-phase commit (ACK) for safety
interface IPositionTokenBridgeRemote {
    // ============ Enums ============

    /// @notice Bridge status
    enum BridgeStatus {
        NONE,
        PENDING,
        COMPLETED,
        CANCELLED
    }

    // ============ Structs ============

    /// @notice Bridge configuration
    struct BridgeConfig {
        uint32 remoteEid;
        address remoteBridge;
    }

    /// @notice Pending bridge back record
    struct PendingBridgeBack {
        address token;
        address sourceToken;
        address sender;
        address recipient;
        uint256 amount;
        uint64 createdAt;
        uint64 lastRetryAt;
        BridgeStatus status;
    }

    /// @notice Minted bridge record (for cancel recovery)
    struct MintedBridge {
        address token;
        address recipient;
        uint256 amount;
    }

    // ============ Events ============

    /// @notice Emitted when tokens are minted on remote chain
    event TokensMinted(
        bytes32 indexed bridgeId,
        address indexed token,
        address indexed recipient,
        uint256 amount,
        bool isNewDeployment
    );

    /// @notice Emitted when bridge back is initiated
    event BridgeBackInitiated(
        bytes32 indexed bridgeId,
        address indexed token,
        address indexed sender,
        address recipient,
        uint256 amount,
        uint64 createdAt
    );

    /// @notice Emitted when bridge back is retried
    event BridgeBackRetried(bytes32 indexed bridgeId, uint256 retryCount);

    /// @notice Emitted when a bridge is processed (for idempotency tracking)
    event BridgeProcessed(bytes32 indexed bridgeId, bool alreadyProcessed);

    /// @notice Emitted when bridge back is completed (ACK received)
    event BridgeBackCompleted(bytes32 indexed bridgeId);

    /// @notice Emitted when bridge back is cancelled (expired)
    event BridgeBackCancelled(bytes32 indexed bridgeId, address indexed sender, uint256 amount);

    /// @notice Emitted when cancel notification received from Ethereal (no tokens to burn)
    event CancelReceived(bytes32 indexed bridgeId, uint256 amount);

    /// @notice Emitted when cancel burns minted tokens from recipient
    event CancelBurnExecuted(
        bytes32 indexed bridgeId,
        address indexed token,
        address indexed recipient,
        uint256 amount
    );

    /// @notice Emitted when cancel amount doesn't match minted amount (sanity check warning)
    event CancelAmountMismatch(bytes32 indexed bridgeId, uint256 mintedAmount, uint256 cancelAmount);

    /// @notice Emitted when cancel burn fails (recipient transferred tokens)
    /// @dev Tokens are now unbacked - requires governance intervention
    event CancelBurnFailed(
        bytes32 indexed bridgeId,
        address indexed token,
        address indexed recipient,
        uint256 amount
    );

    /// @notice Emitted when bridge config is updated
    event BridgeConfigUpdated(BridgeConfig config);

    /// @notice Emitted when factory is updated
    event FactoryUpdated(address factory);

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

    /// @notice Token not found
    error TokenNotFound(address token);

    /// @notice ETH transfer failed
    error ETHTransferFailed();

    /// @notice Refund failed
    error RefundFailed();

    /// @notice Token deployment failed
    error TokenDeploymentFailed();

    /// @notice Bridge not found or wrong status
    error InvalidBridgeStatus(bytes32 bridgeId, BridgeStatus expected, BridgeStatus actual);

    /// @notice Bridge not yet expired for emergency cancel
    error BridgeNotExpiredForEmergencyCancel(bytes32 bridgeId, uint64 createdAt, uint64 currentTime);

    /// @notice Retry too soon
    error RetryTooSoon(bytes32 bridgeId, uint64 lastRetryAt, uint64 minNextRetry);

    /// @notice Not the bridge sender
    error NotBridgeSender(bytes32 bridgeId, address expected, address actual);

    /// @notice Insufficient escrowed balance
    error InsufficientEscrowBalance(uint256 requested, uint256 available);

    // ============ Bridge Functions ============

    /// @notice Bridge tokens back to source chain
    /// @param token The bridged position token address
    /// @param recipient Recipient on source chain
    /// @param amount Amount to bridge back
    /// @return bridgeId The unique bridge identifier
    function bridgeBack(
        address token,
        address recipient,
        uint256 amount
    ) external payable returns (bytes32 bridgeId);

    /// @notice Retry a pending bridge back (resend the message)
    /// @param bridgeId The bridge identifier
    function retryBridgeBack(bytes32 bridgeId) external payable;

    /// @notice Emergency cancel a bridge back after extended period (7 days)
    /// @param bridgeId The bridge identifier
    function emergencyCancelBridgeBack(bytes32 bridgeId) external payable;

    /// @notice Quote the fee for bridging back
    /// @param token The bridged position token address
    /// @param amount Amount to bridge back
    /// @return fee The messaging fee
    function quoteBridgeBack(
        address token,
        uint256 amount
    ) external view returns (MessagingFee memory fee);

    /// @notice Quote the fee for retrying a bridge back
    /// @param bridgeId The bridge identifier
    /// @return fee The messaging fee
    function quoteRetryBridgeBack(bytes32 bridgeId) external view returns (MessagingFee memory fee);

    /// @notice Quote the fee for emergency cancel
    /// @return fee The messaging fee
    function quoteEmergencyCancelBridgeBack() external view returns (MessagingFee memory fee);

    // ============ View Functions ============

    /// @notice Get pending bridge back details
    /// @param bridgeId The bridge identifier
    /// @return The pending bridge back record
    function getPendingBridgeBack(bytes32 bridgeId) external view returns (PendingBridgeBack memory);

    /// @notice Get all pending bridge back IDs for a sender
    /// @param sender The sender address
    /// @return bridgeIds Array of pending bridge back IDs
    function getPendingBridgeBacks(address sender) external view returns (bytes32[] memory bridgeIds);

    /// @notice Check if a bridge has been processed (for idempotency)
    /// @param bridgeId The bridge identifier
    /// @return True if the bridge was already processed
    function isBridgeProcessed(bytes32 bridgeId) external view returns (bool);

    /// @notice Get bridge configuration
    /// @return The bridge config
    function getBridgeConfig() external view returns (BridgeConfig memory);

    /// @notice Get the factory address
    /// @return The factory address
    function getFactory() external view returns (address);

    /// @notice Check if token exists at predicted address
    /// @param pickConfigId The pick configuration ID
    /// @param isPredictorToken True if predictor token
    /// @return True if token is deployed
    function isTokenDeployed(
        bytes32 pickConfigId,
        bool isPredictorToken
    ) external view returns (bool);

    /// @notice Get token address for a pick configuration
    /// @param pickConfigId The pick configuration ID
    /// @param isPredictorToken True if predictor token
    /// @return The token address (may not be deployed)
    function getTokenAddress(
        bytes32 pickConfigId,
        bool isPredictorToken
    ) external view returns (address);

    /// @notice Get the minimum retry delay
    /// @return The minimum delay between retries in seconds
    function getMinRetryDelay() external view returns (uint64);

    /// @notice Get the emergency cancel delay
    /// @return The delay before emergency cancel is allowed in seconds
    function getEmergencyCancelDelay() external view returns (uint64);

    /// @notice Get escrowed balance for a token (pending bridge backs)
    /// @param token The bridged token address
    /// @return The escrowed amount
    function getEscrowedBalance(address token) external view returns (uint256);

    /// @notice Get minted bridge info (for cancel recovery tracking)
    /// @param bridgeId The bridge identifier
    /// @return The minted bridge record
    function getMintedBridge(bytes32 bridgeId) external view returns (MintedBridge memory);

    // ============ Ownership Management ============

    /// @notice Check if configuration is complete for safe ownership renouncement
    /// @return True if bridge config and LZ peer are set
    function isConfigComplete() external view returns (bool);

    /// @notice Renounce ownership after verifying config is complete
    /// @dev Reverts if config is incomplete
    function renounceOwnershipSafe() external;
}
