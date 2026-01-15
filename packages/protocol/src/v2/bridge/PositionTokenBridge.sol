// SPDX-License-Identifier: MIT
pragma solidity ^0.8.19;

import {OApp, Origin, MessagingFee, MessagingReceipt} from "@layerzerolabs/oapp-evm/contracts/oapp/OApp.sol";
import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";
import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import {OptionsBuilder} from "@layerzerolabs/oapp-evm/contracts/oapp/libs/OptionsBuilder.sol";
import "./interfaces/IPositionTokenBridge.sol";

/// @title PositionTokenBridge
/// @notice Bridge for position tokens on Ethereal (source chain)
/// @dev Escrows tokens when bridging out, releases when bridging back
contract PositionTokenBridge is OApp, ReentrancyGuard, IPositionTokenBridge {
    using SafeERC20 for IERC20;
    using OptionsBuilder for bytes;

    // ============ Constants ============
    uint16 private constant CMD_BRIDGE_TO_REMOTE = 1;
    uint16 private constant CMD_BRIDGE_BACK = 2;

    // ============ Storage ============
    BridgeConfig private _bridgeConfig;

    /// @notice Token metadata for bridging
    mapping(address => TokenMetadata) private _tokenMetadata;

    /// @notice Escrowed token balances
    mapping(address => uint256) private _escrowedBalances;

    /// @notice Registered tokens
    mapping(address => bool) private _registeredTokens;

    // ============ Constructor ============
    constructor(
        address endpoint_,
        address owner_
    ) OApp(endpoint_, owner_) Ownable(owner_) {}

    // ============ Configuration ============

    /// @notice Set the bridge configuration
    function setBridgeConfig(BridgeConfig calldata config) external onlyOwner {
        _bridgeConfig = config;
        emit BridgeConfigUpdated(config);
    }

    /// @inheritdoc IPositionTokenBridge
    function getBridgeConfig() external view returns (BridgeConfig memory) {
        return _bridgeConfig;
    }

    /// @inheritdoc IPositionTokenBridge
    function registerToken(
        address token,
        TokenMetadata calldata metadata
    ) external onlyOwner {
        if (token == address(0)) revert ZeroAddress();
        _tokenMetadata[token] = metadata;
        _registeredTokens[token] = true;
    }

    // ============ Bridge Functions ============

    /// @inheritdoc IPositionTokenBridge
    function bridge(
        address token,
        address recipient,
        uint256 amount
    ) external payable nonReentrant {
        if (token == address(0) || recipient == address(0)) revert ZeroAddress();
        if (amount == 0) revert ZeroAmount();
        if (!_registeredTokens[token]) revert TokenNotRegistered(token);

        TokenMetadata memory metadata = _tokenMetadata[token];

        // Transfer tokens to this contract (escrow)
        IERC20(token).safeTransferFrom(msg.sender, address(this), amount);
        _escrowedBalances[token] += amount;

        // Encode message - include source token address for mapping
        bytes memory payload = abi.encode(
            token, // source token address
            metadata.predictionId,
            metadata.isPredictorToken,
            metadata.name,
            metadata.symbol,
            recipient,
            amount
        );
        bytes memory message = abi.encode(CMD_BRIDGE_TO_REMOTE, payload);

        // Build options - 2M gas for CREATE3 deployment + mint (CREATE3 is gas-intensive)
        bytes memory options = OptionsBuilder.newOptions().addExecutorLzReceiveOption(2_000_000, 0);

        // Quote fee
        MessagingFee memory fee = _quote(_bridgeConfig.remoteEid, message, options, false);
        if (msg.value < fee.nativeFee) {
            revert InsufficientFee(fee.nativeFee, msg.value);
        }

        // Send message
        MessagingReceipt memory receipt = _lzSend(
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
            if (!success) revert ETHTransferFailed();
        }

        emit TokensBridged(token, msg.sender, recipient, amount, receipt.guid);
    }

    /// @inheritdoc IPositionTokenBridge
    function quoteBridge(
        address token,
        address recipient,
        uint256 amount
    ) external view returns (MessagingFee memory fee) {
        TokenMetadata memory metadata = _tokenMetadata[token];
        bytes memory payload = abi.encode(
            token, // source token address
            metadata.predictionId,
            metadata.isPredictorToken,
            metadata.name,
            metadata.symbol,
            recipient,
            amount
        );
        bytes memory message = abi.encode(CMD_BRIDGE_TO_REMOTE, payload);
        bytes memory options = OptionsBuilder.newOptions().addExecutorLzReceiveOption(2_000_000, 0);
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

        if (commandType == CMD_BRIDGE_BACK) {
            _handleBridgeBack(data);
        } else {
            revert InvalidCommandType(commandType);
        }
    }

    function _handleBridgeBack(bytes memory data) internal {
        (address token, address recipient, uint256 amount) = abi.decode(
            data,
            (address, address, uint256)
        );

        if (_escrowedBalances[token] < amount) {
            revert InsufficientEscrowBalance(amount, _escrowedBalances[token]);
        }

        _escrowedBalances[token] -= amount;
        IERC20(token).safeTransfer(recipient, amount);

        emit TokensReleased(token, recipient, amount);
    }

    // ============ View Functions ============

    /// @inheritdoc IPositionTokenBridge
    function getEscrowedBalance(address token) external view returns (uint256) {
        return _escrowedBalances[token];
    }

    /// @inheritdoc IPositionTokenBridge
    function isTokenRegistered(address token) external view returns (bool) {
        return _registeredTokens[token];
    }

    /// @inheritdoc IPositionTokenBridge
    function getTokenMetadata(address token) external view returns (TokenMetadata memory) {
        return _tokenMetadata[token];
    }

    // ============ ETH Management ============

    /// @notice Withdraw ETH from contract
    function withdrawETH(uint256 amount) external onlyOwner {
        (bool success,) = payable(owner()).call{value: amount}("");
        if (!success) revert ETHTransferFailed();
    }

    /// @notice Receive ETH
    receive() external payable {}
}
