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
        uint64 expiry;
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
        uint64 expiry
    );

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

    /// @notice Bridge not yet expired
    error BridgeNotExpired(bytes32 bridgeId, uint64 expiry, uint64 currentTime);

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

    /// @notice Cancel an expired bridge and recover tokens
    /// @param bridgeId The bridge identifier
    function cancelBridge(bytes32 bridgeId) external payable;

    /// @notice Quote the fee for bridging
    /// @param token The position token address
    /// @param amount Amount to bridge
    /// @return fee The messaging fee
    function quoteBridge(
        address token,
        uint256 amount
    ) external view returns (MessagingFee memory fee);

    /// @notice Quote the fee for cancelling a bridge
    /// @return fee The messaging fee
    function quoteCancelBridge() external view returns (MessagingFee memory fee);

    // ============ View Functions ============

    /// @notice Get pending bridge details
    /// @param bridgeId The bridge identifier
    /// @return The pending bridge record
    function getPendingBridge(bytes32 bridgeId) external view returns (PendingBridge memory);

    /// @notice Get escrowed balance for a token
    /// @param token The position token address
    /// @return The escrowed amount
    function getEscrowedBalance(address token) external view returns (uint256);

    /// @notice Get bridge configuration
    /// @return The bridge config
    function getBridgeConfig() external view returns (BridgeConfig memory);

    /// @notice Get the bridge expiry duration
    /// @return The expiry duration in seconds
    function getExpiryDuration() external view returns (uint64);
}
