// SPDX-License-Identifier: MIT
pragma solidity ^0.8.19;

import { MessagingFee } from "@layerzerolabs/oapp-evm/contracts/oapp/OApp.sol";
import "./IPredictionMarketBridgeBase.sol";

/// @title IPredictionMarketBridgeRemote
/// @notice Interface for position token bridge on Arbitrum (remote chain)
/// @dev Extends base interface with Arbitrum-specific functionality
interface IPredictionMarketBridgeRemote is IPredictionMarketBridgeBase {
    // ============ Structs ============

    /// @notice Minted bridge record (for audit trail)
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

    /// @notice Emitted when factory is updated
    event FactoryUpdated(address factory);

    // ============ Errors ============

    /// @notice Token is not a valid factory-deployed position token
    error InvalidToken(address token);

    // ============ Bridge Functions ============

    /// @notice Bridge tokens back to source chain
    /// @param token The bridged position token address
    /// @param recipient Recipient on source chain
    /// @param amount Amount to bridge
    /// @param refCode Referral code for tracking
    /// @return bridgeId The unique bridge identifier
    function bridge(
        address token,
        address recipient,
        uint256 amount,
        bytes32 refCode
    ) external payable returns (bytes32 bridgeId);

    /// @notice Quote the fee for bridging
    /// @param token The bridged position token address
    /// @param amount Amount to bridge
    /// @return fee The messaging fee
    function quoteBridge(address token, uint256 amount)
        external
        view
        returns (MessagingFee memory fee);

    // ============ View Functions ============

    /// @notice Get the factory address
    /// @return The factory address
    function getFactory() external view returns (address);

    /// @notice Check if token exists at predicted address
    /// @param pickConfigId The pick configuration ID
    /// @param isPredictorToken True if predictor token
    /// @return True if token is deployed
    function isTokenDeployed(bytes32 pickConfigId, bool isPredictorToken)
        external
        view
        returns (bool);

    /// @notice Get token address for a pick configuration
    /// @param pickConfigId The pick configuration ID
    /// @param isPredictorToken True if predictor token
    /// @return The token address (may not be deployed)
    function getTokenAddress(bytes32 pickConfigId, bool isPredictorToken)
        external
        view
        returns (address);

    /// @notice Get minted bridge info (for audit trail)
    /// @param bridgeId The bridge identifier
    /// @return The minted bridge record
    function getMintedBridge(bytes32 bridgeId)
        external
        view
        returns (MintedBridge memory);
}
