// SPDX-License-Identifier: MIT
pragma solidity ^0.8.19;

import {MessagingFee} from "@layerzerolabs/oapp-evm/contracts/oapp/OApp.sol";
import "./IPositionTokenBridgeBase.sol";

/// @title IPositionTokenBridge
/// @notice Interface for position token bridge on Ethereal (source chain)
/// @dev Extends base interface with Ethereal-specific functionality
interface IPositionTokenBridge is IPositionTokenBridgeBase {
    // ============ Events ============

    /// @notice Emitted when tokens are released from escrow (incoming bridge completed)
    event TokensReleased(
        bytes32 indexed bridgeId,
        address indexed token,
        address indexed recipient,
        uint256 amount
    );

    // ============ Errors ============

    /// @notice Token does not implement IPositionToken
    error InvalidToken(address token);

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

    /// @notice Quote the fee for bridging
    /// @param token The position token address
    /// @param amount Amount to bridge
    /// @return fee The messaging fee
    function quoteBridge(
        address token,
        uint256 amount
    ) external view returns (MessagingFee memory fee);
}
