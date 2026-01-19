// SPDX-License-Identifier: MIT
pragma solidity ^0.8.19;

import {OApp, Origin, MessagingFee, MessagingReceipt} from "@layerzerolabs/oapp-evm/contracts/oapp/OApp.sol";
import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";
import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {IERC20Metadata} from "@openzeppelin/contracts/token/ERC20/extensions/IERC20Metadata.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import {OptionsBuilder} from "@layerzerolabs/oapp-evm/contracts/oapp/libs/OptionsBuilder.sol";
import "./interfaces/IPositionTokenBridge.sol";
import "../interfaces/IPositionToken.sol";

/// @title PositionTokenBridge
/// @notice Bridge for position tokens on Ethereal (source chain)
/// @dev Permissionless bridge with two-phase commit (ACK) for safety
contract PositionTokenBridge is OApp, ReentrancyGuard, IPositionTokenBridge {
    using SafeERC20 for IERC20;
    using OptionsBuilder for bytes;

    // ============ Constants ============
    uint16 private constant CMD_BRIDGE_TO_REMOTE = 1;
    uint16 private constant CMD_BRIDGE_BACK = 2;
    uint16 private constant CMD_ACK = 3;
    uint16 private constant CMD_CANCEL = 4;

    uint128 private constant GAS_FOR_BRIDGE = 2_000_000;
    uint128 private constant GAS_FOR_ACK = 100_000;
    uint128 private constant GAS_FOR_CANCEL = 200_000;

    /// @notice Minimum delay between retry attempts
    uint64 public constant MIN_RETRY_DELAY = 5 minutes;

    /// @notice Delay before emergency cancel is allowed
    uint64 public constant EMERGENCY_CANCEL_DELAY = 7 days;

    // ============ Storage ============
    BridgeConfig private _bridgeConfig;

    /// @notice Pending bridge records
    mapping(bytes32 => PendingBridge) private _pendingBridges;

    /// @notice Escrowed token balances
    mapping(address => uint256) private _escrowedBalances;

    /// @notice Nonce for generating unique bridge IDs
    uint256 private _bridgeNonce;

    /// @notice Mapping from sender to their bridge IDs
    mapping(address => bytes32[]) private _senderBridges;

    /// @notice Processed bridge backs for idempotency (prevents duplicate escrow release)
    mapping(bytes32 => bool) private _processedBridgeBacks;

    // ============ Constructor ============
    constructor(
        address endpoint_,
        address owner_
    ) OApp(endpoint_, owner_) Ownable(owner_) {}

    // ============ Configuration (Owner only for LZ) ============

    /// @notice Set the bridge configuration
    function setBridgeConfig(BridgeConfig calldata config) external onlyOwner {
        _bridgeConfig = config;
        emit BridgeConfigUpdated(config);
    }

    /// @inheritdoc IPositionTokenBridge
    function getBridgeConfig() external view returns (BridgeConfig memory) {
        return _bridgeConfig;
    }

    // ============ Bridge Functions ============

    /// @inheritdoc IPositionTokenBridge
    function bridge(
        address token,
        address recipient,
        uint256 amount
    ) external payable nonReentrant returns (bytes32 bridgeId) {
        if (token == address(0) || recipient == address(0)) revert ZeroAddress();
        if (amount == 0) revert ZeroAmount();

        // Read token metadata directly from the token contract
        bytes32 pickConfigId;
        bool isPredictorToken;
        string memory name;
        string memory symbol;

        try IPositionToken(token).pickConfigId() returns (bytes32 pid) {
            pickConfigId = pid;
        } catch {
            revert InvalidToken(token);
        }

        try IPositionToken(token).isPredictorToken() returns (bool ipt) {
            isPredictorToken = ipt;
        } catch {
            revert InvalidToken(token);
        }

        name = IERC20Metadata(token).name();
        symbol = IERC20Metadata(token).symbol();

        // Transfer tokens to this contract (escrow)
        IERC20(token).safeTransferFrom(msg.sender, address(this), amount);
        _escrowedBalances[token] += amount;

        // Generate unique bridge ID
        bridgeId = keccak256(abi.encode(block.chainid, address(this), ++_bridgeNonce));

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

        // Encode message
        bytes memory payload = abi.encode(
            bridgeId,
            token,
            pickConfigId,
            isPredictorToken,
            name,
            symbol,
            recipient,
            amount
        );
        bytes memory message = abi.encode(CMD_BRIDGE_TO_REMOTE, payload);

        // Build options
        bytes memory options = OptionsBuilder.newOptions().addExecutorLzReceiveOption(GAS_FOR_BRIDGE, 0);

        // Quote fee
        MessagingFee memory fee = _quote(_bridgeConfig.remoteEid, message, options, false);
        if (msg.value < fee.nativeFee) {
            revert InsufficientFee(fee.nativeFee, msg.value);
        }

        // Send message
        _lzSend(
            _bridgeConfig.remoteEid,
            message,
            options,
            fee,
            payable(msg.sender)
        );

        // Refund excess ETH
        if (msg.value > fee.nativeFee) {
            uint256 excess = msg.value - fee.nativeFee;
            (bool success,) = payable(msg.sender).call{value: excess}("");
            if (!success) revert RefundFailed();
        }

        emit BridgeInitiated(bridgeId, token, msg.sender, recipient, amount, createdAt);
    }

    /// @inheritdoc IPositionTokenBridge
    function retryBridge(bytes32 bridgeId) external payable nonReentrant {
        PendingBridge storage pending = _pendingBridges[bridgeId];

        if (pending.status != BridgeStatus.PENDING) {
            revert InvalidBridgeStatus(bridgeId, BridgeStatus.PENDING, pending.status);
        }

        // Check retry delay
        uint64 minNextRetry = pending.lastRetryAt + MIN_RETRY_DELAY;
        if (block.timestamp < minNextRetry) {
            revert RetryTooSoon(bridgeId, pending.lastRetryAt, minNextRetry);
        }

        // Update last retry timestamp
        pending.lastRetryAt = uint64(block.timestamp);

        // Re-read token metadata
        bytes32 pickConfigId = IPositionToken(pending.token).pickConfigId();
        bool isPredictorToken = IPositionToken(pending.token).isPredictorToken();
        string memory name = IERC20Metadata(pending.token).name();
        string memory symbol = IERC20Metadata(pending.token).symbol();

        // Encode same message as original bridge
        bytes memory payload = abi.encode(
            bridgeId,
            pending.token,
            pickConfigId,
            isPredictorToken,
            name,
            symbol,
            pending.recipient,
            pending.amount
        );
        bytes memory message = abi.encode(CMD_BRIDGE_TO_REMOTE, payload);

        // Build options
        bytes memory options = OptionsBuilder.newOptions().addExecutorLzReceiveOption(GAS_FOR_BRIDGE, 0);

        // Quote fee
        MessagingFee memory fee = _quote(_bridgeConfig.remoteEid, message, options, false);
        if (msg.value < fee.nativeFee) {
            revert InsufficientFee(fee.nativeFee, msg.value);
        }

        // Send message
        _lzSend(
            _bridgeConfig.remoteEid,
            message,
            options,
            fee,
            payable(msg.sender)
        );

        // Refund excess ETH
        if (msg.value > fee.nativeFee) {
            uint256 excess = msg.value - fee.nativeFee;
            (bool success,) = payable(msg.sender).call{value: excess}("");
            if (!success) revert RefundFailed();
        }

        // Count retries based on how many times lastRetryAt was updated
        emit BridgeRetried(bridgeId, 1);
    }

    /// @inheritdoc IPositionTokenBridge
    function emergencyCancelBridge(bytes32 bridgeId) external payable nonReentrant {
        PendingBridge storage pending = _pendingBridges[bridgeId];

        if (pending.status != BridgeStatus.PENDING) {
            revert InvalidBridgeStatus(bridgeId, BridgeStatus.PENDING, pending.status);
        }

        // Only the original sender can cancel
        if (pending.sender != msg.sender) {
            revert NotBridgeSender(bridgeId, pending.sender, msg.sender);
        }

        // Check emergency cancel delay (7 days from creation)
        uint64 emergencyCancelTime = pending.createdAt + EMERGENCY_CANCEL_DELAY;
        if (block.timestamp < emergencyCancelTime) {
            revert BridgeNotExpiredForEmergencyCancel(bridgeId, pending.createdAt, uint64(block.timestamp));
        }

        // Mark as cancelled
        pending.status = BridgeStatus.CANCELLED;

        // Return tokens to sender
        _escrowedBalances[pending.token] -= pending.amount;
        IERC20(pending.token).safeTransfer(pending.sender, pending.amount);

        // Send cancel notification to remote (to mark as cancelled if not processed)
        bytes memory payload = abi.encode(bridgeId, pending.amount);
        bytes memory message = abi.encode(CMD_CANCEL, payload);
        bytes memory options = OptionsBuilder.newOptions().addExecutorLzReceiveOption(GAS_FOR_CANCEL, 0);

        MessagingFee memory fee = _quote(_bridgeConfig.remoteEid, message, options, false);
        if (msg.value < fee.nativeFee) {
            revert InsufficientFee(fee.nativeFee, msg.value);
        }

        _lzSend(
            _bridgeConfig.remoteEid,
            message,
            options,
            fee,
            payable(msg.sender)
        );

        // Refund excess ETH
        if (msg.value > fee.nativeFee) {
            uint256 excess = msg.value - fee.nativeFee;
            (bool success,) = payable(msg.sender).call{value: excess}("");
            if (!success) revert RefundFailed();
        }

        emit BridgeCancelled(bridgeId, pending.sender, pending.amount);
    }

    /// @inheritdoc IPositionTokenBridge
    function quoteBridge(
        address token,
        uint256 amount
    ) external view returns (MessagingFee memory fee) {
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
        bytes memory message = abi.encode(CMD_BRIDGE_TO_REMOTE, payload);
        bytes memory options = OptionsBuilder.newOptions().addExecutorLzReceiveOption(GAS_FOR_BRIDGE, 0);
        return _quote(_bridgeConfig.remoteEid, message, options, false);
    }

    /// @inheritdoc IPositionTokenBridge
    function quoteRetryBridge(bytes32 bridgeId) external view returns (MessagingFee memory fee) {
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
        bytes memory message = abi.encode(CMD_BRIDGE_TO_REMOTE, payload);
        bytes memory options = OptionsBuilder.newOptions().addExecutorLzReceiveOption(GAS_FOR_BRIDGE, 0);
        return _quote(_bridgeConfig.remoteEid, message, options, false);
    }

    /// @inheritdoc IPositionTokenBridge
    function quoteEmergencyCancelBridge() external view returns (MessagingFee memory fee) {
        bytes memory payload = abi.encode(bytes32(0), uint256(0));
        bytes memory message = abi.encode(CMD_CANCEL, payload);
        bytes memory options = OptionsBuilder.newOptions().addExecutorLzReceiveOption(GAS_FOR_CANCEL, 0);
        return _quote(_bridgeConfig.remoteEid, message, options, false);
    }

    // ============ LayerZero Receive ============

    function _lzReceive(
        Origin calldata _origin,
        bytes32,
        bytes calldata _message,
        address,
        bytes calldata
    ) internal override nonReentrant {
        // Validate source
        if (_origin.srcEid != _bridgeConfig.remoteEid) {
            revert InvalidSourceChain(_bridgeConfig.remoteEid, _origin.srcEid);
        }
        address sender = address(uint160(uint256(_origin.sender)));
        if (sender != _bridgeConfig.remoteBridge) {
            revert InvalidSender(_bridgeConfig.remoteBridge, sender);
        }

        // Decode command
        (uint16 commandType, bytes memory data) = abi.decode(_message, (uint16, bytes));

        if (commandType == CMD_ACK) {
            _handleAck(data);
        } else if (commandType == CMD_BRIDGE_BACK) {
            _handleBridgeBack(data);
        } else {
            revert InvalidCommandType(commandType);
        }
    }

    function _handleAck(bytes memory data) internal {
        bytes32 bridgeId = abi.decode(data, (bytes32));
        PendingBridge storage pending = _pendingBridges[bridgeId];

        // Only update if still pending (could have been cancelled)
        if (pending.status == BridgeStatus.PENDING) {
            pending.status = BridgeStatus.COMPLETED;
            emit BridgeCompleted(bridgeId);
        }
    }

    function _handleBridgeBack(bytes memory data) internal {
        (
            bytes32 bridgeId,
            address token,
            address recipient,
            uint256 amount
        ) = abi.decode(data, (bytes32, address, address, uint256));

        // Check if this bridge back was already processed (idempotency)
        if (_processedBridgeBacks[bridgeId]) {
            // Already processed - just re-send ACK
            emit BridgeBackProcessed(bridgeId, true);
            _trySendAck(bridgeId);
            return;
        }

        // Mark as processed BEFORE releasing (prevents reentrancy issues)
        _processedBridgeBacks[bridgeId] = true;

        if (_escrowedBalances[token] < amount) {
            revert InsufficientEscrowBalance(amount, _escrowedBalances[token]);
        }

        // Release tokens
        _escrowedBalances[token] -= amount;
        IERC20(token).safeTransfer(recipient, amount);

        emit BridgeBackProcessed(bridgeId, false);
        emit TokensReleased(bridgeId, token, recipient, amount);

        // Send ACK back to remote (if contract has sufficient balance)
        _trySendAck(bridgeId);
    }

    /// @dev Attempt to send ACK - gracefully handles insufficient balance or send failures
    function _trySendAck(bytes32 bridgeId) internal {
        // Skip ACK if no balance (common in test environments)
        if (address(this).balance == 0) {
            return;
        }

        try this.sendAckInternal(bridgeId) {
            // ACK sent successfully
        } catch {
            // ACK failed - can be retried via manualSendAck
        }
    }

    /// @dev Internal function to send ACK (callable via this.sendAckInternal for try/catch)
    function sendAckInternal(bytes32 bridgeId) external {
        require(msg.sender == address(this), "Only self");

        bytes memory ackPayload = abi.encode(bridgeId);
        bytes memory ackMessage = abi.encode(CMD_ACK, ackPayload);
        bytes memory options = OptionsBuilder.newOptions().addExecutorLzReceiveOption(GAS_FOR_ACK, 0);

        MessagingFee memory fee = _quote(_bridgeConfig.remoteEid, ackMessage, options, false);

        // Check if contract has enough balance for ACK
        if (address(this).balance >= fee.nativeFee) {
            _lzSend(
                _bridgeConfig.remoteEid,
                ackMessage,
                options,
                fee,
                payable(address(this))
            );
        }
    }

    /// @notice Manually send ACK for a completed bridge back (if auto-ACK failed due to low balance)
    /// @param bridgeId The bridge identifier to acknowledge
    function manualSendAck(bytes32 bridgeId) external payable {
        bytes memory ackPayload = abi.encode(bridgeId);
        bytes memory ackMessage = abi.encode(CMD_ACK, ackPayload);
        bytes memory options = OptionsBuilder.newOptions().addExecutorLzReceiveOption(GAS_FOR_ACK, 0);

        MessagingFee memory fee = _quote(_bridgeConfig.remoteEid, ackMessage, options, false);
        if (msg.value < fee.nativeFee) {
            revert InsufficientFee(fee.nativeFee, msg.value);
        }

        _lzSend(
            _bridgeConfig.remoteEid,
            ackMessage,
            options,
            fee,
            payable(msg.sender)
        );

        // Refund excess ETH
        if (msg.value > fee.nativeFee) {
            uint256 excess = msg.value - fee.nativeFee;
            (bool success,) = payable(msg.sender).call{value: excess}("");
            if (!success) revert RefundFailed();
        }
    }

    // ============ View Functions ============

    /// @inheritdoc IPositionTokenBridge
    function getPendingBridge(bytes32 bridgeId) external view returns (PendingBridge memory) {
        return _pendingBridges[bridgeId];
    }

    /// @inheritdoc IPositionTokenBridge
    function getPendingBridges(address sender) external view returns (bytes32[] memory bridgeIds) {
        bytes32[] storage allBridges = _senderBridges[sender];
        uint256 pendingCount = 0;

        // Count pending bridges
        for (uint256 i = 0; i < allBridges.length; i++) {
            if (_pendingBridges[allBridges[i]].status == BridgeStatus.PENDING) {
                pendingCount++;
            }
        }

        // Create array of pending bridges
        bridgeIds = new bytes32[](pendingCount);
        uint256 j = 0;
        for (uint256 i = 0; i < allBridges.length; i++) {
            if (_pendingBridges[allBridges[i]].status == BridgeStatus.PENDING) {
                bridgeIds[j] = allBridges[i];
                j++;
            }
        }
    }

    /// @inheritdoc IPositionTokenBridge
    function getEscrowedBalance(address token) external view returns (uint256) {
        return _escrowedBalances[token];
    }

    /// @inheritdoc IPositionTokenBridge
    function getMinRetryDelay() external pure returns (uint64) {
        return MIN_RETRY_DELAY;
    }

    /// @inheritdoc IPositionTokenBridge
    function getEmergencyCancelDelay() external pure returns (uint64) {
        return EMERGENCY_CANCEL_DELAY;
    }

    /// @inheritdoc IPositionTokenBridge
    function isBridgeBackProcessed(bytes32 bridgeId) external view returns (bool) {
        return _processedBridgeBacks[bridgeId];
    }

    // ============ Ownership Management ============

    /// @inheritdoc IPositionTokenBridge
    function isConfigComplete() external view returns (bool) {
        // Check bridge config
        if (_bridgeConfig.remoteEid == 0) return false;
        if (_bridgeConfig.remoteBridge == address(0)) return false;

        // Check LZ peer is set
        bytes32 peer = peers[_bridgeConfig.remoteEid];
        if (peer == bytes32(0)) return false;

        return true;
    }

    /// @inheritdoc IPositionTokenBridge
    function renounceOwnershipSafe() external onlyOwner {
        require(this.isConfigComplete(), "Config incomplete");
        renounceOwnership();
    }

    // ============ ETH Management (for ACK fees) ============

    /// @notice Receive ETH for ACK fee payments
    receive() external payable {}

    /// @notice Get ETH balance
    function getETHBalance() external view returns (uint256) {
        return address(this).balance;
    }
}
