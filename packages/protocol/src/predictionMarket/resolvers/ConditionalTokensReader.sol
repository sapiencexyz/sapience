// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import {OAppSender, MessagingFee, MessagingReceipt} from "@layerzerolabs/oapp-evm/contracts/oapp/OAppSender.sol";
import {OAppCore} from "@layerzerolabs/oapp-evm/contracts/oapp/OAppCore.sol";
import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";
import {OptionsBuilder} from "@layerzerolabs/oapp-evm/contracts/oapp/libs/OptionsBuilder.sol";
import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import {Encoder} from "../../bridge/cmdEncoder.sol";
import {BridgeTypes} from "../../bridge/BridgeTypes.sol";
import {IConditionalTokensReader} from "./interfaces/IConditionalTokensReader.sol";

/// @notice Minimal subset of Gnosis ConditionalTokens we need for resolution
interface IConditionalTokens {
    function getOutcomeSlotCount(bytes32 conditionId) external view returns (uint256);
    function payoutDenominator(bytes32 conditionId) external view returns (uint256);
    function payoutNumerators(bytes32 conditionId, uint256 index) external view returns (uint256);
}

/**
 * @title ConditionalTokensReader
 * @notice Contract that reads ConditionalTokens and sends resolution data via LayerZero
 * @dev This contract receives conditionId requests, reads ConditionalTokens data, and sends
 *      the resolution (payoutDenominator, noPayout, yesPayout) back to the resolver contract.
 */
contract ConditionalTokensReader is
    OAppSender,
    ReentrancyGuard,
    IConditionalTokensReader
{
    using OptionsBuilder for bytes;
    using Encoder for bytes;
    using BridgeTypes for BridgeTypes.BridgeConfig;

    Settings public config;
    BridgeTypes.BridgeConfig private bridgeConfig;

    // ============ Constructor ============
    constructor(
        address _endpoint,
        address _owner,
        Settings memory _config
    ) OAppCore(_endpoint, _owner) Ownable(_owner) {
        config = _config;
    }

    // ============ Configuration Functions ============
    function setConfig(Settings calldata _config) external onlyOwner {
        config = _config;
        emit ConfigUpdated(_config.conditionalTokens);
    }

    function setBridgeConfig(BridgeTypes.BridgeConfig calldata _bridgeConfig) external onlyOwner {
        bridgeConfig = _bridgeConfig;
        emit BridgeConfigUpdated(_bridgeConfig);
    }

    function getBridgeConfig() external view returns (BridgeTypes.BridgeConfig memory) {
        return bridgeConfig;
    }

    // ============ Resolution Request ============
    
    /**
     * @notice Request resolution for a conditionId by reading ConditionalTokens and sending data back
     * @param conditionId The ConditionalTokens conditionId to query
     * @dev Reads payoutDenominator and payoutNumerators from ConditionalTokens and sends via lzSend
     */
    function requestResolution(bytes32 conditionId) external payable nonReentrant {
        if (conditionId == bytes32(0)) revert InvalidConditionId();

        // Read ConditionalTokens data
        ConditionData memory data = _readConditionData(conditionId);

        // Validate condition and resolved state and revert fast if invalid
        _validateConditionAndResolvedState(conditionId, data);

        // Encode resolution response
        bytes memory commandPayload = Encoder.encodeFromConditionalTokenReaderResolutionResponse(
            conditionId,
            data.payoutDenominator,
            data.noPayout,
            data.yesPayout
        );
        bytes memory message = abi.encode(Encoder.CMD_FROM_CONDITIONAL_TOKEN_READER_RESOLUTION_RESPONSE, commandPayload);
        
        // Build options - 200k gas should be enough for _lzReceive + _finalizeResolution
        bytes memory options = OptionsBuilder.newOptions().addExecutorLzReceiveOption(200000, 0);
        
        // Quote fee
        MessagingFee memory fee = _quote(bridgeConfig.remoteEid, message, options, false);
        
        // Only use msg.value, not contract balance
        if (msg.value < fee.nativeFee) {
            revert InsufficientETHForFee(fee.nativeFee, msg.value);
        }
        
        // Send message
        MessagingReceipt memory receipt = _lzSend(
            bridgeConfig.remoteEid,
            message,
            options,
            fee,
            payable(msg.sender) // Refund excess to sender
        );
        
        // Refund excess ETH if any
        if (msg.value > fee.nativeFee) {
            uint256 excess = msg.value - fee.nativeFee;
            (bool success, ) = payable(msg.sender).call{value: excess}("");
            require(success, "Refund failed");
        }
        
        emit ResolutionRequested(conditionId, receipt.guid, block.timestamp);
        emit ResolutionSent(conditionId, data.payoutDenominator, data.noPayout, data.yesPayout, receipt.guid, block.timestamp);
    }

    /**
     * @notice Quote the fee for a resolution request
     * @param conditionId The conditionId to query (used for message size estimation)
     * @return fee The MessagingFee required for the request
     */
    function quoteResolution(bytes32 conditionId) external view returns (MessagingFee memory fee) {
        // Encode resolution response (same as actual message)
        bytes memory commandPayload = Encoder.encodeFromConditionalTokenReaderResolutionResponse(
            conditionId,
            0, // Placeholder values for fee estimation
            0,
            0
        );
        bytes memory message = abi.encode(Encoder.CMD_FROM_CONDITIONAL_TOKEN_READER_RESOLUTION_RESPONSE, commandPayload);
        bytes memory options = OptionsBuilder.newOptions().addExecutorLzReceiveOption(200000, 0);
        return _quote(bridgeConfig.remoteEid, message, options, false);
    }

    /**
     * @notice Check if a condition can be requested for resolution
     * @param conditionId The ConditionalTokens conditionId to check
     * @return bool True if the condition is valid and resolved, false otherwise
     * @dev Returns true if all of the following are met:
     *      - Condition is binary (2 outcomes)
     *      - Condition is resolved (payoutDenominator > 0)
     *      - Payouts sum to denominator (noPayout + yesPayout == payoutDenominator)
     *      - Payouts are not equal (not a split)
     */
    function canRequestResolution(bytes32 conditionId) external view returns (bool) {
        if (conditionId == bytes32(0)) return false;

        ConditionData memory data = _readConditionData(conditionId);
        return _isConditionValidAndResolved(data);
    }

    // ============ ETH Management ============
    
    /**
     * @notice Withdraw ETH from the contract
     * @param amount Amount to withdraw
     */
    function withdrawETH(uint256 amount) external onlyOwner {
        if (amount > address(this).balance) {
            revert InsufficientBalance(amount, address(this).balance);
        }
        (bool success, ) = payable(owner()).call{value: amount}("");
        require(success, "ETH transfer failed");
    }

    /**
     * @notice Get current ETH balance
     */
    function getETHBalance() external view returns (uint256) {
        return address(this).balance;
    }

    /**
     * @notice Receive ETH
     */
    receive() external payable {}

    // ============ Internal Functions ============

    /**
     * @notice Read condition data from ConditionalTokens contract
     * @param conditionId The conditionId to read
     * @return ConditionData struct with all condition information
     * @dev Performs 4 external calls to ConditionalTokens contract
     */
    function _readConditionData(bytes32 conditionId) internal view returns (ConditionData memory) {
        return ConditionData({
            slotCount: IConditionalTokens(config.conditionalTokens).getOutcomeSlotCount(conditionId),
            payoutDenominator: IConditionalTokens(config.conditionalTokens).payoutDenominator(conditionId),
            noPayout: IConditionalTokens(config.conditionalTokens).payoutNumerators(conditionId, 0),
            yesPayout: IConditionalTokens(config.conditionalTokens).payoutNumerators(conditionId, 1)
        });
    }

    /**
     * @notice Check if condition data is valid and resolved without reverting
     * @param data ConditionData struct to validate
     * @return bool True if valid and resolved, false otherwise
     */
    function _isConditionValidAndResolved(ConditionData memory data) internal pure returns (bool) {
        if (data.slotCount != 2) return false;
        if (data.payoutDenominator == 0) return false;
        if (data.noPayout + data.yesPayout != data.payoutDenominator) return false;
        if (data.noPayout == data.yesPayout) return false;
        return true;
    }

    /**
     * @notice Validate condition and resolved state, reverts with specific error if invalid
     * @param conditionId The conditionId being validated
     * @param data ConditionData struct to validate
     */
    function _validateConditionAndResolvedState(bytes32 conditionId, ConditionData memory data) internal pure {
        if (data.slotCount != 2) revert ConditionIsNotBinary(conditionId);
        if (data.payoutDenominator == 0) revert ConditionNotResolved(conditionId);
        if (data.noPayout + data.yesPayout != data.payoutDenominator) revert InvalidPayout(conditionId);
        if (data.noPayout == data.yesPayout) revert InvalidPayout(conditionId);
    }
}


