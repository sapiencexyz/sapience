// SPDX-License-Identifier: UNLICENSED
pragma solidity ^0.8.22;

import {OApp, Origin, MessagingFee} from "@layerzerolabs/oapp-evm/contracts/oapp/OApp.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import {OptimisticOracleV3Interface} from "@uma/core/contracts/optimistic-oracle-v3/interfaces/OptimisticOracleV3Interface.sol";
import {IUMALayerZeroBridge} from "./interfaces/ILayerZeroBridge.sol";
import {Encoder} from "./cmdEncoder.sol";
import {MessagingReceipt} from "@layerzerolabs/oapp-evm/contracts/oapp/OApp.sol";
import {BridgeTypes} from "./BridgeTypes.sol";
import {OptionsBuilder} from "@layerzerolabs/oapp-evm/contracts/oapp/libs/OptionsBuilder.sol";
import {ETHManagement} from "./abstract/ETHManagement.sol";
import {BondManagement} from "./abstract/BondManagement.sol";
// import {console2} from "forge-std/console2.sol";

struct AssertionMarketData {
    bytes32 assertionId;
    uint256 bridgeAssertionId;
    address submitter;
    address bondToken;
    uint256 bondAmount;
}

/**
 * @title UMALayerZeroBridge
 * @notice Bridge contract deployed on the UMA network
 * @dev This contract:
 * 1. Receives settlement requests from Converge
 * 2. Interacts with UMA's OptimisticOracleV3
 * 3. Manages bond tokens and gas fees
 * 4. Sends verification results back to Converge
 */
contract UMALayerZeroBridge is
    OApp,
    IUMALayerZeroBridge,
    ETHManagement,
    BondManagement
{
    using SafeERC20 for IERC20;
    using Encoder for bytes;
    using BridgeTypes for BridgeTypes.BridgeConfig;
    using OptionsBuilder for bytes;

    // State variables
    BridgeTypes.BridgeConfig private bridgeConfig;
    address private optimisticOracleV3Address;

    mapping(bytes32 => AssertionMarketData) private assertionIdToMarketData; // assertionId => marketData

    // Constructor and initialization
    constructor(
        address _endpoint,
        address _owner
    ) OApp(_endpoint, _owner) ETHManagement(_owner) {}

    // Configuration functions
    function setBridgeConfig(
        BridgeTypes.BridgeConfig calldata newConfig
    ) external override onlyOwner {
        bridgeConfig = newConfig;
        emit BridgeConfigUpdated(newConfig);
    }

    function getBridgeConfig()
        external
        view
        override
        returns (BridgeTypes.BridgeConfig memory)
    {
        return bridgeConfig;
    }

    function setOptimisticOracleV3(
        address _optimisticOracleV3
    ) external override onlyOwner {
        optimisticOracleV3Address = _optimisticOracleV3;
    }

    function getOptimisticOracleV3() external view override returns (address) {
        return optimisticOracleV3Address;
    }

    // UMA callback functions
    function assertionResolvedCallback(
        bytes32 assertionId,
        bool assertedTruthfully
    ) external override nonReentrant returns (MessagingReceipt memory) {
        AssertionMarketData storage marketData = assertionIdToMarketData[
            assertionId
        ];

        if (msg.sender != optimisticOracleV3Address) {
            revert("Only the OptimisticOracleV3 can call this function");
        }

        if (marketData.bridgeAssertionId == 0) {
            revert("Invalid assertion ID");
        }

        // Make assertion data to UMA side via LayerZero
        bytes memory commandPayload = Encoder.encodeFromUMAResolved(
            marketData.bridgeAssertionId,
            assertedTruthfully
        );

        // Send message using contract's ETH balance
        (MessagingReceipt memory receipt, ) = _sendLayerZeroMessageWithQuote(
            Encoder.CMD_FROM_UMA_RESOLVED_CALLBACK,
            commandPayload,
            false
        );

        // Notice: the bond is sent back to the submitter, not to the bridge, that's why we don't update the balance here.

        return receipt;
    }

    function assertionDisputedCallback(
        bytes32 assertionId
    ) external override nonReentrant returns (MessagingReceipt memory) {
        AssertionMarketData storage marketData = assertionIdToMarketData[
            assertionId
        ];

        if (msg.sender != optimisticOracleV3Address) {
            revert("Only the OptimisticOracleV3 can call this function");
        }

        if (marketData.bridgeAssertionId == 0) {
            revert("Invalid assertion ID");
        }

        // Make assertion data to UMA side via LayerZero
        bytes memory commandPayload = Encoder.encodeFromUMADisputed(
            marketData.bridgeAssertionId
        );

        // Send message using contract's ETH balance
        (MessagingReceipt memory receipt, ) = _sendLayerZeroMessageWithQuote(
            Encoder.CMD_FROM_UMA_DISPUTED_CALLBACK,
            commandPayload,
            false
        );

        // We don't need to update the balance since it was already deducted when the assertion was submitted

        return receipt;
    }

    // LayerZero message handling
    function _lzReceive(
        Origin calldata _origin,
        bytes32 _guid,
        bytes calldata _message,
        address _executor,
        bytes calldata _extraData
    ) internal override {
        require(
            _origin.srcEid == bridgeConfig.remoteChainId,
            "Invalid source chain"
        );
        require(
            address(uint160(uint256(_origin.sender))) ==
                bridgeConfig.remoteBridge,
            "Invalid sender"
        );

        // Handle incoming messages from the UMA side
        (uint16 commandType, bytes memory data) = _message.decodeType();

        if (commandType == Encoder.CMD_TO_UMA_ASSERT_TRUTH) {
            _handleAssertTruthCmd(data);
        } else {
            revert("Invalid command type");
        }
    }

    // Helper function to send LayerZero messages with quote
    function _sendLayerZeroMessageWithQuote(
        uint16 commandCode,
        bytes memory commandPayload,
        bool onlyQuote
    )
        internal
        returns (MessagingReceipt memory receipt, MessagingFee memory fee)
    {
        bytes memory message = abi.encode(commandCode, commandPayload);

        bytes memory options = OptionsBuilder
            .newOptions()
            .addExecutorLzReceiveOption(_getMaxExecutionGas(), 0);

        // Get quote for the message
        fee = _quote(
            bridgeConfig.remoteChainId,
            message,
            options, // options
            false // payInLzToken
        );

        if (onlyQuote) {
            return (MessagingReceipt(0, 0, fee), fee);
        }

        // Check if contract has enough ETH
        _requireSufficientETH(fee.nativeFee);

        // Check gas thresholds and emit alerts before sending
        _checkGasThresholds();

        // Send the message using the external send function with ETH from contract
        receipt = this._sendMessageWithETH{value: fee.nativeFee}(
            bridgeConfig.remoteChainId,
            message,
            options,
            fee
        );

        return (receipt, fee);
    }

    // External function to send LayerZero messages with ETH from contract balance
    function _sendMessageWithETH(
        uint32 _dstEid,
        bytes memory _message,
        bytes memory _options,
        MessagingFee memory _fee
    ) external payable returns (MessagingReceipt memory) {
        require(msg.sender == address(this), "Only self-call allowed");
        return
            _lzSend(_dstEid, _message, _options, _fee, payable(address(this)));
    }

    function _handleAssertTruthCmd(bytes memory data) internal {
        // Decode the data from the Market side (incoming data: assertionId, asserter, liveness, currency, bond, claim)
        (
            uint256 bridgeAssertionId,
            address asserter,
            uint64 liveness,
            address bondTokenAddress,
            uint256 bondAmount,
            bytes memory claim
        ) = data.decodeToUMAAssertTruth();

        // TODO: Check if the assertionId is already in the mapping and send back an error message
        // TODO: Check if the bond is enough and send back an error message

        OptimisticOracleV3Interface optimisticOracleV3 = OptimisticOracleV3Interface(
                optimisticOracleV3Address
            );

        IERC20 bondToken = IERC20(bondTokenAddress);

        bondToken.approve(address(optimisticOracleV3), bondAmount);

        bytes32 umaAssertionId = optimisticOracleV3.assertTruth(
            claim,
            asserter,
            address(this),
            address(0),
            liveness,
            bondToken,
            bondAmount,
            optimisticOracleV3.defaultIdentifier(),
            bytes32(0)
        );

        AssertionMarketData storage marketData = assertionIdToMarketData[
            umaAssertionId
        ];
        marketData.bridgeAssertionId = bridgeAssertionId;
        marketData.submitter = asserter;
        marketData.bondToken = bondTokenAddress;
        marketData.bondAmount = bondAmount;
        marketData.assertionId = umaAssertionId;

        _updateBondBalance(asserter, bondTokenAddress, bondAmount, false);
    }

    // Implementation of abstract function from BondManagement
    function _sendBalanceUpdate(
        uint16 commandType,
        address submitter,
        address bondToken,
        uint256 finalAmount,
        uint256 deltaAmount
    ) internal override returns (MessagingReceipt memory) {
        // Make balance update data for UMA side via LayerZero
        bytes memory commandPayload = Encoder.encodeFromBalanceUpdate(
            submitter,
            bondToken,
            finalAmount,
            deltaAmount
        );

        // Send message using contract's ETH balance
        (MessagingReceipt memory receipt, ) = _sendLayerZeroMessageWithQuote(
            commandType,
            commandPayload,
            false
        );

        return receipt;
    }

    // Implementation of command type functions
    function _getDepositCommandType() internal pure override returns (uint16) {
        return Encoder.CMD_FROM_ESCROW_DEPOSIT;
    }

    function _getIntentToWithdrawCommandType()
        internal
        pure
        override
        returns (uint16)
    {
        return Encoder.CMD_FROM_ESCROW_INTENT_TO_WITHDRAW;
    }

    function _getWithdrawCommandType() internal pure override returns (uint16) {
        return Encoder.CMD_FROM_ESCROW_WITHDRAW;
    }
}
