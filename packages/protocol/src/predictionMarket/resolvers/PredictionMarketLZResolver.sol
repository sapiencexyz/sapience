// SPDX-License-Identifier: MIT
pragma solidity ^0.8.19;

import {OApp, Origin, MessagingFee} from "@layerzerolabs/oapp-evm/contracts/oapp/OApp.sol";
import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import {IPredictionMarketLZResolver} from "./interfaces/IPredictionMarketLZResolver.sol";
import {Encoder} from "../../bridge/cmdEncoder.sol";
import {BridgeTypes} from "../../bridge/BridgeTypes.sol";
import {OptionsBuilder} from "@layerzerolabs/oapp-evm/contracts/oapp/libs/OptionsBuilder.sol";
import {ETHManagement} from "../../bridge/abstract/ETHManagement.sol";

/**
 * @title PredictionMarketLZResolver
 * @notice Simplified LayerZero-based resolver contract for Prediction Market system
 * @dev This contract only receives resolution messages from UMA side via LayerZero
 */
contract PredictionMarketLZResolver is
    OApp,
    IPredictionMarketLZResolver,
    ReentrancyGuard,
    ETHManagement
{
    using Encoder for bytes;
    using BridgeTypes for BridgeTypes.BridgeConfig;
    using OptionsBuilder for bytes;

    // ============ Custom Errors ============
    error MustHaveAtLeastOneMarket();
    error TooManyMarkets();
    error InvalidSourceChain(uint32 expectedEid, uint32 actualEid);
    error InvalidSender(address expectedBridge, address actualSender);
    error InvalidCommandType(uint16 commandType);
    error MarketAlreadySettled();

    // ============ Settings ============
    struct Settings {
        uint256 maxPredictionMarkets;
    }

    Settings public config;
    BridgeTypes.BridgeConfig private bridgeConfig;

    // ============ UMA Market Resolver Structs ============
    struct WrappedMarket {
        // Identification
        bytes32 marketId;
        // State
        bool settled;
        bool resolvedToYes;
    }

    struct PredictedOutcome {
        bytes32 marketId;
        bool prediction; // true for YES, false for NO
    }

    mapping(bytes32 => WrappedMarket) public wrappedMarkets;

    constructor(
        address _endpoint,
        address _owner,
        Settings memory _config
    ) OApp(_endpoint, _owner) ETHManagement(_owner) {
        config = _config;
    }

    // ============ Configuration Functions ============
    function setBridgeConfig(BridgeTypes.BridgeConfig calldata _bridgeConfig) external onlyOwner {
        bridgeConfig = _bridgeConfig;
    }

    function getBridgeConfig() external view returns (BridgeTypes.BridgeConfig memory) {
        return bridgeConfig;
    }

    function setConfig(Settings calldata _config) external onlyOwner {
        config = _config;
    }

    // ============ Resolver Functions ============
    function validatePredictionMarkets(
        bytes calldata encodedPredictedOutcomes
    ) external view returns (bool isValid, Error error) {
        isValid = true;
        error = Error.NO_ERROR;
        PredictedOutcome[] memory predictedOutcomes = decodePredictionOutcomes(
            encodedPredictedOutcomes
        );

        if (predictedOutcomes.length == 0) revert MustHaveAtLeastOneMarket();
        if (predictedOutcomes.length > config.maxPredictionMarkets)
            revert TooManyMarkets();

        for (uint256 i = 0; i < predictedOutcomes.length; i++) {
            bytes32 currentMarketId = predictedOutcomes[i].marketId;
            if (currentMarketId == bytes32(0)) {
                isValid = false;
                error = Error.INVALID_MARKET;
                break;
            }
        }
        return (isValid, error);
    }

    function getPredictionResolution(
        bytes calldata encodedPredictedOutcomes
    ) external view returns (bool isResolved, Error error, bool parlaySuccess) {
        PredictedOutcome[] memory predictedOutcomes = decodePredictionOutcomes(
            encodedPredictedOutcomes
        );
        parlaySuccess = true;
        isResolved = true;
        error = Error.NO_ERROR;
        bool hasUnsettledMarkets = false;

        if (predictedOutcomes.length == 0) {
            isResolved = false;
            error = Error.MUST_HAVE_AT_LEAST_ONE_MARKET;
            return (isResolved, error, parlaySuccess);
        }
        if (predictedOutcomes.length > config.maxPredictionMarkets)
        {
            isResolved = false;
            error = Error.TOO_MANY_MARKETS;
            return (isResolved, error, parlaySuccess);
        }

        for (uint256 i = 0; i < predictedOutcomes.length; i++) {
            bytes32 marketId = predictedOutcomes[i].marketId;
            if (marketId == bytes32(0)) {
                isResolved = false;
                error = Error.INVALID_MARKET;
                break;
            }
            WrappedMarket memory market = wrappedMarkets[marketId];

            if (market.marketId != marketId) {
                // This means it wasn't wrapped yet, so we don't know if it's settled or not.
                hasUnsettledMarkets = true;
                continue;
            }

            if (!market.settled) {
                hasUnsettledMarkets = true;
                continue;
            }

            bool marketOutcome = market.resolvedToYes;

            if (predictedOutcomes[i].prediction != marketOutcome) {
                parlaySuccess = false;
                return (true, Error.NO_ERROR, parlaySuccess);
            }
        }

        if (isResolved && hasUnsettledMarkets) {
            isResolved = false;
            error = Error.MARKET_NOT_SETTLED;
        }

        return (isResolved, error, parlaySuccess);
    }

    // ============ Prediction Outcomes Encoding and Decoding Functions ============
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

    // ============ LayerZero Message Handling ============
    function _lzReceive(Origin calldata _origin, bytes32, bytes calldata _message, address, bytes calldata)
        internal
        override
    {
        if (_origin.srcEid != bridgeConfig.remoteEid) {
            revert InvalidSourceChain(bridgeConfig.remoteEid, _origin.srcEid);
        }
        if (address(uint160(uint256(_origin.sender))) != bridgeConfig.remoteBridge) {
            revert InvalidSender(bridgeConfig.remoteBridge, address(uint160(uint256(_origin.sender))));
        }

        // Handle incoming messages from the UMA side
        (uint16 commandType, bytes memory data) = _message.decodeType();

        if (commandType == Encoder.CMD_FROM_UMA_MARKET_RESOLVED) {
            (bytes32 marketId, bool resolvedToYes, bool assertedTruthfully) = 
                data.decodeFromUMAMarketResolved();
            marketResolvedCallback(marketId, resolvedToYes, assertedTruthfully);
        } else {
            revert InvalidCommandType(commandType);
        }
    }

    // ============ internal UMA Callback Functions ============
    function marketResolvedCallback(
        bytes32 marketId,
        bool resolvedToYes,
        bool assertedTruthfully
    ) internal {
        // Create or update the wrapped market
        WrappedMarket storage market = wrappedMarkets[marketId];
        if (market.marketId == bytes32(0)) {
            // Market not wrapped yet, create it
            market.marketId = marketId;
        }

        if (assertedTruthfully) { // checking it just in case, the counterpart shouldn't send false, but if the implementation changes this protect setting the wrong values
            if(market.settled) {
                // This should never happen, but if we reached this point it means the counterpart re-sent a assertedTruthfully message for an already settled market. So, something was missconfigred or changed on the other side.
                revert MarketAlreadySettled();
            }
            market.settled = true;
            market.resolvedToYes = resolvedToYes;
        }

        emit MarketResolved(
            marketId,
            resolvedToYes,
            assertedTruthfully,
            block.timestamp
        );
    }

    // No disputed callback required on PM side per current interface

    // ============ View Functions ============
    function getMarket(bytes32 marketId) external view returns (WrappedMarket memory) {
        return wrappedMarkets[marketId];
    }

    function isMarketSettled(bytes32 marketId) external view returns (bool) {
        return wrappedMarkets[marketId].settled;
    }

    function getMarketResolution(bytes32 marketId) external view returns (bool resolvedToYes) {
        WrappedMarket memory market = wrappedMarkets[marketId];
        require(market.settled, "Market not settled");
        return market.resolvedToYes;
    }
}
