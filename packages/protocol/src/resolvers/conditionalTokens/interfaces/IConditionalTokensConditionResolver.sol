// SPDX-License-Identifier: MIT
pragma solidity ^0.8.19;

import { IConditionResolver } from "../../../interfaces/IConditionResolver.sol";
import { LZTypes } from "../../shared/LZTypes.sol";

/// @title IConditionalTokensConditionResolver
/// @notice Interface for ConditionalTokens-based condition resolver (PM side)
/// @dev Receives resolution data from ConditionalTokensReader via LayerZero
interface IConditionalTokensConditionResolver is IConditionResolver {
    // ============ Structs ============

    struct ConditionState {
        bytes32 conditionId;
        bool settled;
        bool invalid; // True if condition has invalid payouts (no + yes != denom)
        bool nonDecisive; // True if condition resolved to a tie (no == yes)
        bool resolvedToYes;
        uint256 payoutDenominator;
        uint256 noPayout;
        uint256 yesPayout;
        uint64 updatedAt;
    }

    // ============ Events ============

    event ConditionResolutionDetail(
        bytes32 indexed conditionId,
        bool invalid,
        bool nonDecisive,
        bool resolvedToYes,
        uint256 payoutDenominator,
        uint256 noPayout,
        uint256 yesPayout,
        uint256 timestamp
    );

    event BridgeConfigUpdated(LZTypes.BridgeConfig config);

    // ============ Errors ============

    error InvalidSourceChain(uint32 expected, uint32 actual);
    error InvalidSender(address expected, address actual);
    error InvalidCommandType(uint16 commandType);
    error ConditionNotSettled(bytes32 conditionId);

    // ============ Functions ============

    function setBridgeConfig(LZTypes.BridgeConfig calldata config) external;
    function getBridgeConfig()
        external
        view
        returns (LZTypes.BridgeConfig memory);
    function getCondition(bytes32 conditionId)
        external
        view
        returns (ConditionState memory);
    function isConditionSettled(bytes32 conditionId)
        external
        view
        returns (bool);
    function isConditionInvalid(bytes32 conditionId)
        external
        view
        returns (bool);
}
