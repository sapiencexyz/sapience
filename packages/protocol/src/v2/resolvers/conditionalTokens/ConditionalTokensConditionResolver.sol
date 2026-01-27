// SPDX-License-Identifier: MIT
pragma solidity ^0.8.19;

import {
    OAppReceiver,
    Origin
} from "@layerzerolabs/oapp-evm/contracts/oapp/OAppReceiver.sol";
import { OAppCore } from "@layerzerolabs/oapp-evm/contracts/oapp/OAppCore.sol";
import { Ownable } from "@openzeppelin/contracts/access/Ownable.sol";
import {
    ReentrancyGuard
} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import {
    IConditionalTokensConditionResolver
} from "./interfaces/IConditionalTokensConditionResolver.sol";
import { IConditionResolver } from "../../interfaces/IConditionResolver.sol";
import { IV2Types } from "../../interfaces/IV2Types.sol";
import { LZTypes } from "../lz-uma/LZTypes.sol";

/// @title ConditionalTokensConditionResolver
/// @notice Resolver that receives ConditionalTokens resolution data via LayerZero
/// @dev Implements IConditionResolver and caches binary YES/NO outcomes for conditionIds.
///      Receives resolution data from ConditionalTokensReader on Polygon.
contract ConditionalTokensConditionResolver is
    OAppReceiver,
    ReentrancyGuard,
    IConditionalTokensConditionResolver
{
    // ============ Constants ============
    uint16 private constant CMD_RESOLUTION_RESPONSE = 10;

    // ============ Storage ============
    LZTypes.BridgeConfig private _bridgeConfig;
    mapping(bytes32 => ConditionState) public conditions;

    // ============ Constructor ============
    constructor(address endpoint_, address owner_)
        OAppCore(endpoint_, owner_)
        Ownable(owner_)
    { }

    // ============ Configuration Functions ============

    /// @notice Set the bridge configuration
    function setBridgeConfig(LZTypes.BridgeConfig calldata config)
        external
        onlyOwner
    {
        _bridgeConfig = config;
        emit BridgeConfigUpdated(config);
    }

    /// @notice Get the bridge configuration
    function getBridgeConfig()
        external
        view
        returns (LZTypes.BridgeConfig memory)
    {
        return _bridgeConfig;
    }

    // ============ IConditionResolver Implementation ============

    /// @inheritdoc IConditionResolver
    function isValidCondition(bytes32 conditionId)
        external
        pure
        returns (bool)
    {
        return conditionId != bytes32(0);
    }

    /// @inheritdoc IConditionResolver
    function getResolution(bytes32 conditionId)
        external
        view
        returns (bool isResolved, IV2Types.OutcomeVector memory outcome)
    {
        return _getResolution(conditions[conditionId]);
    }

    /// @inheritdoc IConditionResolver
    function getResolutions(bytes32[] calldata conditionIds)
        external
        view
        returns (
            bool[] memory resolved,
            IV2Types.OutcomeVector[] memory outcomes
        )
    {
        uint256 length = conditionIds.length;
        resolved = new bool[](length);
        outcomes = new IV2Types.OutcomeVector[](length);

        for (uint256 i = 0; i < length; i++) {
            (resolved[i], outcomes[i]) =
                _getResolution(conditions[conditionIds[i]]);
        }
    }

    /// @inheritdoc IConditionResolver
    function isFinalized(bytes32 conditionId) external view returns (bool) {
        ConditionState memory condition = conditions[conditionId];
        return condition.settled && !condition.invalid;
    }

    // ============ View Functions ============

    /// @notice Get the full condition state
    function getCondition(bytes32 conditionId)
        external
        view
        returns (ConditionState memory)
    {
        return conditions[conditionId];
    }

    /// @notice Check if a condition is settled
    function isConditionSettled(bytes32 conditionId)
        external
        view
        returns (bool)
    {
        return conditions[conditionId].settled;
    }

    /// @notice Check if a condition is invalid (non-binary)
    function isConditionInvalid(bytes32 conditionId)
        external
        view
        returns (bool)
    {
        return conditions[conditionId].invalid;
    }

    // ============ LayerZero Receive Handler ============

    function _lzReceive(
        Origin calldata _origin,
        bytes32,
        bytes calldata _message,
        address,
        bytes calldata
    ) internal override nonReentrant {
        // Validate source chain
        if (_origin.srcEid != _bridgeConfig.remoteEid) {
            revert InvalidSourceChain(_bridgeConfig.remoteEid, _origin.srcEid);
        }

        // Validate sender
        address sender = address(uint160(uint256(_origin.sender)));
        if (sender != _bridgeConfig.remoteBridge) {
            revert InvalidSender(_bridgeConfig.remoteBridge, sender);
        }

        // Decode message
        (uint16 commandType, bytes memory data) =
            abi.decode(_message, (uint16, bytes));

        if (commandType != CMD_RESOLUTION_RESPONSE) {
            revert InvalidCommandType(commandType);
        }

        // Decode resolution data
        (
            bytes32 conditionId,
            uint256 payoutDenominator,
            uint256 noPayout,
            uint256 yesPayout
        ) = abi.decode(data, (bytes32, uint256, uint256, uint256));

        // Finalize resolution
        _finalizeResolution(conditionId, payoutDenominator, noPayout, yesPayout);
    }

    // ============ Internal Functions ============

    /// @dev Get resolution for a condition state
    function _getResolution(ConditionState memory condition)
        internal
        pure
        returns (bool isResolved, IV2Types.OutcomeVector memory outcome)
    {
        // Not resolved if: not settled, or marked as invalid
        if (!condition.settled || condition.invalid) {
            return (false, IV2Types.OutcomeVector(0, 0));
        }

        // Non-decisive (tie) = [1,1]
        if (condition.nonDecisive) {
            return (true, IV2Types.OutcomeVector(1, 1));
        }

        // YES = [1,0], NO = [0,1]
        if (condition.resolvedToYes) {
            return (true, IV2Types.OutcomeVector(1, 0));
        } else {
            return (true, IV2Types.OutcomeVector(0, 1));
        }
    }

    /// @dev Finalize resolution - never reverts, marks invalid state if payouts don't sum to denom
    function _finalizeResolution(
        bytes32 conditionId,
        uint256 denom,
        uint256 noPayout,
        uint256 yesPayout
    ) internal {
        ConditionState storage condition = conditions[conditionId];

        // Prevent overwriting already-settled conditions
        if (condition.settled) {
            return;
        }

        // Initialize if first time
        if (condition.conditionId == bytes32(0)) {
            condition.conditionId = conditionId;
        }

        // Store raw values for transparency
        condition.payoutDenominator = denom;
        condition.noPayout = noPayout;
        condition.yesPayout = yesPayout;
        condition.updatedAt = uint64(block.timestamp);

        // Check if resolved (denom > 0)
        if (denom == 0) {
            // Not resolved yet on the remote chain
            condition.settled = false;
            condition.invalid = false;
            condition.nonDecisive = false;
            emit ConditionResolved(
                conditionId,
                false,
                false,
                false,
                denom,
                noPayout,
                yesPayout,
                block.timestamp
            );
            return;
        }

        // Validate payouts sum to denominator
        if (noPayout + yesPayout != denom) {
            // Invalid payouts - mark as invalid, don't revert
            condition.settled = false;
            condition.invalid = true;
            condition.nonDecisive = false;
            emit ConditionResolved(
                conditionId,
                true,
                false,
                false,
                denom,
                noPayout,
                yesPayout,
                block.timestamp
            );
            return;
        }

        // Check for tie (non-decisive)
        if (noPayout == yesPayout) {
            condition.settled = true;
            condition.invalid = false;
            condition.nonDecisive = true;
            condition.resolvedToYes = false;
            emit ConditionResolved(
                conditionId,
                false,
                true,
                false,
                denom,
                noPayout,
                yesPayout,
                block.timestamp
            );
            return;
        }

        // Valid binary outcome
        condition.settled = true;
        condition.invalid = false;
        condition.nonDecisive = false;
        condition.resolvedToYes = yesPayout > noPayout;

        emit ConditionResolved(
            conditionId,
            false,
            false,
            condition.resolvedToYes,
            denom,
            noPayout,
            yesPayout,
            block.timestamp
        );
    }
}
