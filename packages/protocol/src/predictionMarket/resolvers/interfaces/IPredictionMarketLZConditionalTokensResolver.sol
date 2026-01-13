// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import {IPredictionMarketResolver} from "../../interfaces/IPredictionMarketResolver.sol";
import {BridgeTypes} from "../../../bridge/BridgeTypes.sol";

/**
 * @title IPredictionMarketLZConditionalTokensResolver
 * @notice Interface for PredictionMarketLZConditionalTokensResolver contract
 * @dev Resolver that receives ConditionalTokens resolution data from Polygon via LayerZero
 */
interface IPredictionMarketLZConditionalTokensResolver is IPredictionMarketResolver {
    // ============ Structs ============

    struct Settings {
        uint256 maxPredictionMarkets;
    }

    struct ConditionState {
        bytes32 conditionId;
        bool settled;
        bool resolvedToYes;
        bool invalid;
        uint256 payoutDenominator;
        uint256 noPayout;
        uint256 yesPayout;
        uint64 updatedAt;
    }

    struct PredictedOutcome {
        bytes32 marketId;
        bool prediction;
    }

    // ============ Events ============

    event ConditionResolved(
        bytes32 indexed conditionId,
        bool resolvedToYes,
        bool invalid,
        uint256 payoutDenominator,
        uint256 noPayout,
        uint256 yesPayout,
        uint256 timestamp
    );

    event ConfigUpdated(uint256 maxPredictionMarkets);
    event BridgeConfigUpdated(BridgeTypes.BridgeConfig bridgeConfig);

    // ============ Errors ============

    error MustHaveAtLeastOneMarket();
    error TooManyMarkets();
    error InvalidSourceChain(uint32 expectedEid, uint32 actualEid);
    error InvalidSender(address expectedBridge, address actualSender);
    error InvalidCommandType(uint16 commandType);

    // ============ Functions ============

    function setConfig(Settings calldata _config) external;

    function setBridgeConfig(BridgeTypes.BridgeConfig calldata _bridgeConfig) external;

    function getBridgeConfig() external view returns (BridgeTypes.BridgeConfig memory);

    function getCondition(bytes32 conditionId) external view returns (ConditionState memory);

    function isConditionSettled(bytes32 conditionId) external view returns (bool);

    function isConditionInvalid(bytes32 conditionId) external view returns (bool);

    function getConditionResolution(bytes32 conditionId) external view returns (bool resolvedToYes);
}
