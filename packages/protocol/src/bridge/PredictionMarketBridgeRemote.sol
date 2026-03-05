// SPDX-License-Identifier: MIT
pragma solidity ^0.8.19;

import { MessagingFee } from "@layerzerolabs/oapp-evm/contracts/oapp/OApp.sol";
import { IERC20 } from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {
    SafeERC20
} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import {
    OptionsBuilder
} from "@layerzerolabs/oapp-evm/contracts/oapp/libs/OptionsBuilder.sol";
import "./PredictionMarketBridgeBase.sol";
import "./interfaces/IPredictionMarketBridgeRemote.sol";
import "../interfaces/IPredictionMarketTokenFactory.sol";
import "../interfaces/IPredictionMarketToken.sol";

/// @title PredictionMarketBridgeRemote
/// @notice Bridge for position tokens on Arbitrum (remote chain)
/// @dev Extends PredictionMarketBridgeBase with Arbitrum-specific logic
contract PredictionMarketBridgeRemote is
    PredictionMarketBridgeBase,
    IPredictionMarketBridgeRemote
{
    using SafeERC20 for IERC20;
    using OptionsBuilder for bytes;

    // ============ Constants ============
    /// @dev Gas for bridge execution on Ethereal (token release + ACK send)
    uint128 private constant GAS_FOR_BRIDGE = 500_000;

    // ============ Storage ============

    /// @notice Token factory for CREATE3 deployments
    IPredictionMarketTokenFactory public immutable factory;

    /// @notice Tracking for minted tokens per bridgeId (for audit trail)
    mapping(bytes32 => MintedBridge) private _mintedBridges;

    // ============ Constructor ============
    constructor(address endpoint_, address owner_, address factory_)
        PredictionMarketBridgeBase(endpoint_, owner_)
    {
        factory = IPredictionMarketTokenFactory(factory_);
    }

    // ============ View Functions ============

    /// @inheritdoc IPredictionMarketBridgeRemote
    function getFactory() external view returns (address) {
        return address(factory);
    }

    /// @inheritdoc IPredictionMarketBridgeRemote
    function isTokenDeployed(bytes32 pickConfigId, bool isPredictorToken)
        external
        view
        returns (bool)
    {
        return factory.isDeployed(pickConfigId, isPredictorToken);
    }

    /// @inheritdoc IPredictionMarketBridgeRemote
    function getTokenAddress(bytes32 pickConfigId, bool isPredictorToken)
        external
        view
        returns (address)
    {
        return factory.predictAddress(pickConfigId, isPredictorToken);
    }

    /// @inheritdoc IPredictionMarketBridgeRemote
    function getMintedBridge(bytes32 bridgeId)
        external
        view
        returns (MintedBridge memory)
    {
        return _mintedBridges[bridgeId];
    }

    // ============ Bridge Function ============

    /// @inheritdoc IPredictionMarketBridgeRemote
    function bridge(
        address token,
        address recipient,
        uint256 amount,
        bytes32 refCode
    ) external payable nonReentrant returns (bytes32 bridgeId) {
        if (token == address(0) || recipient == address(0)) {
            revert ZeroAddress();
        }
        if (amount == 0) revert ZeroAmount();

        // Validate token was deployed by the factory
        bytes32 pickConfigId = IPredictionMarketToken(token).pickConfigId();
        bool isPredictorToken = IPredictionMarketToken(token).isPredictorToken();
        address expectedToken =
            factory.predictAddress(pickConfigId, isPredictorToken);
        if (token != expectedToken) revert InvalidToken(token);

        // Transfer tokens to this contract (escrow, NOT burn yet)
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
            // Encode message with pickConfigId + isPredictorToken
            // (Ethereal computes token from factory)
            bytes memory payload = abi.encode(
                bridgeId, pickConfigId, isPredictorToken, recipient, amount
            );
            bytes memory message = abi.encode(CMD_BRIDGE, payload);

            // Calculate ACK fee with buffer to prepay on remote chain
            uint128 ackFeeWithBuffer = _getAckFeeWithBuffer();

            // Build options - include ACK fee as value to send to remote
            bytes memory options = OptionsBuilder.newOptions()
                .addExecutorLzReceiveOption(GAS_FOR_BRIDGE, ackFeeWithBuffer);

            // Quote fee
            MessagingFee memory fee =
                _quote(_bridgeConfig.remoteEid, message, options, false);
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
            _refundExcess(fee.nativeFee);
        }

        emit BridgeInitiated(
            bridgeId, token, msg.sender, recipient, amount, createdAt, refCode
        );
    }

    // ============ Quote Functions ============

    /// @inheritdoc IPredictionMarketBridgeRemote
    function quoteBridge(address, uint256 amount)
        external
        view
        returns (MessagingFee memory fee)
    {
        // Build sample message for quote
        bytes memory payload =
            abi.encode(bytes32(0), bytes32(0), false, address(0), amount);
        bytes memory message = abi.encode(CMD_BRIDGE, payload);

        // Include ACK fee with buffer in the quote
        uint128 ackFeeWithBuffer = _getAckFeeWithBuffer();
        bytes memory options = OptionsBuilder.newOptions()
            .addExecutorLzReceiveOption(GAS_FOR_BRIDGE, ackFeeWithBuffer);
        return _quote(_bridgeConfig.remoteEid, message, options, false);
    }

    /// @inheritdoc IPredictionMarketBridgeBase
    function quoteRetry(bytes32 bridgeId)
        external
        view
        returns (MessagingFee memory fee)
    {
        PendingBridge storage pending = _pendingBridges[bridgeId];
        bytes32 pickConfigId =
            IPredictionMarketToken(pending.token).pickConfigId();
        bool isPredictorToken =
            IPredictionMarketToken(pending.token).isPredictorToken();

        // Build sample message for quote
        bytes memory payload = abi.encode(
            bridgeId,
            pickConfigId,
            isPredictorToken,
            pending.recipient,
            pending.amount
        );
        bytes memory message = abi.encode(CMD_BRIDGE, payload);

        // Include ACK fee with buffer in the quote
        uint128 ackFeeWithBuffer = _getAckFeeWithBuffer();
        bytes memory options = OptionsBuilder.newOptions()
            .addExecutorLzReceiveOption(GAS_FOR_BRIDGE, ackFeeWithBuffer);
        return _quote(_bridgeConfig.remoteEid, message, options, false);
    }

    // ============ Abstract Implementation ============

    /// @dev Build retry message for Remote -> Ethereal bridge
    function _buildRetryMessage(bytes32 bridgeId, PendingBridge storage pending)
        internal
        view
        override
        returns (bytes memory message, uint128 gasLimit)
    {
        bytes32 pickConfigId =
            IPredictionMarketToken(pending.token).pickConfigId();
        bool isPredictorToken =
            IPredictionMarketToken(pending.token).isPredictorToken();

        bytes memory payload = abi.encode(
            bridgeId,
            pickConfigId,
            isPredictorToken,
            pending.recipient,
            pending.amount
        );
        message = abi.encode(CMD_BRIDGE, payload);
        gasLimit = GAS_FOR_BRIDGE;
    }

    /// @dev Handle incoming bridge from Ethereal (mint tokens)
    function _handleBridge(bytes memory data) internal override {
        (
            bytes32 bridgeId,
            bytes32 pickConfigId,
            bool isPredictorToken,
            string memory name,
            string memory symbol,
            address recipient,
            uint256 amount
        ) = abi.decode(
            data, (bytes32, bytes32, bool, string, string, address, uint256)
        );

        // Check if this bridge was already processed (idempotency)
        if (_processedBridges[bridgeId]) {
            // Already processed - just re-send ACK
            emit BridgeProcessed(bridgeId, true);
            _trySendAck(bridgeId);
            return;
        }

        // Mark as processed BEFORE minting (prevents reentrancy issues)
        _processedBridges[bridgeId] = true;

        // Check if token exists, deploy if not
        address remoteToken =
            factory.predictAddress(pickConfigId, isPredictorToken);
        bool isNewDeployment = false;

        if (remoteToken.code.length == 0) {
            // Deploy new token
            remoteToken = factory.deploy(
                pickConfigId,
                isPredictorToken,
                name,
                symbol,
                address(this) // Bridge is authorized to mint/burn
            );
            isNewDeployment = true;
        }

        // Mint tokens to recipient
        IPredictionMarketToken(remoteToken).mint(recipient, amount);

        // Track minted tokens (for audit trail)
        _mintedBridges[bridgeId] = MintedBridge({
            token: remoteToken, recipient: recipient, amount: amount
        });

        emit BridgeProcessed(bridgeId, false);
        emit TokensMinted(
            bridgeId, remoteToken, recipient, amount, isNewDeployment
        );

        // Send ACK back to Ethereal (if contract has sufficient balance)
        _trySendAck(bridgeId);
    }

    /// @dev Handle ACK from Ethereal (burn escrowed tokens)
    function _handleAck(bytes memory data) internal override {
        bytes32 bridgeId = abi.decode(data, (bytes32));
        PendingBridge storage pending = _pendingBridges[bridgeId];

        if (pending.status == BridgeStatus.PENDING) {
            pending.status = BridgeStatus.COMPLETED;

            // Now burn the escrowed tokens
            _escrowedBalances[pending.token] -= pending.amount;
            IPredictionMarketToken(pending.token)
                .burn(address(this), pending.amount);

            emit BridgeCompleted(bridgeId);
        }
    }
}
