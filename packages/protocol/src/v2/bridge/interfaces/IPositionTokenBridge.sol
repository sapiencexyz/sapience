// SPDX-License-Identifier: MIT
pragma solidity ^0.8.19;

import {MessagingFee} from "@layerzerolabs/oapp-evm/contracts/oapp/OApp.sol";

/// @title IPositionTokenBridge
/// @notice Interface for position token bridge on Ethereal (source chain)
interface IPositionTokenBridge {
    // ============ Structs ============

    /// @notice Token metadata for bridge message
    struct TokenMetadata {
        bytes32 predictionId;
        bool isPredictorToken;
        string name;
        string symbol;
    }

    /// @notice Bridge configuration
    struct BridgeConfig {
        uint32 remoteEid;
        address remoteBridge;
    }

    // ============ Events ============

    /// @notice Emitted when tokens are bridged to remote chain
    event TokensBridged(
        address indexed token,
        address indexed sender,
        address indexed recipient,
        uint256 amount,
        bytes32 guid
    );

    /// @notice Emitted when tokens are released from escrow
    event TokensReleased(
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

    /// @notice Token not registered
    error TokenNotRegistered(address token);

    /// @notice Invalid source chain
    error InvalidSourceChain(uint32 expected, uint32 actual);

    /// @notice Invalid sender
    error InvalidSender(address expected, address actual);

    /// @notice Invalid command type
    error InvalidCommandType(uint16 commandType);

    /// @notice Insufficient escrowed balance
    error InsufficientEscrowBalance(uint256 requested, uint256 available);

    /// @notice ETH transfer failed
    error ETHTransferFailed();

    // ============ Bridge Functions ============

    /// @notice Bridge tokens to remote chain
    /// @param token The position token address
    /// @param recipient Recipient on remote chain
    /// @param amount Amount to bridge
    function bridge(
        address token,
        address recipient,
        uint256 amount
    ) external payable;

    /// @notice Quote the fee for bridging
    /// @param token The position token address
    /// @param recipient Recipient on remote chain
    /// @param amount Amount to bridge
    /// @return fee The messaging fee
    function quoteBridge(
        address token,
        address recipient,
        uint256 amount
    ) external view returns (MessagingFee memory fee);

    /// @notice Register a position token for bridging
    /// @param token The position token address
    /// @param metadata Token metadata for deployment on remote chain
    function registerToken(
        address token,
        TokenMetadata calldata metadata
    ) external;

    // ============ View Functions ============

    /// @notice Get escrowed balance for a token
    /// @param token The position token address
    /// @return The escrowed amount
    function getEscrowedBalance(address token) external view returns (uint256);

    /// @notice Check if a token is registered
    /// @param token The position token address
    /// @return True if registered
    function isTokenRegistered(address token) external view returns (bool);

    /// @notice Get token metadata
    /// @param token The position token address
    /// @return The token metadata
    function getTokenMetadata(address token) external view returns (TokenMetadata memory);

    /// @notice Get bridge configuration
    /// @return The bridge config
    function getBridgeConfig() external view returns (BridgeConfig memory);
}
