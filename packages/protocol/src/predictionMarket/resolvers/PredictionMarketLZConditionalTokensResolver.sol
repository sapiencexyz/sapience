// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import {OAppReceiver, Origin} from "@layerzerolabs/oapp-evm/contracts/oapp/OAppReceiver.sol";
import {OAppCore} from "@layerzerolabs/oapp-evm/contracts/oapp/OAppCore.sol";
import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";
import {IPredictionMarketResolver} from "../interfaces/IPredictionMarketResolver.sol";
import {IPredictionMarketLZConditionalTokensResolver} from "./interfaces/IPredictionMarketLZConditionalTokensResolver.sol";
import {Encoder} from "../../bridge/cmdEncoder.sol";
import {BridgeTypes} from "../../bridge/BridgeTypes.sol";

/// @notice Minimal subset of Gnosis ConditionalTokens we need for resolution
interface IConditionalTokens {
    function payoutDenominator(bytes32 conditionId) external view returns (uint256);
    function payoutNumerators(bytes32 conditionId, uint256 index) external view returns (uint256);
}

/**
 * @title PredictionMarketLZConditionalTokensResolver
 * @notice Resolver that receives ConditionalTokens resolution data from Polygon via LayerZero
 * @dev Implements IPredictionMarketResolver and caches binary YES/NO outcomes for conditionIds.
 *      Receives resolution data from a Polygon contract that reads ConditionalTokens and sends
 *      payoutDenominator and payoutNumerators in a single message.
 */
contract PredictionMarketLZConditionalTokensResolver is
    OAppReceiver,
    IPredictionMarketLZConditionalTokensResolver
{
    using Encoder for bytes;
    using BridgeTypes for BridgeTypes.BridgeConfig;

    Settings public config;
    BridgeTypes.BridgeConfig private bridgeConfig;

    /// @dev Mapping from conditionId to its cached state
    mapping(bytes32 => ConditionState) public conditions;

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
        emit ConfigUpdated(_config.maxPredictionMarkets);
    }

    function setBridgeConfig(BridgeTypes.BridgeConfig calldata _bridgeConfig) external onlyOwner {
        bridgeConfig = _bridgeConfig;
        emit BridgeConfigUpdated(_bridgeConfig);
    }

    function getBridgeConfig() external view returns (BridgeTypes.BridgeConfig memory) {
        return bridgeConfig;
    }

    // ============ IPredictionMarketResolver Implementation ============
    
    /**
     * @notice Validate prediction markets (conditionIds)
     * @param encodedPredictedOutcomes ABI-encoded PredictedOutcome[]
     * @return isValid True if all conditionIds are valid
     * @return error Error code if validation fails
     */
    function validatePredictionMarkets(
        bytes calldata encodedPredictedOutcomes
    ) external view returns (bool isValid, Error error) {
        isValid = true;
        error = Error.NO_ERROR;
        
        PredictedOutcome[] memory predictedOutcomes = decodePredictionOutcomes(encodedPredictedOutcomes);

        if (predictedOutcomes.length == 0) revert MustHaveAtLeastOneMarket();
        if (predictedOutcomes.length > config.maxPredictionMarkets) revert TooManyMarkets();

        for (uint256 i = 0; i < predictedOutcomes.length; i++) {
            bytes32 conditionId = predictedOutcomes[i].marketId;
            if (conditionId == bytes32(0)) {
                isValid = false;
                error = Error.INVALID_MARKET;
                break;
            }
        }
        return (isValid, error);
    }

    /**
     * @notice Get prediction resolution status
     * @param encodedPredictedOutcomes ABI-encoded PredictedOutcome[]
     * @return isResolved True if all conditions are resolved
     * @return error Error code if resolution check fails
     * @return parlaySuccess True if all predictions match their resolved outcomes
     */
    function getPredictionResolution(
        bytes calldata encodedPredictedOutcomes
    ) external view returns (bool isResolved, Error error, bool parlaySuccess) {
        PredictedOutcome[] memory predictedOutcomes = decodePredictionOutcomes(encodedPredictedOutcomes);
        
        parlaySuccess = true;
        isResolved = true;
        error = Error.NO_ERROR;
        bool hasUnsettledConditions = false;

        if (predictedOutcomes.length == 0) {
            isResolved = false;
            error = Error.MUST_HAVE_AT_LEAST_ONE_MARKET;
            return (isResolved, error, parlaySuccess);
        }
        if (predictedOutcomes.length > config.maxPredictionMarkets) {
            isResolved = false;
            error = Error.TOO_MANY_MARKETS;
            return (isResolved, error, parlaySuccess);
        }

        for (uint256 i = 0; i < predictedOutcomes.length; i++) {
            bytes32 conditionId = predictedOutcomes[i].marketId;
            
            if (conditionId == bytes32(0)) {
                isResolved = false;
                error = Error.INVALID_MARKET;
                break;
            }
            
            ConditionState memory condition = conditions[conditionId];

            // Check if condition has been queried and cached
            if (condition.conditionId != conditionId) {
                // Not queried yet
                hasUnsettledConditions = true;
                continue;
            }

            // If marked invalid (non-binary), treat as unsettled
            if (condition.invalid) {
                hasUnsettledConditions = true;
                continue;
            }

            if (!condition.settled) {
                // Queried but not settled on remote chain
                hasUnsettledConditions = true;
                continue;
            }

            // Condition is settled - check if prediction matches outcome
            bool conditionOutcome = condition.resolvedToYes;
            if (predictedOutcomes[i].prediction != conditionOutcome) {
                parlaySuccess = false;
                // Decisive loss on settled condition - return immediately
                return (true, Error.NO_ERROR, parlaySuccess);
            }
        }

        if (isResolved && hasUnsettledConditions) {
            isResolved = false;
            error = Error.MARKET_NOT_SETTLED;
        }

        return (isResolved, error, parlaySuccess);
    }

    // ============ Prediction Outcomes Encoding/Decoding ============
    
    function encodePredictionOutcomes(
        PredictedOutcome[] calldata predictedOutcomes
    ) external pure returns (bytes memory) {
        return abi.encode(predictedOutcomes);
    }

    function decodePredictionOutcomes(
        bytes calldata encodedPredictedOutcomes
    ) public pure returns (PredictedOutcome[] memory) {
        return abi.decode(encodedPredictedOutcomes, (PredictedOutcome[]));
    }

    // ============ LayerZero Receive Handler ============
    
    /**
     * @dev Handle resolution response from Polygon contract
     * @param _origin Origin information including source chain and sender
     * @param _message Encoded resolution data (conditionId, payoutDenominator, noPayout, yesPayout)
     */
    function _lzReceive(
        Origin calldata _origin,
        bytes32,
        bytes calldata _message,
        address,
        bytes calldata
    ) internal override {
        // Validate source chain
        if (_origin.srcEid != bridgeConfig.remoteEid) {
            revert InvalidSourceChain(bridgeConfig.remoteEid, _origin.srcEid);
        }
        
        // Validate sender
        if (address(uint160(uint256(_origin.sender))) != bridgeConfig.remoteBridge) {
            revert InvalidSender(bridgeConfig.remoteBridge, address(uint160(uint256(_origin.sender))));
        }
        
        // Decode message
        (uint16 commandType, bytes memory data) = _message.decodeType();
        
        if (commandType != Encoder.CMD_FROM_CONDITIONAL_TOKEN_READER_RESOLUTION_RESPONSE) {
            revert InvalidCommandType(commandType);
        }
        
        // Decode resolution data
        (bytes32 conditionId, uint256 payoutDenominator, uint256 noPayout, uint256 yesPayout) =
            data.decodeFromConditionalTokenReaderResolutionResponse();
        
        // Finalize resolution
        _finalizeResolution(conditionId, payoutDenominator, noPayout, yesPayout);
    }

    /**
     * @dev Finalize resolution - never reverts, marks invalid state if non-binary
     */
    function _finalizeResolution(
        bytes32 conditionId,
        uint256 denom,
        uint256 noPayout,
        uint256 yesPayout
    ) internal {
        ConditionState storage condition = conditions[conditionId];
        
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
            emit ConditionResolved(conditionId, false, false, denom, noPayout, yesPayout, block.timestamp);
            return;
        }
        
        // Validate strict binary condition
        // For a strict binary: no + yes == denom AND no != yes
        if (noPayout + yesPayout != denom || noPayout == yesPayout) {
            // Not a strict binary outcome - mark as invalid, don't revert
            condition.settled = false;
            condition.invalid = true;
            emit ConditionResolved(conditionId, false, true, denom, noPayout, yesPayout, block.timestamp);
            return;
        }
        
        // Valid binary outcome
        condition.settled = true;
        condition.invalid = false;
        condition.resolvedToYes = yesPayout > noPayout;
        
        emit ConditionResolved(
            conditionId,
            condition.resolvedToYes,
            false,
            denom,
            noPayout,
            yesPayout,
            block.timestamp
        );
    }

    // ============ View Functions ============
    
    function getCondition(bytes32 conditionId) external view returns (ConditionState memory) {
        return conditions[conditionId];
    }

    function isConditionSettled(bytes32 conditionId) external view returns (bool) {
        return conditions[conditionId].settled;
    }

    function isConditionInvalid(bytes32 conditionId) external view returns (bool) {
        return conditions[conditionId].invalid;
    }

    function getConditionResolution(bytes32 conditionId) external view returns (bool resolvedToYes) {
        ConditionState memory condition = conditions[conditionId];
        require(condition.settled, "Condition not settled");
        return condition.resolvedToYes;
    }

}
