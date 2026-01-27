// SPDX-License-Identifier: MIT
pragma solidity ^0.8.19;

import { MessagingFee } from "@layerzerolabs/oapp-evm/contracts/oapp/OApp.sol";
import { LZTypes } from "../../shared/LZTypes.sol";

/// @title IConditionalTokensReader
/// @notice Interface for ConditionalTokensReader (Polygon side)
/// @dev Reads Gnosis ConditionalTokens data and sends resolution via LayerZero
interface IConditionalTokensReader {
    // ============ Structs ============

    struct Settings {
        address conditionalTokens;
    }

    struct ConditionData {
        uint256 slotCount;
        uint256 payoutDenominator;
        uint256 noPayout;
        uint256 yesPayout;
    }

    // ============ Events ============

    event ResolutionRequested(
        bytes32 indexed conditionId, bytes32 guid, uint256 timestamp
    );

    event ResolutionSent(
        bytes32 indexed conditionId,
        uint256 payoutDenominator,
        uint256 noPayout,
        uint256 yesPayout,
        bytes32 guid,
        uint256 timestamp
    );

    event ConfigUpdated(address conditionalTokens);
    event BridgeConfigUpdated(LZTypes.BridgeConfig config);

    // ============ Errors ============

    error InvalidConditionId();
    error InsufficientETHForFee(uint256 required, uint256 available);
    error InsufficientBalance(uint256 required, uint256 available);
    error ConditionIsNotBinary(bytes32 conditionId);
    error ConditionNotResolved(bytes32 conditionId);
    error InvalidPayout(bytes32 conditionId);
    error RefundFailed();
    error ETHTransferFailed();

    // ============ Functions ============

    function setConfig(Settings calldata config) external;
    function setBridgeConfig(LZTypes.BridgeConfig calldata config) external;
    function getBridgeConfig()
        external
        view
        returns (LZTypes.BridgeConfig memory);
    function requestResolution(bytes32 conditionId) external payable;
    function quoteResolution(bytes32 conditionId)
        external
        view
        returns (MessagingFee memory fee);
    function canRequestResolution(bytes32 conditionId)
        external
        view
        returns (bool);
    function getConditionResolution(bytes32 conditionId)
        external
        view
        returns (ConditionData memory);
    function withdrawETH(uint256 amount) external;
    function getETHBalance() external view returns (uint256);
}
