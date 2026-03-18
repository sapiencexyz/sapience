// SPDX-License-Identifier: MIT
pragma solidity ^0.8.19;

import {
    OApp,
    Origin,
    MessagingFee
} from "@layerzerolabs/oapp-evm/contracts/oapp/OApp.sol";
import {
    ReentrancyGuard
} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import { ILZConditionResolver } from "./interfaces/ILZConditionResolver.sol";
import { IConditionResolver } from "../../interfaces/IConditionResolver.sol";
import { ConditionResolverBase } from "../ConditionResolverBase.sol";
import { IV2Types } from "../../interfaces/IV2Types.sol";
import { LZTypes } from "../shared/LZTypes.sol";
import { LZETHManagement } from "./LZETHManagement.sol";

/// @title LZConditionResolver
/// @notice LayerZero-based condition resolver for Prediction Market V2
/// @dev Receives resolution messages from UMA side via LayerZero and implements IConditionResolver
contract LZConditionResolver is
    OApp,
    ILZConditionResolver,
    ConditionResolverBase,
    ReentrancyGuard,
    LZETHManagement
{
    // ============ Constants ============
    uint16 private constant CMD_CONDITION_RESOLVED = 8;

    // ============ Errors ============
    error InvalidSourceChain(uint32 expected, uint32 actual);
    error InvalidSender(address expected, address actual);
    error InvalidCommandType(uint16 commandType);
    error ConditionAlreadySettled();

    // ============ Storage ============
    struct ConditionState {
        bytes32 conditionId;
        bool settled;
        bool resolvedToYes;
    }

    LZTypes.BridgeConfig private _bridgeConfig;
    mapping(bytes32 => ConditionState) public conditions;

    // ============ Constructor ============
    constructor(address _endpoint, address _owner)
        OApp(_endpoint, _owner)
        LZETHManagement(_owner)
    { }

    // ============ Configuration Functions ============

    /// @notice Set the bridge configuration for LayerZero communication
    /// @param config The bridge configuration with remote endpoint ID and bridge address
    function setBridgeConfig(LZTypes.BridgeConfig calldata config)
        external
        onlyOwner
    {
        _bridgeConfig = config;
        emit BridgeConfigUpdated(config);
    }

    /// @notice Get the current bridge configuration
    function getBridgeConfig()
        external
        view
        returns (LZTypes.BridgeConfig memory)
    {
        return _bridgeConfig;
    }

    // ============ IConditionResolver Implementation ============

    /// @inheritdoc IConditionResolver
    function isValidCondition(bytes calldata conditionId)
        external
        pure
        returns (bool)
    {
        if (conditionId.length != 32) return false;
        bytes32 rawId = bytes32(conditionId[:32]);
        return rawId != bytes32(0);
    }

    /// @inheritdoc IConditionResolver
    function getResolution(bytes calldata conditionId)
        external
        view
        returns (bool isResolved, IV2Types.OutcomeVector memory outcome)
    {
        bytes32 rawId = bytes32(conditionId[:32]);
        ConditionState memory condition = conditions[rawId];

        if (!condition.settled) {
            return (false, IV2Types.OutcomeVector(0, 0));
        }

        // YES = [1,0], NO = [0,1]
        if (condition.resolvedToYes) {
            return (true, IV2Types.OutcomeVector(1, 0));
        } else {
            return (true, IV2Types.OutcomeVector(0, 1));
        }
    }

    /// @inheritdoc IConditionResolver
    function getResolutions(bytes[] calldata conditionIds)
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
            bytes32 rawId = bytes32(conditionIds[i][:32]);
            ConditionState memory condition = conditions[rawId];

            if (condition.settled) {
                resolved[i] = true;
                if (condition.resolvedToYes) {
                    outcomes[i] = IV2Types.OutcomeVector(1, 0);
                } else {
                    outcomes[i] = IV2Types.OutcomeVector(0, 1);
                }
            } else {
                resolved[i] = false;
                outcomes[i] = IV2Types.OutcomeVector(0, 0);
            }
        }
    }

    /// @inheritdoc IConditionResolver
    function isFinalized(bytes calldata conditionId)
        external
        view
        returns (bool)
    {
        bytes32 rawId = bytes32(conditionId[:32]);
        return conditions[rawId].settled;
    }

    // ============ View Functions ============

    /// @notice Get the condition state
    /// @param conditionId The condition identifier
    /// @return settled Whether the condition has been settled
    /// @return resolvedToYes Whether the condition resolved to YES
    function getCondition(bytes32 conditionId)
        external
        view
        returns (bool settled, bool resolvedToYes)
    {
        ConditionState memory condition = conditions[conditionId];
        return (condition.settled, condition.resolvedToYes);
    }

    // ============ LayerZero Message Handling ============

    function _lzReceive(
        Origin calldata _origin,
        bytes32,
        bytes calldata _message,
        address,
        bytes calldata
    ) internal override {
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

        if (commandType == CMD_CONDITION_RESOLVED) {
            (bytes32 conditionId, bool resolvedToYes, bool assertedTruthfully) =
                abi.decode(data, (bytes32, bool, bool));
            _handleConditionResolved(
                conditionId, resolvedToYes, assertedTruthfully
            );
        } else {
            revert InvalidCommandType(commandType);
        }
    }

    // ============ Internal Functions ============

    function _handleConditionResolved(
        bytes32 conditionId,
        bool resolvedToYes,
        bool assertedTruthfully
    ) internal {
        ConditionState storage condition = conditions[conditionId];

        // Initialize if new
        if (condition.conditionId == bytes32(0)) {
            condition.conditionId = conditionId;
        }

        // Only settle if UMA confirmed the assertion as truthful
        if (assertedTruthfully) {
            if (condition.settled) {
                revert ConditionAlreadySettled();
            }
            condition.settled = true;
            condition.resolvedToYes = resolvedToYes;

            _emitResolved(
                abi.encode(conditionId),
                resolvedToYes
                    ? IV2Types.OutcomeVector(1, 0)
                    : IV2Types.OutcomeVector(0, 1)
            );
        }

        emit ConditionResolutionDetail(
            conditionId, resolvedToYes, assertedTruthfully, block.timestamp
        );
    }
}
