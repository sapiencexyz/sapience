// SPDX-License-Identifier: MIT
pragma solidity ^0.8.19;

import {MessagingFee} from "@layerzerolabs/oapp-evm/contracts/oapp/OApp.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {IERC20Metadata} from "@openzeppelin/contracts/token/ERC20/extensions/IERC20Metadata.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import {OptionsBuilder} from "@layerzerolabs/oapp-evm/contracts/oapp/libs/OptionsBuilder.sol";
import "./PositionTokenBridgeBase.sol";
import "./interfaces/IPositionTokenBridge.sol";
import "../interfaces/IPositionToken.sol";

/// @title PositionTokenBridge
/// @notice Bridge for position tokens on Ethereal (source chain)
/// @dev Extends PositionTokenBridgeBase with Ethereal-specific logic
contract PositionTokenBridge is PositionTokenBridgeBase, IPositionTokenBridge {
    using SafeERC20 for IERC20;
    using OptionsBuilder for bytes;

    // ============ Constants ============
    uint128 private constant GAS_FOR_BRIDGE = 2_000_000;

    // ============ Constructor ============
    constructor(address endpoint_, address owner_) PositionTokenBridgeBase(endpoint_, owner_) {}

    // ============ Bridge Function ============

    /// @inheritdoc IPositionTokenBridge
    function bridge(address token, address recipient, uint256 amount, bytes32 refCode)
        external
        payable
        nonReentrant
        returns (bytes32 bridgeId)
    {
        if (token == address(0) || recipient == address(0)) revert ZeroAddress();
        if (amount == 0) revert ZeroAmount();

        // Validate token has required interface (must be a PositionToken)
        try IPositionToken(token).pickConfigId() returns (bytes32) {}
            catch {
            revert InvalidToken(token);
        }

        try IPositionToken(token).isPredictorToken() returns (bool) {}
            catch {
            revert InvalidToken(token);
        }

        // Transfer tokens to this contract (escrow)
        IERC20(token).safeTransferFrom(msg.sender, address(this), amount);
        _escrowedBalances[token] += amount;

        // Generate unique bridge ID
        bridgeId = _generateBridgeId();

        // Create pending bridge record
        uint64 createdAt = uint64(block.timestamp);
        _pendingBridges[bridgeId] = PendingBridge({
            token: token,
            sender: msg.sender,
            recipient: recipient,
            amount: amount,
            createdAt: createdAt,
            lastRetryAt: createdAt,
            status: BridgeStatus.PENDING
        });

        // Track sender's bridges
        _senderBridges[msg.sender].push(bridgeId);

        // Build and send LZ message in scoped block to reduce stack depth
        {
            // Encode message with token metadata
            bytes memory payload = abi.encode(
                bridgeId,
                token,
                IPositionToken(token).pickConfigId(),
                IPositionToken(token).isPredictorToken(),
                IERC20Metadata(token).name(),
                IERC20Metadata(token).symbol(),
                recipient,
                amount
            );
            bytes memory message = abi.encode(CMD_BRIDGE, payload);

            // Build options
            bytes memory options = OptionsBuilder.newOptions().addExecutorLzReceiveOption(GAS_FOR_BRIDGE, 0);

            // Quote fee
            MessagingFee memory fee = _quote(_bridgeConfig.remoteEid, message, options, false);
            if (msg.value < fee.nativeFee) {
                revert InsufficientFee(fee.nativeFee, msg.value);
            }

            // Send message
            _lzSend(_bridgeConfig.remoteEid, message, options, fee, payable(msg.sender));

            // Refund excess ETH
            _refundExcess(fee.nativeFee);
        }

        emit BridgeInitiated(bridgeId, token, msg.sender, recipient, amount, createdAt, refCode);
    }

    // ============ Quote Functions ============

    /// @inheritdoc IPositionTokenBridge
    function quoteBridge(address token, uint256 amount) external view returns (MessagingFee memory fee) {
        // Read actual token metadata for accurate quote
        string memory name = IERC20Metadata(token).name();
        string memory symbol = IERC20Metadata(token).symbol();

        // Build message with actual metadata for accurate fee calculation
        bytes memory payload = abi.encode(
            bytes32(0), // bridgeId placeholder
            token,
            bytes32(0), // pickConfigId placeholder
            false, // isPredictorToken placeholder
            name,
            symbol,
            address(0), // recipient placeholder
            amount
        );
        bytes memory message = abi.encode(CMD_BRIDGE, payload);
        bytes memory options = OptionsBuilder.newOptions().addExecutorLzReceiveOption(GAS_FOR_BRIDGE, 0);
        return _quote(_bridgeConfig.remoteEid, message, options, false);
    }

    /// @inheritdoc IPositionTokenBridgeBase
    function quoteRetry(bytes32 bridgeId) external view returns (MessagingFee memory fee) {
        PendingBridge storage pending = _pendingBridges[bridgeId];

        // Re-read token metadata for accurate quote
        string memory name = IERC20Metadata(pending.token).name();
        string memory symbol = IERC20Metadata(pending.token).symbol();

        bytes memory payload = abi.encode(
            bridgeId,
            pending.token,
            bytes32(0), // pickConfigId placeholder
            false, // isPredictorToken placeholder
            name,
            symbol,
            pending.recipient,
            pending.amount
        );
        bytes memory message = abi.encode(CMD_BRIDGE, payload);
        bytes memory options = OptionsBuilder.newOptions().addExecutorLzReceiveOption(GAS_FOR_BRIDGE, 0);
        return _quote(_bridgeConfig.remoteEid, message, options, false);
    }

    // ============ Abstract Implementation ============

    /// @dev Build retry message for Ethereal -> Remote bridge
    function _buildRetryMessage(bytes32 bridgeId, PendingBridge storage pending)
        internal
        view
        override
        returns (bytes memory message, uint128 gasLimit)
    {
        // Re-read token metadata
        bytes32 pickConfigId = IPositionToken(pending.token).pickConfigId();
        bool isPredictorToken = IPositionToken(pending.token).isPredictorToken();
        string memory name = IERC20Metadata(pending.token).name();
        string memory symbol = IERC20Metadata(pending.token).symbol();

        // Encode same message as original bridge
        bytes memory payload = abi.encode(
            bridgeId, pending.token, pickConfigId, isPredictorToken, name, symbol, pending.recipient, pending.amount
        );
        message = abi.encode(CMD_BRIDGE, payload);
        gasLimit = GAS_FOR_BRIDGE;
    }

    /// @dev Handle incoming bridge from remote (release escrowed tokens)
    function _handleBridge(bytes memory data) internal override {
        (bytes32 bridgeId, address token, address recipient, uint256 amount) =
            abi.decode(data, (bytes32, address, address, uint256));

        // Check if this bridge was already processed (idempotency)
        if (_processedBridges[bridgeId]) {
            // Already processed - just re-send ACK
            emit BridgeProcessed(bridgeId, true);
            _trySendAck(bridgeId);
            return;
        }

        // Mark as processed BEFORE releasing (prevents reentrancy issues)
        _processedBridges[bridgeId] = true;

        if (_escrowedBalances[token] < amount) {
            revert InsufficientEscrowBalance(amount, _escrowedBalances[token]);
        }

        // Release tokens
        _escrowedBalances[token] -= amount;
        IERC20(token).safeTransfer(recipient, amount);

        emit BridgeProcessed(bridgeId, false);
        emit TokensReleased(bridgeId, token, recipient, amount);

        // Send ACK back to remote (if contract has sufficient balance)
        _trySendAck(bridgeId);
    }

    /// @dev Handle ACK from remote (mark outgoing bridge as completed)
    function _handleAck(bytes memory data) internal override {
        bytes32 bridgeId = abi.decode(data, (bytes32));
        PendingBridge storage pending = _pendingBridges[bridgeId];

        if (pending.status == BridgeStatus.PENDING) {
            pending.status = BridgeStatus.COMPLETED;
            emit BridgeCompleted(bridgeId);
        }
    }
}
