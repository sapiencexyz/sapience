// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import {MessagingFee} from "@layerzerolabs/oapp-evm/contracts/oapp/OApp.sol";
import {BridgeTypes} from "../../../bridge/BridgeTypes.sol";

/**
 * @title IConditionalTokensReader
 * @notice Interface for ConditionalTokensReader contract
 * @dev Reads ConditionalTokens data from Polygon and sends resolution via LayerZero
 */
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
        bytes32 indexed conditionId,
        bytes32 guid,
        uint256 timestamp
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
    event BridgeConfigUpdated(BridgeTypes.BridgeConfig bridgeConfig);

    // ============ Errors ============

    error InvalidConditionId();
    error InsufficientETHForFee(uint256 required, uint256 available);
    error InsufficientBalance(uint256 required, uint256 available);
    error ConditionIsNotBinary(bytes32 conditionId);
    error ConditionNotResolved(bytes32 conditionId);
    error InvalidPayout(bytes32 conditionId);

    // ============ Functions ============

    function setConfig(Settings calldata _config) external;

    function setBridgeConfig(BridgeTypes.BridgeConfig calldata _bridgeConfig) external;

    function getBridgeConfig() external view returns (BridgeTypes.BridgeConfig memory);

    function requestResolution(bytes32 conditionId) external payable;

    function quoteResolution(bytes32 conditionId) external view returns (MessagingFee memory fee);

    function canRequestResolution(bytes32 conditionId) external view returns (bool);

    function withdrawETH(uint256 amount) external;

    function getETHBalance() external view returns (uint256);
}
