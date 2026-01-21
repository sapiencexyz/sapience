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
import "./PositionTokenBridgeBase.sol";
import "./interfaces/IPositionTokenBridgeRemote.sol";
import "./interfaces/IPositionTokenFactory.sol";
import "./interfaces/IBridgedPositionToken.sol";

/// @title PositionTokenBridgeRemote
/// @notice Bridge for position tokens on Arbitrum (remote chain)
/// @dev Extends PositionTokenBridgeBase with Arbitrum-specific logic
contract PositionTokenBridgeRemote is
    PositionTokenBridgeBase,
    IPositionTokenBridgeRemote
{
    using SafeERC20 for IERC20;
    using OptionsBuilder for bytes;

    // ============ Constants ============
    uint128 private constant GAS_FOR_BRIDGE = 200_000;

    // ============ Storage ============

    /// @notice Token factory for CREATE3 deployments
    IPositionTokenFactory public immutable factory;

    /// @notice Mapping from source token address to bridged token address
    mapping(address => address) public sourceToRemote;

    /// @notice Mapping from bridged token address to source token address
    mapping(address => address) public remoteToSource;

    /// @notice Tracking for minted tokens per bridgeId (for audit trail)
    mapping(bytes32 => MintedBridge) private _mintedBridges;

    // ============ Constructor ============
    constructor(address endpoint_, address owner_, address factory_)
        PositionTokenBridgeBase(endpoint_, owner_)
    {
        factory = IPositionTokenFactory(factory_);
    }

    // ============ View Functions ============

    /// @inheritdoc IPositionTokenBridgeRemote
    function getFactory() external view returns (address) {
        return address(factory);
    }

    /// @inheritdoc IPositionTokenBridgeRemote
    function isTokenDeployed(bytes32 pickConfigId, bool isPredictorToken)
        external
        view
        returns (bool)
    {
        return factory.isDeployed(pickConfigId, isPredictorToken);
    }

    /// @inheritdoc IPositionTokenBridgeRemote
    function getTokenAddress(bytes32 pickConfigId, bool isPredictorToken)
        external
        view
        returns (address)
    {
        return factory.predictAddress(pickConfigId, isPredictorToken);
    }

    /// @inheritdoc IPositionTokenBridgeRemote
    function getMintedBridge(bytes32 bridgeId)
        external
        view
        returns (MintedBridge memory)
    {
        return _mintedBridges[bridgeId];
    }

    // ============ Bridge Function ============

    /// @inheritdoc IPositionTokenBridgeRemote
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

        address sourceToken = remoteToSource[token];
        if (sourceToken == address(0)) revert TokenNotFound(token);

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

        // Encode message - send the SOURCE token address so Ethereal knows which token to release
        bytes memory payload =
            abi.encode(bridgeId, sourceToken, recipient, amount);
        bytes memory message = abi.encode(CMD_BRIDGE, payload);

        // Build options
        bytes memory options = OptionsBuilder.newOptions()
            .addExecutorLzReceiveOption(GAS_FOR_BRIDGE, 0);

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

        emit BridgeInitiated(
            bridgeId, token, msg.sender, recipient, amount, createdAt, refCode
        );
    }

    // ============ Quote Functions ============

    /// @inheritdoc IPositionTokenBridgeRemote
    function quoteBridge(address token, uint256 amount)
        external
        view
        returns (MessagingFee memory fee)
    {
        address sourceToken = remoteToSource[token];
        // Build sample message for quote
        bytes memory payload =
            abi.encode(bytes32(0), sourceToken, address(0), amount);
        bytes memory message = abi.encode(CMD_BRIDGE, payload);
        bytes memory options = OptionsBuilder.newOptions()
            .addExecutorLzReceiveOption(GAS_FOR_BRIDGE, 0);
        return _quote(_bridgeConfig.remoteEid, message, options, false);
    }

    /// @inheritdoc IPositionTokenBridgeBase
    function quoteRetry(bytes32 bridgeId)
        external
        view
        returns (MessagingFee memory fee)
    {
        PendingBridge storage pending = _pendingBridges[bridgeId];
        address sourceToken = remoteToSource[pending.token];
        // Build sample message for quote
        bytes memory payload = abi.encode(
            bridgeId, sourceToken, pending.recipient, pending.amount
        );
        bytes memory message = abi.encode(CMD_BRIDGE, payload);
        bytes memory options = OptionsBuilder.newOptions()
            .addExecutorLzReceiveOption(GAS_FOR_BRIDGE, 0);
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
        address sourceToken = remoteToSource[pending.token];
        bytes memory payload = abi.encode(
            bridgeId, sourceToken, pending.recipient, pending.amount
        );
        message = abi.encode(CMD_BRIDGE, payload);
        gasLimit = GAS_FOR_BRIDGE;
    }

    /// @dev Handle incoming bridge from Ethereal (mint tokens)
    function _handleBridge(bytes memory data) internal override {
        (
            bytes32 bridgeId,
            address sourceToken,
            bytes32 pickConfigId,
            bool isPredictorToken,
            string memory name,
            string memory symbol,
            address recipient,
            uint256 amount
        ) = abi.decode(
            data,
            (bytes32, address, bytes32, bool, string, string, address, uint256)
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

        // Always update mappings (in case of re-bridging after full release)
        if (sourceToRemote[sourceToken] == address(0)) {
            sourceToRemote[sourceToken] = remoteToken;
            remoteToSource[remoteToken] = sourceToken;
        }

        // Mint tokens to recipient
        IBridgedPositionToken(remoteToken).mint(recipient, amount);

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
            IBridgedPositionToken(pending.token)
                .burn(address(this), pending.amount);

            emit BridgeCompleted(bridgeId);
        }
    }
}
