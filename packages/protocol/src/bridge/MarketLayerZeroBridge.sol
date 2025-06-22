// SPDX-License-Identifier: UNLICENSED
pragma solidity ^0.8.22;

import {OApp, Origin, MessagingFee} from "@layerzerolabs/oapp-evm/contracts/oapp/OApp.sol";
import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import {ILayerZeroBridge} from "./interfaces/ILayerZeroBridge.sol";
import {IUMASettlementModule} from "../market/interfaces/IUMASettlementModule.sol";
import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";
import {IMarketLayerZeroBridge} from "./interfaces/ILayerZeroBridge.sol";
import {Encoder} from "./cmdEncoder.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {MessagingReceipt} from "@layerzerolabs/oapp-evm/contracts/oapp/OApp.sol";
import { BridgeTypes } from "./BridgeTypes.sol";

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
    IMarketLayerZeroBridge
{
    using Encoder for bytes;
    using BridgeTypes for BridgeTypes.BridgeConfig;
    
    // State variables
    BridgeTypes.BridgeConfig private bridgeConfig;
    mapping(address => bool) private enabledMarketGroups;
    mapping(address => mapping(address => uint256))
        private remoteSubmitterBalances; // submitter => bondToken => balance
    mapping(address => mapping(address => uint256))
        private remoteSubmitterWithdrawalIntent; // submitter => bondToken => amount

    mapping(uint256 => address) private assertionIdToMarketGroup; // assertionId => marketGroupAddress (where do we need to call the callback)
    uint256 private lastAssertionId; // Internal assertionId that is sent to UMA and to the marketGroup as bytes32

    mapping(address => mapping(uint256 => bytes32))
        private marketEpochToLocalId; // marketGroupAddress => marketId => localId
    // mapping(address => MarketBondConfig) private marketBondConfigs; // marketGroupAddress => config

    // Constants for gas monitoring
    uint256 public constant WARNING_GAS_THRESHOLD = 0.01 ether;
    uint256 public constant CRITICAL_GAS_THRESHOLD = 0.005 ether;

    // Constructor and initialization
    constructor(
        address _endpoint,
        address _owner
    ) OApp(_endpoint, _owner) Ownable(_owner) {}

    // Configuration functions
    function setBridgeConfig(BridgeTypes.BridgeConfig calldata _config) external onlyOwner {
        bridgeConfig = _config;
        emit BridgeConfigUpdated(_config);
    }

    function getBridgeConfig() external view returns (BridgeTypes.BridgeConfig memory) {
        return bridgeConfig;
    }

    function enableMarketGroup(address marketGroup) external onlyOwner {
        enabledMarketGroups[marketGroup] = true;
    }

    function disableMarketGroup(address marketGroup) external onlyOwner {
        enabledMarketGroups[marketGroup] = false;
    }

    function isMarketGroupEnabled(address marketGroup) external view returns (bool) {
        return enabledMarketGroups[marketGroup];
    }

    // ETH Management for fees
    function depositETH() external payable {
        // Anyone can deposit ETH to help pay for fees
        emit ETHDeposited(msg.sender, msg.value);
    }

    function withdrawETH(uint256 amount) external onlyOwner {
        require(amount <= address(this).balance, "Insufficient balance");
        payable(owner()).transfer(amount);
        emit ETHWithdrawn(owner(), amount);
        // Check gas thresholds after withdrawal
        _checkGasThresholds();
    }

    function getETHBalance() external view returns (uint256) {
        return address(this).balance;
    }

    // Helper function to check gas thresholds and emit alerts
    function _checkGasThresholds() internal {
        uint256 currentBalance = address(this).balance;
        
        if (currentBalance <= CRITICAL_GAS_THRESHOLD) {
            emit GasReserveCritical(currentBalance);
        } else if (currentBalance <= WARNING_GAS_THRESHOLD) {
            emit GasReserveLow(currentBalance);
        }
    }

    // LayerZero message handling
    function _lzReceive(
        Origin calldata _origin,
        bytes32 _guid,
        bytes calldata _message,
        address _executor,
        bytes calldata _extraData
    ) internal override {
        // Handle incoming messages from the UMA side
        (uint16 commandType, bytes memory data) = _message.decodeType();

        // TODO: Check the message is coming from the right source

        if (false) {
            // Do Nothing here, this is a placeholder to have better  
        } else if (
            commandType ==
            Encoder.CMD_FROM_ESCROW_DEPOSIT
        ) {
            (address submitter, address bondToken, uint256 finalAmount, uint256 deltaAmount) = data
                .decodeFromBalanceUpdate();
            remoteSubmitterBalances[submitter][bondToken] += deltaAmount;
            emit BondDeposited(submitter, bondToken, deltaAmount);
        } else if (
            commandType ==
            Encoder.CMD_FROM_ESCROW_INTENT_TO_WITHDRAW
        ) {
            (address submitter, address bondToken, uint256 finalAmount, uint256 deltaAmount) = data
                .decodeFromBalanceUpdate();
            remoteSubmitterWithdrawalIntent[submitter][bondToken] += deltaAmount;
            emit BondWithdrawn(submitter, bondToken, deltaAmount);
        } else if (
            commandType ==
            Encoder.CMD_FROM_ESCROW_WITHDRAW
        ) {
            (address submitter, address bondToken, uint256 finalAmount, uint256 deltaAmount) = data
                .decodeFromBalanceUpdate();
            remoteSubmitterBalances[submitter][bondToken] -= deltaAmount;
            remoteSubmitterWithdrawalIntent[submitter][bondToken] -= deltaAmount;
            emit BondWithdrawn(submitter, bondToken, deltaAmount);
        } else if (
            commandType ==
            Encoder.CMD_FROM_ESCROW_BOND_SENT
        ) {
            (address submitter, address bondToken, uint256 finalAmount, uint256 deltaAmount) = data
                .decodeFromBalanceUpdate();
            remoteSubmitterBalances[submitter][bondToken] -= deltaAmount;
        } else if (
            commandType ==
            Encoder.CMD_FROM_ESCROW_BOND_RECEIVED
        ) {
            (address submitter, address bondToken, uint256 finalAmount, uint256 deltaAmount) = data
                .decodeFromBalanceUpdate();
            remoteSubmitterBalances[submitter][bondToken] += deltaAmount;
        } else if (
            commandType ==
            Encoder.CMD_FROM_ESCROW_BOND_LOST_DISPUTE
        ) {
            (address submitter, address bondToken, uint256 finalAmount, uint256 deltaAmount) = data
                .decodeFromBalanceUpdate();
                // Do nothing, the amount was already decremented when the bond was sent
        } else if (
            commandType ==
            Encoder.CMD_FROM_UMA_RESOLVED_CALLBACK
        ) {
            (uint256 assertionId, bool verified) = data
                    .decodeFromUMAResolved();
                // Call the callback of the marketGroup to process the verification
        } else if (
            commandType ==
            Encoder.CMD_FROM_UMA_DISPUTED_CALLBACK
        ) {
            uint256 assertionId = data.decodeFromUMADisputed();
                // Call the callback of the marketGroup to process the verification
        } else {
            revert("Invalid command type");
        }
    }

    // Helper function to get LayerZero quote
    function getLayerZeroQuote(
        uint16 commandCode,
        bytes memory commandPayload
    ) external view returns (uint256 nativeFee, uint256 lzTokenFee) {
        bytes memory message = abi.encode(commandCode, commandPayload);
        
        MessagingFee memory fee = _quote(
            bridgeConfig.remoteChainId,
            message,
            bytes(""), // options
            false // payInLzToken
        );
        
        return (fee.nativeFee, fee.lzTokenFee);
    }

    // Helper function to send LayerZero messages with quote
    function _sendLayerZeroMessageWithQuote(
        uint16 commandCode,
        bytes memory commandPayload,
        address payable refundAddress
    ) internal returns (MessagingReceipt memory receipt) {
        bytes memory message = abi.encode(commandCode, commandPayload);
        
        // Get quote for the message
        MessagingFee memory fee = _quote(
            bridgeConfig.remoteChainId,
            message,
            bytes(""), // options
            false // payInLzToken
        );
        
        // Check if contract has enough ETH
        require(address(this).balance >= fee.nativeFee, "Insufficient ETH balance for fee");
        
        // Check gas thresholds and emit alerts before sending
        _checkGasThresholds();
        
        // Send the message with the quoted fee
        receipt = _lzSend(
            bridgeConfig.remoteChainId,
            message,
            bytes(""), // options
            fee,
            refundAddress
        );
        
        return receipt;
    }

    function getRemoteSubmitterBalance(
        address submitter,
        address bondToken
    ) external view returns (uint256) {
        return remoteSubmitterBalances[submitter][bondToken];
    }

    // UMA Replacement Functions
    // Implement the functions to conform with OptimisticOracleV3Interface
    function forwardAssertTruth(
        address marketGroup,
        uint256 marketId,
        bytes memory claim,
        address asserter,
        uint64 liveness,
        IERC20 currency,
        uint256 bond
    ) external returns (bytes32) {
        require(
            enabledMarketGroups[msg.sender],
            "Only enabled market groups can submit"
        );
        // TODO: check if we need to verify other stuff here

        // Advance to next assertionId
        lastAssertionId++;

        // Make assertion data to UMA side via LayerZero
        bytes memory commandPayload = Encoder.encodeToUMAAssertTruth(lastAssertionId, asserter, liveness, address(currency), bond, claim);
        
        // Send the message with automatic fee calculation
        MessagingReceipt memory receipt = _sendLayerZeroMessageWithQuote(
            Encoder.CMD_TO_UMA_ASSERT_TRUTH,
            commandPayload,
            payable(msg.sender)
        );

        // Store the assertionId to marketGroup mapping
        assertionIdToMarketGroup[lastAssertionId] = marketGroup;

        // Emit the assertion submitted event
        emit AssertionSubmitted(
            marketGroup,
            marketId,
            lastAssertionId
        );

        return bytes32(lastAssertionId);
    }
}
