// SPDX-License-Identifier: MIT
pragma solidity ^0.8.19;

import {MessagingFee} from "@layerzerolabs/oapp-evm/contracts/oapp/OApp.sol";

/// @title IPositionTokenBridgeRemote
/// @notice Interface for position token bridge on Arbitrum (remote chain)
interface IPositionTokenBridgeRemote {
    // ============ Structs ============

    /// @notice Bridge configuration
    struct BridgeConfig {
        uint32 remoteEid;
        address remoteBridge;
    }

    // ============ Events ============

    /// @notice Emitted when tokens are minted on remote chain
    event TokensMinted(
        address indexed token,
        address indexed recipient,
        uint256 amount,
        bool isNewDeployment
    );

    /// @notice Emitted when tokens are bridged back to source chain
    event TokensBridgedBack(
        address indexed token,
        address indexed sender,
        address indexed recipient,
        uint256 amount,
        bytes32 guid
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

    // ============ Bridge Functions ============

    /// @notice Bridge tokens back to source chain
    /// @param token The bridged position token address
    /// @param recipient Recipient on source chain
    /// @param amount Amount to bridge back
    function bridgeBack(
        address token,
        address recipient,
        uint256 amount
    ) external payable;

    /// @notice Quote the fee for bridging back
    /// @param token The bridged position token address
    /// @param recipient Recipient on source chain
    /// @param amount Amount to bridge back
    /// @return fee The messaging fee
    function quoteBridgeBack(
        address token,
        address recipient,
        uint256 amount
    ) external view returns (MessagingFee memory fee);

    // ============ View Functions ============

    /// @notice Get bridge configuration
    /// @return The bridge config
    function getBridgeConfig() external view returns (BridgeConfig memory);

    /// @notice Get the factory address
    /// @return The factory address
    function getFactory() external view returns (address);

    /// @notice Check if token exists at predicted address
    /// @param predictionId The prediction ID
    /// @param isPredictorToken True if predictor token
    /// @return True if token is deployed
    function isTokenDeployed(
        bytes32 predictionId,
        bool isPredictorToken
    ) external view returns (bool);

    /// @notice Get token address for a prediction
    /// @param predictionId The prediction ID
    /// @param isPredictorToken True if predictor token
    /// @return The token address (may not be deployed)
    function getTokenAddress(
        bytes32 predictionId,
        bool isPredictorToken
    ) external view returns (address);
}
