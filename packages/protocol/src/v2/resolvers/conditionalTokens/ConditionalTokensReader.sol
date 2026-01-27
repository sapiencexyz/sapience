// SPDX-License-Identifier: MIT
pragma solidity ^0.8.19;

import {
    OAppSender,
    MessagingFee,
    MessagingReceipt
} from "@layerzerolabs/oapp-evm/contracts/oapp/OAppSender.sol";
import { OAppCore } from "@layerzerolabs/oapp-evm/contracts/oapp/OAppCore.sol";
import { Ownable } from "@openzeppelin/contracts/access/Ownable.sol";
import {
    OptionsBuilder
} from "@layerzerolabs/oapp-evm/contracts/oapp/libs/OptionsBuilder.sol";
import {
    ReentrancyGuard
} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import {
    IConditionalTokensReader
} from "./interfaces/IConditionalTokensReader.sol";
import { LZTypes } from "../shared/LZTypes.sol";

/// @notice Minimal subset of Gnosis ConditionalTokens needed for resolution
interface IConditionalTokens {
    function getOutcomeSlotCount(bytes32 conditionId)
        external
        view
        returns (uint256);
    function payoutDenominator(bytes32 conditionId)
        external
        view
        returns (uint256);
    function payoutNumerators(bytes32 conditionId, uint256 index)
        external
        view
        returns (uint256);
}

/// @title ConditionalTokensReader
/// @notice Reads ConditionalTokens data and sends resolution via LayerZero
/// @dev Deployed on Polygon, reads Gnosis ConditionalTokens and sends to PM side
contract ConditionalTokensReader is
    OAppSender,
    ReentrancyGuard,
    IConditionalTokensReader
{
    using OptionsBuilder for bytes;

    // ============ Constants ============
    uint16 private constant CMD_RESOLUTION_RESPONSE = 10;
    uint256 private constant YES_INDEX = 0;
    uint256 private constant NO_INDEX = 1;

    // ============ Storage ============
    Settings public config;
    LZTypes.BridgeConfig private _bridgeConfig;

    // ============ Constructor ============
    constructor(address endpoint_, address owner_, Settings memory config_)
        OAppCore(endpoint_, owner_)
        Ownable(owner_)
    {
        config = config_;
    }

    // ============ Configuration Functions ============

    /// @notice Set the configuration
    function setConfig(Settings calldata config_) external onlyOwner {
        config = config_;
        emit ConfigUpdated(config_.conditionalTokens);
    }

    /// @notice Set the bridge configuration
    function setBridgeConfig(LZTypes.BridgeConfig calldata bridgeConfig_)
        external
        onlyOwner
    {
        _bridgeConfig = bridgeConfig_;
        emit BridgeConfigUpdated(bridgeConfig_);
    }

    /// @notice Get the bridge configuration
    function getBridgeConfig()
        external
        view
        returns (LZTypes.BridgeConfig memory)
    {
        return _bridgeConfig;
    }

    // ============ Resolution Request ============

    /// @notice Request resolution for a conditionId
    /// @param conditionId The ConditionalTokens conditionId to query
    /// @dev Reads data from ConditionalTokens and sends via LayerZero
    function requestResolution(bytes32 conditionId)
        external
        payable
        nonReentrant
    {
        if (conditionId == bytes32(0)) revert InvalidConditionId();

        // Read ConditionalTokens data
        ConditionData memory data = _readConditionData(conditionId);

        // Validate condition and revert if invalid
        _validateConditionAndResolvedState(conditionId, data);

        // Encode resolution response
        bytes memory payload = abi.encode(
            conditionId, data.payoutDenominator, data.noPayout, data.yesPayout
        );
        bytes memory message = abi.encode(CMD_RESOLUTION_RESPONSE, payload);

        // Build options - 200k gas for lzReceive + _finalizeResolution
        bytes memory options =
            OptionsBuilder.newOptions().addExecutorLzReceiveOption(200_000, 0);

        // Quote fee
        MessagingFee memory fee =
            _quote(_bridgeConfig.remoteEid, message, options, false);

        // Check fee
        if (msg.value < fee.nativeFee) {
            revert InsufficientETHForFee(fee.nativeFee, msg.value);
        }

        // Send message
        MessagingReceipt memory receipt = _lzSend(
            _bridgeConfig.remoteEid,
            message,
            options,
            fee,
            payable(msg.sender) // Refund excess to sender
        );

        // Refund excess ETH if any
        if (msg.value > fee.nativeFee) {
            uint256 excess = msg.value - fee.nativeFee;
            (bool success,) = payable(msg.sender).call{ value: excess }("");
            if (!success) revert RefundFailed();
        }

        emit ResolutionRequested(conditionId, receipt.guid, block.timestamp);
        emit ResolutionSent(
            conditionId,
            data.payoutDenominator,
            data.noPayout,
            data.yesPayout,
            receipt.guid,
            block.timestamp
        );
    }

    /// @notice Quote the fee for a resolution request
    /// @param conditionId The conditionId (used for message size estimation)
    function quoteResolution(bytes32 conditionId)
        external
        view
        returns (MessagingFee memory fee)
    {
        bytes memory payload =
            abi.encode(conditionId, uint256(0), uint256(0), uint256(0));
        bytes memory message = abi.encode(CMD_RESOLUTION_RESPONSE, payload);
        bytes memory options =
            OptionsBuilder.newOptions().addExecutorLzReceiveOption(200_000, 0);
        return _quote(_bridgeConfig.remoteEid, message, options, false);
    }

    /// @notice Check if a condition can be requested for resolution
    /// @param conditionId The conditionId to check
    /// @return True if condition is valid, has 2 outcomes, and resolved
    function canRequestResolution(bytes32 conditionId)
        external
        view
        returns (bool)
    {
        if (conditionId == bytes32(0)) return false;
        ConditionData memory data = _readConditionData(conditionId);
        return _isConditionValidAndResolved(data);
    }

    /// @notice Get the resolution data for a condition
    /// @param conditionId The conditionId to read
    function getConditionResolution(bytes32 conditionId)
        external
        view
        returns (ConditionData memory)
    {
        return ConditionData({
            slotCount: IConditionalTokens(config.conditionalTokens)
                .getOutcomeSlotCount(conditionId),
            payoutDenominator: IConditionalTokens(config.conditionalTokens)
                .payoutDenominator(conditionId),
            noPayout: IConditionalTokens(config.conditionalTokens)
                .payoutNumerators(conditionId, NO_INDEX),
            yesPayout: IConditionalTokens(config.conditionalTokens)
                .payoutNumerators(conditionId, YES_INDEX)
        });
    }

    // ============ ETH Management ============

    /// @notice Withdraw ETH from the contract
    function withdrawETH(uint256 amount) external onlyOwner {
        if (amount > address(this).balance) {
            revert InsufficientBalance(amount, address(this).balance);
        }
        (bool success,) = payable(owner()).call{ value: amount }("");
        if (!success) revert ETHTransferFailed();
    }

    /// @notice Get current ETH balance
    function getETHBalance() external view returns (uint256) {
        return address(this).balance;
    }

    /// @notice Receive ETH
    receive() external payable { }

    // ============ Internal Functions ============

    function _readConditionData(bytes32 conditionId)
        internal
        view
        returns (ConditionData memory)
    {
        try this.getConditionResolution(conditionId) returns (
            ConditionData memory data
        ) {
            return data;
        } catch {
            return ConditionData({
                slotCount: 0, payoutDenominator: 0, noPayout: 0, yesPayout: 0
            });
        }
    }

    function _isConditionValidAndResolved(ConditionData memory data)
        internal
        pure
        returns (bool)
    {
        if (data.slotCount != 2) return false;
        if (data.payoutDenominator == 0) return false;
        if (data.noPayout + data.yesPayout != data.payoutDenominator) {
            return false;
        }
        return true;
    }

    function _validateConditionAndResolvedState(
        bytes32 conditionId,
        ConditionData memory data
    ) internal pure {
        if (data.slotCount != 2) {
            revert ConditionIsNotBinary(conditionId);
        }
        if (data.payoutDenominator == 0) {
            revert ConditionNotResolved(conditionId);
        }
        if (data.noPayout + data.yesPayout != data.payoutDenominator) {
            revert InvalidPayout(conditionId);
        }
    }
}
