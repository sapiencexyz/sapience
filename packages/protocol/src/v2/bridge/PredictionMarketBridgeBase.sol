// SPDX-License-Identifier: MIT
pragma solidity ^0.8.19;

import {
    OApp,
    Origin,
    MessagingFee,
    MessagingReceipt
} from "@layerzerolabs/oapp-evm/contracts/oapp/OApp.sol";
import { Ownable } from "@openzeppelin/contracts/access/Ownable.sol";
import {
    ReentrancyGuard
} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import { IERC20 } from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {
    SafeERC20
} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import {
    OptionsBuilder
} from "@layerzerolabs/oapp-evm/contracts/oapp/libs/OptionsBuilder.sol";
import "./interfaces/IPredictionMarketBridgeBase.sol";

/// @title PredictionMarketBridgeBase
/// @notice Abstract base contract for position token bridges
/// @dev Contains shared logic for both Ethereal and Arbitrum bridges
abstract contract PredictionMarketBridgeBase is
    OApp,
    ReentrancyGuard,
    IPredictionMarketBridgeBase
{
    using SafeERC20 for IERC20;
    using OptionsBuilder for bytes;

    // ============ Constants ============
    uint16 internal constant CMD_BRIDGE = 1;
    uint16 internal constant CMD_ACK = 2;

    uint128 internal constant GAS_FOR_ACK = 100_000;

    /// @notice Buffer percentage for ACK fee (in basis points, 1500 = 15%)
    uint128 internal constant ACK_FEE_BUFFER_BPS = 1500;

    /// @notice Minimum delay between retry attempts
    uint64 public constant MIN_RETRY_DELAY = 1 hours;

    // ============ Storage ============
    BridgeConfig internal _bridgeConfig;

    /// @notice Pending bridge records
    mapping(bytes32 => PendingBridge) internal _pendingBridges;

    /// @notice Escrowed token balances
    mapping(address => uint256) internal _escrowedBalances;

    /// @notice Nonce for generating unique bridge IDs
    uint256 internal _bridgeNonce;

    /// @notice Mapping from sender to their bridge IDs
    mapping(address => bytes32[]) internal _senderBridges;

    /// @notice Processed bridges for idempotency
    mapping(bytes32 => bool) internal _processedBridges;

    // ============ Constructor ============
    constructor(address endpoint_, address owner_)
        OApp(endpoint_, owner_)
        Ownable(owner_)
    { }

    // ============ Configuration (Owner only for LZ) ============

    /// @notice Set the bridge configuration
    function setBridgeConfig(BridgeConfig calldata config) external onlyOwner {
        _bridgeConfig = config;
        emit BridgeConfigUpdated(config);
    }

    /// @inheritdoc IPredictionMarketBridgeBase
    function getBridgeConfig() external view returns (BridgeConfig memory) {
        return _bridgeConfig;
    }

    // ============ Retry Function ============

    /// @inheritdoc IPredictionMarketBridgeBase
    function retry(bytes32 bridgeId, bytes32 refCode)
        external
        payable
        nonReentrant
    {
        PendingBridge storage pending = _pendingBridges[bridgeId];

        if (pending.status != BridgeStatus.PENDING) {
            revert InvalidBridgeStatus(
                bridgeId, BridgeStatus.PENDING, pending.status
            );
        }

        // Check retry delay
        uint64 minNextRetry = pending.lastRetryAt + MIN_RETRY_DELAY;
        if (block.timestamp < minNextRetry) {
            revert RetryTooSoon(bridgeId, pending.lastRetryAt, minNextRetry);
        }

        // Update last retry timestamp
        pending.lastRetryAt = uint64(block.timestamp);

        // Build message (chain-specific)
        (bytes memory message, uint128 gasLimit) =
            _buildRetryMessage(bridgeId, pending);

        // Calculate ACK fee with buffer to prepay on remote chain
        uint128 ackFeeWithBuffer = _getAckFeeWithBuffer();

        // Build options - include ACK fee as value to send to remote
        bytes memory options = OptionsBuilder.newOptions()
            .addExecutorLzReceiveOption(gasLimit, ackFeeWithBuffer);

        // Quote fee
        MessagingFee memory fee =
            _quote(_bridgeConfig.remoteEid, message, options, false);
        if (msg.value < fee.nativeFee) {
            revert InsufficientFee(fee.nativeFee, msg.value);
        }

        // Send message
        _lzSend(
            _bridgeConfig.remoteEid, message, options, fee, payable(msg.sender)
        );

        // Refund excess ETH
        _refundExcess(fee.nativeFee);

        emit BridgeRetried(bridgeId, refCode);
    }

    // ============ ACK Handling ============

    /// @dev Attempt to send ACK using prepaid value (hybrid approach for cross-chain compatibility)
    /// @notice On Arbitrum, LayerZero delivers value as msg.value
    /// @notice On Ethereal, LayerZero delivers value separately to contract balance
    function _trySendAck(bytes32 bridgeId) internal {
        // Try msg.value first (Arbitrum), fallback to balance (Ethereal)
        uint256 availableFee = msg.value > 0 ? msg.value : address(this).balance;

        if (availableFee == 0) {
            emit AckSendFailed(bridgeId);
            return;
        }

        bytes memory ackPayload = abi.encode(bridgeId);
        bytes memory ackMessage = abi.encode(CMD_ACK, ackPayload);
        bytes memory options = OptionsBuilder.newOptions()
            .addExecutorLzReceiveOption(GAS_FOR_ACK, 0);

        // Quote the actual fee required
        MessagingFee memory fee =
            _quote(_bridgeConfig.remoteEid, ackMessage, options, false);

        // Check if we have enough
        if (availableFee < fee.nativeFee) {
            emit AckInsufficientBalance(bridgeId, fee.nativeFee, availableFee);
            return;
        }

        // Pass quoted fee to external call for try/catch pattern
        try this.sendAckWithFee{ value: fee.nativeFee }(
            ackMessage, options, fee
        ) {
            emit AckSent(bridgeId, fee.nativeFee);
        } catch {
            emit AckSendFailed(bridgeId);
        }
    }

    /// @dev Send ACK message (external for try/catch with value)
    function sendAckWithFee(
        bytes memory message,
        bytes memory options,
        MessagingFee memory fee
    ) external payable {
        require(msg.sender == address(this), "Only self");
        _lzSend(
            _bridgeConfig.remoteEid,
            message,
            options,
            fee,
            payable(address(this))
        );
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
        (uint16 commandType, bytes memory data) =
            abi.decode(_message, (uint16, bytes));

        if (commandType == CMD_BRIDGE) {
            _handleBridge(data);
        } else if (commandType == CMD_ACK) {
            _handleAck(data);
        } else {
            revert InvalidCommandType(commandType);
        }
    }

    // ============ View Functions ============

    /// @inheritdoc IPredictionMarketBridgeBase
    function getPendingBridge(bytes32 bridgeId)
        external
        view
        returns (PendingBridge memory)
    {
        return _pendingBridges[bridgeId];
    }

    /// @inheritdoc IPredictionMarketBridgeBase
    function getPendingBridges(address sender)
        external
        view
        returns (bytes32[] memory bridgeIds)
    {
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

    /// @inheritdoc IPredictionMarketBridgeBase
    function isBridgeProcessed(bytes32 bridgeId) external view returns (bool) {
        return _processedBridges[bridgeId];
    }

    /// @inheritdoc IPredictionMarketBridgeBase
    function getEscrowedBalance(address token) external view returns (uint256) {
        return _escrowedBalances[token];
    }

    /// @inheritdoc IPredictionMarketBridgeBase
    function getMinRetryDelay() external pure returns (uint64) {
        return MIN_RETRY_DELAY;
    }

    // ============ Ownership Management ============

    /// @inheritdoc IPredictionMarketBridgeBase
    function isConfigComplete() public view virtual returns (bool) {
        // Check bridge config
        if (_bridgeConfig.remoteEid == 0) return false;
        if (_bridgeConfig.remoteBridge == address(0)) return false;

        // Check LZ peer is set
        bytes32 peer = peers[_bridgeConfig.remoteEid];
        if (peer == bytes32(0)) return false;

        return true;
    }

    /// @inheritdoc IPredictionMarketBridgeBase
    function renounceOwnershipSafe() external onlyOwner {
        require(this.isConfigComplete(), "Config incomplete");
        renounceOwnership();
    }

    // ============ ETH Management (for ACK fees) ============

    /// @notice Receive ETH for ACK fee payments
    receive() external payable { }

    /// @notice Get ETH balance
    function getETHBalance() external view returns (uint256) {
        return address(this).balance;
    }

    /// @inheritdoc IPredictionMarketBridgeBase
    function withdrawETH(address payable to, uint256 amount)
        external
        onlyOwner
    {
        if (to == address(0)) revert ZeroAddress();

        uint256 balance = address(this).balance;
        uint256 withdrawAmount = amount == 0 ? balance : amount;

        if (withdrawAmount > balance) {
            revert InsufficientEscrowBalance(withdrawAmount, balance);
        }

        (bool success,) = to.call{ value: withdrawAmount }("");
        if (!success) revert ETHTransferFailed();

        emit ETHWithdrawn(to, withdrawAmount);
    }

    /// @dev Calculate ACK fee with buffer
    function _getAckFeeWithBuffer() internal view returns (uint128) {
        uint128 baseFee = _bridgeConfig.ackFeeEstimate;
        if (baseFee == 0) return 0;
        return baseFee + (baseFee * ACK_FEE_BUFFER_BPS) / 10_000;
    }

    // ============ Internal Helpers ============

    /// @dev Refund excess ETH to sender
    function _refundExcess(uint256 usedFee) internal {
        if (msg.value > usedFee) {
            uint256 excess = msg.value - usedFee;
            (bool success,) = payable(msg.sender).call{ value: excess }("");
            if (!success) revert RefundFailed();
        }
    }

    /// @dev Generate unique bridge ID
    function _generateBridgeId() internal returns (bytes32) {
        return
            keccak256(abi.encode(block.chainid, address(this), ++_bridgeNonce));
    }

    // ============ Abstract Functions (chain-specific) ============

    /// @dev Build retry message (chain-specific payload format)
    function _buildRetryMessage(bytes32 bridgeId, PendingBridge storage pending)
        internal
        view
        virtual
        returns (bytes memory message, uint128 gasLimit);

    /// @dev Handle incoming bridge from remote chain
    function _handleBridge(bytes memory data) internal virtual;

    /// @dev Handle ACK from remote chain
    function _handleAck(bytes memory data) internal virtual;
}
