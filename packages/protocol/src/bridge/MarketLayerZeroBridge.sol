// SPDX-License-Identifier: UNLICENSED
pragma solidity ^0.8.22;

import {OApp, Origin, MessagingFee} from "@layerzerolabs/oapp-evm/contracts/oapp/OApp.sol";
import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import {ILayerZeroBridge} from "./interfaces/ILayerZeroBridge.sol";
import {IUMASettlementModule} from "../market/interfaces/IUMASettlementModule.sol";
import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";
import {IMarketLayerZeroBridge} from "./interfaces/ILayerZeroBridge.sol";
import {CommandEncodeDecode} from "./commandEncodeDecode.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";

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
    using CommandEncodeDecode for bytes;

    // State variables
    BridgeConfig private bridgeConfig;
    mapping(address => bool) private enabledMarketGroups;
    mapping(address => mapping(address => uint256))
        private remoteSubmitterBalances; // submitter => bondToken => balance
    mapping(address => mapping(address => uint256))
        private remoteSubmitterWithdrawalIntent; // submitter => bondToken => amount

    mapping(uint256 => address) private assertionIdToMarketGroup; // assertionId => marketGroupAddress (where do we need to call the callback)
    uint256 private lastAssertionId; // Internal assertionId that is sent to UMA and to the marketGroup as bytes32

    // mapping(address => RemoteBalance) public remoteBalances;
    // mapping(address => mapping(uint256 => bool)) public processedMarketEpochs;
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

    // Bridge Configuration Functions
    function setBridgeConfig(BridgeConfig calldata _config) external onlyOwner {
        bridgeConfig = _config;
        emit BridgeConfigUpdated(_config);
    }

    // Remote Balance Functions
    function getRemoteBalance(
        address submitter,
        address bondToken
    ) external view returns (uint256) {
        return remoteSubmitterBalances[submitter][bondToken];
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
        (uint16 commandType, bytes memory data) = _message.decodeCommandType();

        // TODO: Check the message is coming from the right source

        if (false) {
            // Do Nothing here, this is a placeholder to have better  
        } else if (
            commandType ==
            CommandEncodeDecode.COMMAND_TYPE_FORWARD_FROM_ESCROW_DEPOSIT
        ) {
            (address submitter, address bondToken, uint256 amount) = _message
                .decodeForwardFromEscrowDepositCommand();
            remoteSubmitterBalances[submitter][bondToken] += amount;
            emit BondDeposited(submitter, bondToken, amount);
        } else if (
            commandType ==
            CommandEncodeDecode
                .COMMAND_TYPE_FORWARD_FROM_ESCROW_INTENT_TO_WITHDRAW
        ) {
            (address submitter, address bondToken, uint256 amount) = _message
                .decodeForwardFromEscrowIntentToWithdrawCommand();
            remoteSubmitterWithdrawalIntent[submitter][bondToken] += amount;
            emit BondWithdrawn(submitter, bondToken, amount);
        } else if (
            commandType ==
            CommandEncodeDecode.COMMAND_TYPE_FORWARD_FROM_ESCROW_WITHDRAW
        ) {
            (address submitter, address bondToken, uint256 amount) = _message
                .decodeForwardFromEscrowWithdrawCommand();
            remoteSubmitterBalances[submitter][bondToken] -= amount;
            remoteSubmitterWithdrawalIntent[submitter][bondToken] -= amount;
            emit BondWithdrawn(submitter, bondToken, amount);
        } else if (
            commandType ==
            CommandEncodeDecode.COMMAND_TYPE_FORWARD_FROM_ESCROW_BOND_SENT
        ) {
            (address submitter, address bondToken, uint256 amount) = _message
                .decodeForwardFromEscrowBondSentCommand();
            remoteSubmitterBalances[submitter][bondToken] -= amount;
        } else if (
            commandType ==
            CommandEncodeDecode.COMMAND_TYPE_FORWARD_FROM_ESCROW_BOND_RECEIVED
        ) {
            (address submitter, address bondToken, uint256 amount) = _message
                .decodeForwardFromEscrowBondReceivedCommand();
            remoteSubmitterBalances[submitter][bondToken] += amount;
        } else if (
            commandType ==
            CommandEncodeDecode
                .COMMAND_TYPE_FORWARD_FROM_ESCROW_BOND_LOST_DISPUTE
        ) {
            (address submitter, address bondToken, uint256 amount) = _message
                .decodeForwardFromEscrowBondLostDisputeCommand();
                // Do nothing, the amount was already decremented when the bond was sent
        } else if (
            commandType ==
            CommandEncodeDecode.COMMAND_TYPE_FORWARD_FROM_UMA_VERIFICATION
        ) {
            (uint256 assertionId, bool verified) = _message
                .decodeForwardFromUMAVerificationCommand();
                // Call the callback of the marketGroup to process the verification
        } else if (
            commandType ==
            CommandEncodeDecode.COMMAND_TYPE_FORWARD_FROM_UMA_DISPUTE
        ) {
            uint256 assertionId = _message.decodeForwardFromUMADisputeCommand();
                // Call the callback of the marketGroup to process the verification
        } else {
            revert("Invalid command type");
        }
    }

    // Configuration functions

    function getRemoteBondBalance(
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
    ) external payable returns (bytes32) {
        require(
            enabledMarketGroups[msg.sender],
            "Only enabled market groups can submit"
        );
        // TODO: check if we need to verify other stuff here

        // Advance to next assertionId
        lastAssertionId++;
        uint256 assertionId = lastAssertionId;

        // Make assertion data to UMA side via LayerZero
        bytes memory commandPayload = abi.encode(assertionId, asserter, liveness, currency, bond, claim);
        bytes memory message = abi.encode(
            CommandEncodeDecode.COMMAND_TYPE_FORWARD_TO_UMA_ASSERT_TRUTH,
            commandPayload
        );

        // Send assertion data to UMA side via LayerZero
        // TODO: Check if we need to add more data to the _lzSend
        _lzSend(
            bridgeConfig.remoteChainId,
            message,
            bytes(""), // options
            MessagingFee(msg.value, 0),
            payable(msg.sender)
        );
       


        // Store the assertionId to marketGroup mapping
        assertionIdToMarketGroup[assertionId] = marketGroup;

        // Emit the assertion submitted event
        emit AssertionSubmitted(
            marketGroup,
            marketId,
            assertionId
        );

        return bytes32(assertionId);
    }

}
