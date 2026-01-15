// SPDX-License-Identifier: MIT
pragma solidity ^0.8.19;

import {OApp, Origin, MessagingFee, MessagingReceipt} from "@layerzerolabs/oapp-evm/contracts/oapp/OApp.sol";
import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";
import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import {OptionsBuilder} from "@layerzerolabs/oapp-evm/contracts/oapp/libs/OptionsBuilder.sol";
import "./interfaces/IPositionTokenBridgeRemote.sol";
import "./interfaces/IPositionTokenFactory.sol";
import "./interfaces/IBridgedPositionToken.sol";

/// @title PositionTokenBridgeRemote
/// @notice Bridge for position tokens on Arbitrum (remote chain)
/// @dev Deploys tokens via CREATE3 factory if needed, mints on bridge-in, burns on bridge-back
contract PositionTokenBridgeRemote is OApp, ReentrancyGuard, IPositionTokenBridgeRemote {
    using OptionsBuilder for bytes;

    // ============ Constants ============
    uint16 private constant CMD_BRIDGE_TO_REMOTE = 1;
    uint16 private constant CMD_BRIDGE_BACK = 2;

    // ============ Storage ============
    BridgeConfig private _bridgeConfig;

    /// @notice Token factory for CREATE3 deployments
    IPositionTokenFactory public factory;

    /// @notice Mapping from source token address to bridged token address
    mapping(address => address) public sourceToRemote;

    /// @notice Mapping from bridged token address to source token address
    mapping(address => address) public remoteToSource;

    // ============ Constructor ============
    constructor(
        address endpoint_,
        address owner_,
        address factory_
    ) OApp(endpoint_, owner_) Ownable(owner_) {
        factory = IPositionTokenFactory(factory_);
    }

    // ============ Configuration ============

    /// @notice Set the bridge configuration
    function setBridgeConfig(BridgeConfig calldata config) external onlyOwner {
        _bridgeConfig = config;
        emit BridgeConfigUpdated(config);
    }

    /// @inheritdoc IPositionTokenBridgeRemote
    function getBridgeConfig() external view returns (BridgeConfig memory) {
        return _bridgeConfig;
    }

    /// @notice Set the factory address
    function setFactory(address factory_) external onlyOwner {
        factory = IPositionTokenFactory(factory_);
        emit FactoryUpdated(factory_);
    }

    /// @inheritdoc IPositionTokenBridgeRemote
    function getFactory() external view returns (address) {
        return address(factory);
    }

    // ============ Bridge Functions ============

    /// @inheritdoc IPositionTokenBridgeRemote
    function bridgeBack(
        address token,
        address recipient,
        uint256 amount
    ) external payable nonReentrant {
        if (token == address(0) || recipient == address(0)) revert ZeroAddress();
        if (amount == 0) revert ZeroAmount();

        address sourceToken = remoteToSource[token];
        if (sourceToken == address(0)) revert TokenNotFound(token);

        // Burn tokens
        IBridgedPositionToken(token).burn(msg.sender, amount);

        // Encode message - send the SOURCE token address so Ethereal knows which token to release
        bytes memory payload = abi.encode(sourceToken, recipient, amount);
        bytes memory message = abi.encode(CMD_BRIDGE_BACK, payload);

        // Build options - 200k gas for release
        bytes memory options = OptionsBuilder.newOptions().addExecutorLzReceiveOption(200_000, 0);

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
            if (!success) revert RefundFailed();
        }

        emit TokensBridgedBack(token, msg.sender, recipient, amount, receipt.guid);
    }

    /// @inheritdoc IPositionTokenBridgeRemote
    function quoteBridgeBack(
        address token,
        address recipient,
        uint256 amount
    ) external view returns (MessagingFee memory fee) {
        address sourceToken = remoteToSource[token];
        bytes memory payload = abi.encode(sourceToken, recipient, amount);
        bytes memory message = abi.encode(CMD_BRIDGE_BACK, payload);
        bytes memory options = OptionsBuilder.newOptions().addExecutorLzReceiveOption(200_000, 0);
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

        if (commandType == CMD_BRIDGE_TO_REMOTE) {
            _handleBridgeToRemote(data);
        } else {
            revert InvalidCommandType(commandType);
        }
    }

    function _handleBridgeToRemote(bytes memory data) internal {
        (
            address sourceToken, // actual source token address from Ethereal
            bytes32 predictionId,
            bool isPredictorToken,
            string memory name,
            string memory symbol,
            address recipient,
            uint256 amount
        ) = abi.decode(data, (address, bytes32, bool, string, string, address, uint256));

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

        emit TokensMinted(remoteToken, recipient, amount, isNewDeployment);
    }

    // ============ View Functions ============

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

    // ============ Admin Functions ============

    /// @notice Register an existing source-remote token mapping
    /// @dev Used for manual setup or recovery
    function registerTokenMapping(address sourceToken, address remoteToken) external onlyOwner {
        sourceToRemote[sourceToken] = remoteToken;
        remoteToSource[remoteToken] = sourceToken;
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
