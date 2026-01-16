// SPDX-License-Identifier: MIT
pragma solidity ^0.8.19;

import {OApp, Origin, MessagingFee, MessagingReceipt} from "@layerzerolabs/oapp-evm/contracts/oapp/OApp.sol";
import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";
import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import {OptionsBuilder} from "@layerzerolabs/oapp-evm/contracts/oapp/libs/OptionsBuilder.sol";
import "./interfaces/IPositionTokenBridgeRemote.sol";
import "./interfaces/IPositionTokenFactory.sol";
import "./interfaces/IBridgedPositionToken.sol";

/// @title PositionTokenBridgeRemote
/// @notice Bridge for position tokens on Arbitrum (remote chain)
/// @dev Permissionless bridge with two-phase commit (ACK) for safety
contract PositionTokenBridgeRemote is OApp, ReentrancyGuard, IPositionTokenBridgeRemote {
    using SafeERC20 for IERC20;
    using OptionsBuilder for bytes;

    // ============ Constants ============
    uint16 private constant CMD_BRIDGE_TO_REMOTE = 1;
    uint16 private constant CMD_BRIDGE_BACK = 2;
    uint16 private constant CMD_ACK = 3;
    uint16 private constant CMD_CANCEL = 4;

    uint128 private constant GAS_FOR_BRIDGE_BACK = 200_000;
    uint128 private constant GAS_FOR_ACK = 100_000;

    // ============ Storage ============
    BridgeConfig private _bridgeConfig;
    uint64 public immutable expiryDuration;

    /// @notice Token factory for CREATE3 deployments
    IPositionTokenFactory public immutable factory;

    /// @notice Mapping from source token address to bridged token address
    mapping(address => address) public sourceToRemote;

    /// @notice Mapping from bridged token address to source token address
    mapping(address => address) public remoteToSource;

    /// @notice Pending bridge back records
    mapping(bytes32 => PendingBridgeBack) private _pendingBridgeBacks;

    /// @notice Escrowed token balances (pending bridge backs)
    mapping(address => uint256) private _escrowedBalances;

    /// @notice Nonce for generating unique bridge IDs
    uint256 private _bridgeNonce;

    // ============ Constructor ============
    constructor(
        address endpoint_,
        address owner_,
        address factory_,
        uint64 expiryDuration_
    ) OApp(endpoint_, owner_) Ownable(owner_) {
        factory = IPositionTokenFactory(factory_);
        expiryDuration = expiryDuration_;
    }

    // ============ Configuration (Owner only for LZ) ============

    /// @notice Set the bridge configuration
    function setBridgeConfig(BridgeConfig calldata config) external onlyOwner {
        _bridgeConfig = config;
        emit BridgeConfigUpdated(config);
    }

    /// @inheritdoc IPositionTokenBridgeRemote
    function getBridgeConfig() external view returns (BridgeConfig memory) {
        return _bridgeConfig;
    }

    /// @inheritdoc IPositionTokenBridgeRemote
    function getFactory() external view returns (address) {
        return address(factory);
    }

    /// @inheritdoc IPositionTokenBridgeRemote
    function getExpiryDuration() external view returns (uint64) {
        return expiryDuration;
    }

    // ============ Bridge Functions ============

    /// @inheritdoc IPositionTokenBridgeRemote
    function bridgeBack(
        address token,
        address recipient,
        uint256 amount
    ) external payable nonReentrant returns (bytes32 bridgeId) {
        if (token == address(0) || recipient == address(0)) revert ZeroAddress();
        if (amount == 0) revert ZeroAmount();

        address sourceToken = remoteToSource[token];
        if (sourceToken == address(0)) revert TokenNotFound(token);

        // Transfer tokens to this contract (escrow, NOT burn yet)
        IERC20(token).safeTransferFrom(msg.sender, address(this), amount);
        _escrowedBalances[token] += amount;

        // Generate unique bridge ID
        bridgeId = keccak256(abi.encode(block.chainid, address(this), ++_bridgeNonce));

        // Create pending bridge record
        uint64 expiry = uint64(block.timestamp) + expiryDuration;
        _pendingBridgeBacks[bridgeId] = PendingBridgeBack({
            token: token,
            sourceToken: sourceToken,
            sender: msg.sender,
            recipient: recipient,
            amount: amount,
            expiry: expiry,
            status: BridgeStatus.PENDING
        });

        // Encode message - send the SOURCE token address so Ethereal knows which token to release
        bytes memory payload = abi.encode(bridgeId, sourceToken, recipient, amount);
        bytes memory message = abi.encode(CMD_BRIDGE_BACK, payload);

        // Build options
        bytes memory options = OptionsBuilder.newOptions().addExecutorLzReceiveOption(GAS_FOR_BRIDGE_BACK, 0);

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

        emit BridgeBackInitiated(bridgeId, token, msg.sender, recipient, amount, expiry);
    }

    /// @inheritdoc IPositionTokenBridgeRemote
    function cancelBridgeBack(bytes32 bridgeId) external payable nonReentrant {
        PendingBridgeBack storage pending = _pendingBridgeBacks[bridgeId];

        if (pending.status != BridgeStatus.PENDING) {
            revert InvalidBridgeStatus(bridgeId, BridgeStatus.PENDING, pending.status);
        }

        if (block.timestamp < pending.expiry) {
            revert BridgeNotExpired(bridgeId, pending.expiry, uint64(block.timestamp));
        }

        // Mark as cancelled
        pending.status = BridgeStatus.CANCELLED;

        // Return escrowed tokens to sender
        _escrowedBalances[pending.token] -= pending.amount;
        IERC20(pending.token).safeTransfer(pending.sender, pending.amount);

        // Note: We don't send a cancel message to Ethereal because the tokens were never
        // released there (no ACK was sent back to us, meaning the release failed or was never processed)

        emit BridgeBackCancelled(bridgeId, pending.sender, pending.amount);
    }

    /// @inheritdoc IPositionTokenBridgeRemote
    function quoteBridgeBack(
        address token,
        uint256 amount
    ) external view returns (MessagingFee memory fee) {
        address sourceToken = remoteToSource[token];
        // Build sample message for quote
        bytes memory payload = abi.encode(bytes32(0), sourceToken, address(0), amount);
        bytes memory message = abi.encode(CMD_BRIDGE_BACK, payload);
        bytes memory options = OptionsBuilder.newOptions().addExecutorLzReceiveOption(GAS_FOR_BRIDGE_BACK, 0);
        return _quote(_bridgeConfig.remoteEid, message, options, false);
    }

    /// @inheritdoc IPositionTokenBridgeRemote
    function quoteCancelBridgeBack() external pure returns (MessagingFee memory fee) {
        // Cancel doesn't send a cross-chain message, so fee is 0
        return MessagingFee({nativeFee: 0, lzTokenFee: 0});
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

        if (commandType == CMD_BRIDGE_TO_REMOTE) {
            _handleBridgeToRemote(data);
        } else if (commandType == CMD_ACK) {
            _handleAck(data);
        } else if (commandType == CMD_CANCEL) {
            _handleCancel(data);
        } else {
            revert InvalidCommandType(commandType);
        }
    }

    function _handleBridgeToRemote(bytes memory data) internal {
        (
            bytes32 bridgeId,
            address sourceToken,
            bytes32 predictionId,
            bool isPredictorToken,
            string memory name,
            string memory symbol,
            address recipient,
            uint256 amount
        ) = abi.decode(data, (bytes32, address, bytes32, bool, string, string, address, uint256));

        // Check if token exists, deploy if not
        address remoteToken = factory.predictAddress(predictionId, isPredictorToken);
        bool isNewDeployment = false;

        if (remoteToken.code.length == 0) {
            // Deploy new token
            remoteToken = factory.deploy(
                predictionId,
                isPredictorToken,
                name,
                symbol,
                address(0), // No initial recipient
                address(this) // Bridge is authorized to mint/burn
            );
            isNewDeployment = true;
        }

        // Always update mappings (in case of re-bridging after full release)
        if (sourceToRemote[sourceToken] == address(0)) {
            sourceToRemote[sourceToken] = remoteToken;
            remoteToSource[remoteToken] = sourceToken;
        }

        // Mint tokens to recipient
        IBridgedPositionToken(remoteToken).mint(recipient, amount);

        emit TokensMinted(bridgeId, remoteToken, recipient, amount, isNewDeployment);

        // Send ACK back to Ethereal (if contract has sufficient balance)
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

    /// @notice Manually send ACK for a completed bridge (if auto-ACK failed due to low balance)
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

    function _handleAck(bytes memory data) internal {
        bytes32 bridgeId = abi.decode(data, (bytes32));
        PendingBridgeBack storage pending = _pendingBridgeBacks[bridgeId];

        // Only process if still pending (could have been cancelled)
        if (pending.status == BridgeStatus.PENDING) {
            pending.status = BridgeStatus.COMPLETED;

            // Now burn the escrowed tokens
            _escrowedBalances[pending.token] -= pending.amount;
            IBridgedPositionToken(pending.token).burn(address(this), pending.amount);

            emit BridgeBackCompleted(bridgeId);
        }
    }

    function _handleCancel(bytes memory data) internal {
        (bytes32 bridgeId, uint256 amount) = abi.decode(data, (bytes32, uint256));

        // If tokens were minted for this bridgeId, we need to burn them
        // However, we don't track minted amounts per bridgeId, so this is a notification
        // The sender would need to return the tokens voluntarily or through governance
        // For now, we just emit an event
        emit CancelReceived(bridgeId, amount);
    }

    // ============ View Functions ============

    /// @inheritdoc IPositionTokenBridgeRemote
    function getPendingBridgeBack(bytes32 bridgeId) external view returns (PendingBridgeBack memory) {
        return _pendingBridgeBacks[bridgeId];
    }

    /// @inheritdoc IPositionTokenBridgeRemote
    function getEscrowedBalance(address token) external view returns (uint256) {
        return _escrowedBalances[token];
    }

    /// @inheritdoc IPositionTokenBridgeRemote
    function isTokenDeployed(
        bytes32 predictionId,
        bool isPredictorToken
    ) external view returns (bool) {
        return factory.isDeployed(predictionId, isPredictorToken);
    }

    /// @inheritdoc IPositionTokenBridgeRemote
    function getTokenAddress(
        bytes32 predictionId,
        bool isPredictorToken
    ) external view returns (address) {
        return factory.predictAddress(predictionId, isPredictorToken);
    }

    // ============ Ownership Management ============

    /// @inheritdoc IPositionTokenBridgeRemote
    function isConfigComplete() external view returns (bool) {
        // Check bridge config
        if (_bridgeConfig.remoteEid == 0) return false;
        if (_bridgeConfig.remoteBridge == address(0)) return false;

        // Check LZ peer is set
        bytes32 peer = peers[_bridgeConfig.remoteEid];
        if (peer == bytes32(0)) return false;

        // Factory is immutable, set in constructor - no need to check

        return true;
    }

    /// @inheritdoc IPositionTokenBridgeRemote
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
