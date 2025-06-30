// SPDX-License-Identifier: MIT
pragma solidity ^0.8.22;

import {OApp, Origin, MessagingFee} from "@layerzerolabs/oapp-evm/contracts/oapp/OApp.sol";
import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import {IUMASettlementModule} from "../market/interfaces/IUMASettlementModule.sol";
import {IMarketLayerZeroBridge} from "./interfaces/ILayerZeroBridge.sol";
import {Encoder} from "./cmdEncoder.sol";
import {MessagingReceipt} from "@layerzerolabs/oapp-evm/contracts/oapp/OApp.sol";
import {BridgeTypes} from "./BridgeTypes.sol";
import {OptionsBuilder} from "@layerzerolabs/oapp-evm/contracts/oapp/libs/OptionsBuilder.sol";
import {ETHManagement} from "./abstract/ETHManagement.sol";

/**
 * @title MarketLayerZeroBridge
 * @notice Bridge contract for Market side that:
 * 1. Submits settlements to UMA
 * 2. Tracks remote balances
 * 3. Processes verifications
 * 4. Receives and processes verifications
 */
contract MarketLayerZeroBridge is
    OApp,
    ReentrancyGuard,
    IMarketLayerZeroBridge,
    ETHManagement
{
    using Encoder for bytes;
    using BridgeTypes for BridgeTypes.BridgeConfig;
    using OptionsBuilder for bytes;

    // State variables
    BridgeTypes.BridgeConfig private bridgeConfig;
    mapping(address => bool) private enabledMarketGroups;
    mapping(address => mapping(address => uint256))
        private remoteSubmitterBalances; // submitter => bondToken => balance
    mapping(address => mapping(address => uint256))
        private remoteSubmitterWithdrawalIntent; // submitter => bondToken => amount

    mapping(uint256 => address) private assertionIdToMarketGroup; // assertionId => marketGroupAddress (where do we need to call the callback)
    uint256 private lastAssertionId; // Internal assertionId that is sent to UMA and to the marketGroup as bytes32

    // Constructor and initialization
    constructor(
        address _endpoint,
        address _owner
    ) OApp(_endpoint, _owner) ETHManagement(_owner) {}

    // Configuration functions
    function setBridgeConfig(
        BridgeTypes.BridgeConfig calldata _config
    ) external override onlyOwner {
        bridgeConfig = _config;
        emit BridgeConfigUpdated(_config);
    }

    function getBridgeConfig()
        external
        view
        override
        returns (BridgeTypes.BridgeConfig memory)
    {
        return bridgeConfig;
    }

    function enableMarketGroup(
        address marketGroup
    ) external override onlyOwner {
        enabledMarketGroups[marketGroup] = true;
    }

    function disableMarketGroup(
        address marketGroup
    ) external override onlyOwner {
        enabledMarketGroups[marketGroup] = false;
    }

    function isMarketGroupEnabled(
        address marketGroup
    ) external view override returns (bool) {
        return enabledMarketGroups[marketGroup];
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

        if (false) {
            // Do Nothing here, this is a placeholder to have better
        } else if (commandType == Encoder.CMD_FROM_ESCROW_DEPOSIT) {
            (address submitter, address bondToken, , uint256 deltaAmount) = data
                .decodeFromBalanceUpdate();
            remoteSubmitterBalances[submitter][bondToken] += deltaAmount;
            emit BondDeposited(submitter, bondToken, deltaAmount);
        } else if (commandType == Encoder.CMD_FROM_ESCROW_INTENT_TO_WITHDRAW) {
            (address submitter, address bondToken, , uint256 deltaAmount) = data
                .decodeFromBalanceUpdate();
            remoteSubmitterWithdrawalIntent[submitter][bondToken] = deltaAmount; // Only one intent per pair submitter/bond allowed at a time
            emit BondWithdrawn(submitter, bondToken, deltaAmount);
        } else if (commandType == Encoder.CMD_FROM_ESCROW_WITHDRAW) {
            (address submitter, address bondToken, , uint256 deltaAmount) = data
                .decodeFromBalanceUpdate();
            remoteSubmitterBalances[submitter][bondToken] -= deltaAmount;
            remoteSubmitterWithdrawalIntent[submitter][
                bondToken
            ] -= deltaAmount;
            emit BondWithdrawn(submitter, bondToken, deltaAmount);
        } else if (commandType == Encoder.CMD_FROM_UMA_RESOLVED_CALLBACK) {
            (uint256 assertionId, bool verified) = data.decodeFromUMAResolved();
            address marketGroup = assertionIdToMarketGroup[assertionId];
            IUMASettlementModule(marketGroup).assertionResolvedCallback(
                bytes32(assertionId),
                verified
            );
        } else if (commandType == Encoder.CMD_FROM_UMA_DISPUTED_CALLBACK) {
            uint256 assertionId = data.decodeFromUMADisputed();
            address marketGroup = assertionIdToMarketGroup[assertionId];
            IUMASettlementModule(marketGroup).assertionDisputedCallback(
                bytes32(assertionId)
            );
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

    function getRemoteSubmitterBalance(
        address submitter,
        address bondToken
    ) external view returns (uint256) {
        return remoteSubmitterBalances[submitter][bondToken];
    }

    function getRemoteSubmitterWithdrawalIntent(
        address submitter,
        address bondToken
    ) external view returns (uint256) {
        return remoteSubmitterWithdrawalIntent[submitter][bondToken];
    }

    // UMA Replacement Functions
    // Implement the functions to conform with OptimisticOracleV3Interface
    function forwardAssertTruth(
        address marketGroup,
        uint256 marketId,
        bytes memory claim,
        address asserter, // Notice, asserter is the address of the user that deposited the bond on the other side of the bridge (UMA Side)
        uint64 liveness,
        address currency,
        uint256 bond
    ) external returns (bytes32) {
        require(
            enabledMarketGroups[msg.sender],
            "Only enabled market groups can submit"
        );

        // Check if the asserter has enough bond
        require(
            remoteSubmitterBalances[asserter][currency] >=
                bond + remoteSubmitterWithdrawalIntent[asserter][currency],
            "Asserter does not have enough bond"
        );

        // Advance to next assertionId
        lastAssertionId++;

        // Make assertion data to UMA side via LayerZero
        bytes memory commandPayload = Encoder.encodeToUMAAssertTruth(
            lastAssertionId,
            asserter,
            liveness,
            address(currency),
            bond,
            claim
        );

        // Send the message with automatic fee calculation
        (
            MessagingReceipt memory receipt,
            MessagingFee memory fee
        ) = _sendLayerZeroMessageWithQuote(
                Encoder.CMD_TO_UMA_ASSERT_TRUTH,
                commandPayload,
                false
            );

        // Deduct the bond from the asserter
        remoteSubmitterBalances[asserter][currency] -= bond;

        // Store the assertionId to marketGroup mapping
        assertionIdToMarketGroup[lastAssertionId] = marketGroup;

        // Emit the assertion submitted event
        emit AssertionSubmitted(marketGroup, marketId, lastAssertionId);

        return bytes32(lastAssertionId);
    }
}
