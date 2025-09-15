// SPDX-License-Identifier: MIT
pragma solidity ^0.8.19;

import "../interfaces/IPredictionMarketResolver.sol";
import { OptimisticOracleV3Interface } from "@uma/core/contracts/optimistic-oracle-v3/interfaces/OptimisticOracleV3Interface.sol";
import { OptimisticOracleV3CallbackRecipientInterface } from "@uma/core/contracts/optimistic-oracle-v3/interfaces/OptimisticOracleV3CallbackRecipientInterface.sol";
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/utils/ReentrancyGuard.sol";

/**
 * @title PredictionMarketUmaResolver
 * @notice UMAResolver contract for Prediction Market system
 */
contract PredictionMarketUmaResolver is IPredictionMarketResolver, OptimisticOracleV3CallbackRecipientInterface, ReentrancyGuard {
    using SafeERC20 for IERC20;

    // ============ Custom Errors ============
    error MustHaveAtLeastOneMarket();
    error TooManyMarkets();
    error InvalidMarketId();
    error MarketNotSettled();
    error MarketAlreadyWrapped();
    error AssertionAlreadySubmitted();
    error InvalidAssertionId();
    error OnlyApprovedAssertersCanCall();
    error OnlyOptimisticOracleV3CanCall();
    error InvalidCaller();
    error MarketAlreadySettled();
    error MarketNotOpen();
    error MarketNotEnded();
    error MarketNotDisputed();
    error NotEnoughBondAmount(address sender, address bondCurrency, uint256 bondAmount, uint256 finalBalance);

    // ============ Events ============
    event MarketWrapped(address wrapper, bytes32 marketId, bytes claim, uint256 endTime, uint256 wrapTime);
    event AssertionSubmitted(address asserter, bytes32 marketId, bytes32 assertionId, bool resolvedToYes, uint256 submissionTime);
    event AssertionDisputed(bytes32 marketId, bytes32 assertionId, uint256 disputeTime);
    event AssertionResolved(bytes32 marketId, bytes32 assertionId, bool resolvedToYes, bool assertedTruthfully, uint256 resolutionTime);

    // ============ Settings ============   
    struct Settings {
        uint256 maxPredictionMarkets;
        address optimisticOracleV3;
        address bondCurrency;
        uint256 bondAmount;
        uint64 assertionLiveness;
    }

    Settings public config;

    mapping(address => bool) public approvedAsserters;

    constructor(Settings memory _config, address[] memory _approvedAsserters) {
        config = _config;
        for (uint256 i = 0; i < _approvedAsserters.length; i++) {
            approvedAsserters[_approvedAsserters[i]] = true;
        }
    }

    // ============ UMA Market Resolver Structs ============
    struct WrappedMarket{
        // Identification
        bytes32 marketId;
        // bytes claim; // implicitly encoded in the marketId
        // uint256 endTime; // implicitly encoded in the marketId
        // State
        bool assertionSubmitted;
        bool settled;
        bool resolvedToYes;
        // UMA
        bytes32 assertionId;
    }

    struct PredictedOutcome {
        bytes32 marketId;
        bool prediction; // true for YES, false for NO
    }

    mapping(bytes32 => WrappedMarket) public wrappedMarkets;

    // ============ Events ============
    struct UMASettlement {
        // Link to market
        bytes32 marketId;
        // Resolution Value
        bool resolvedToYes;
        uint256 submissionTime;
        // Resolution Status
        bool settled;
    }

    mapping(bytes32 => UMASettlement) public umaSettlements;


    // ============ Resolver Functions ============
    function validatePredictionMarkets(
        bytes calldata encodedPredictedOutcomes
    ) external view returns (bool isValid, Error error) {
        isValid = true;
        error = Error.NO_ERROR;
        PredictedOutcome[] memory predictedOutcomes = decodePredictionOutcomes(encodedPredictedOutcomes);

        if (predictedOutcomes.length == 0) revert MustHaveAtLeastOneMarket();
        if (predictedOutcomes.length > config.maxPredictionMarkets) revert TooManyMarkets();

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

    function resolvePrediction(
        bytes calldata encodedPredictedOutcomes
    ) external view returns (bool isValid, Error error, bool makerWon) {
        PredictedOutcome[] memory predictedOutcomes = decodePredictionOutcomes(encodedPredictedOutcomes);
        makerWon = true;
        isValid = true;
        error = Error.NO_ERROR;

        for (uint256 i = 0; i < predictedOutcomes.length; i++) {
            bytes32 marketId = predictedOutcomes[i].marketId;
            if (marketId == bytes32(0)) {
                isValid = false;
                error = Error.INVALID_MARKET;
                break;
            }
            WrappedMarket memory market = wrappedMarkets[marketId];

            if (market.marketId != marketId) {
                isValid = false;
                error = Error.INVALID_MARKET;
                break;
            }

            if (!market.settled ) {
                isValid = false;
                error = Error.MARKET_NOT_SETTLED;
                break;
            }

            bool marketOutcome = market.resolvedToYes;

            if (predictedOutcomes[i].prediction != marketOutcome) {
                makerWon = false;
                break;
            }
        }

        return (isValid, error, makerWon);
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


    // ============ UMA Market Validation Functions ============
    function submitAssertion(bytes calldata claim,uint256 endTime,bool resolvedToYes) external nonReentrant {
        if (!approvedAsserters[msg.sender]) {
            revert OnlyApprovedAssertersCanCall();
        }

        if (block.timestamp < endTime) {
            revert MarketNotEnded();
        }

        bytes32 marketId = keccak256(abi.encodePacked(claim, ":", endTime));

        if (wrappedMarkets[marketId].marketId == bytes32(0)) {
            // Market not wrapped yet. Wrap it.
            wrappedMarkets[marketId] = WrappedMarket({
                marketId: marketId,
                assertionSubmitted: false,
                settled: false,
                resolvedToYes: false,
                assertionId: bytes32(0)
            });
            emit MarketWrapped(msg.sender, marketId, claim, endTime, block.timestamp);
            
            // If not bytes32(0), Market already wrapped. Might be a re-submit of the same assertion in case it was disputed, or the weird InvalidMarketId.
        }
        
        WrappedMarket storage market = wrappedMarkets[marketId];

        if (market.marketId != marketId) {
            revert InvalidMarketId(); // Weird error, but just in case
        }

        if (market.assertionId != bytes32(0) || market.assertionSubmitted) {
            revert AssertionAlreadySubmitted(); 
        }

        if (market.settled) {
            revert MarketAlreadySettled();
        }

        IERC20 bondCurrency = IERC20(config.bondCurrency);

        // Get the bond currency (with protection against tokens with fees on transfer)
        uint256 initialBalance = bondCurrency.balanceOf(address(this));
        bondCurrency.safeTransferFrom(msg.sender, address(this), config.bondAmount);
        uint256 finalBalance = bondCurrency.balanceOf(address(this));
        if (finalBalance - initialBalance != config.bondAmount) {
            revert NotEnoughBondAmount(msg.sender, config.bondCurrency, config.bondAmount, finalBalance - initialBalance);
        }

        // Approve the bond currency to the Optimistic Oracle V3
        bondCurrency.forceApprove(address(config.optimisticOracleV3), config.bondAmount);

        // Get the "false" claim
        bytes memory falseClaim = abi.encodePacked("False: ", claim);

        // Submit the assertion to UMA
        OptimisticOracleV3Interface optimisticOracleV3 =
            OptimisticOracleV3Interface(address(config.optimisticOracleV3));
        bytes32 assertionId = optimisticOracleV3.assertTruth(
                resolvedToYes ? claim : falseClaim,
                msg.sender,
                address(this),
                address(0),
                config.assertionLiveness,
                bondCurrency,
                config.bondAmount,
                optimisticOracleV3.defaultIdentifier(),
                bytes32(0)
            );

        // Update the wrapped market
        market.assertionId = assertionId;
        market.assertionSubmitted = true;

        umaSettlements[assertionId] = UMASettlement({
            marketId: marketId,
            resolvedToYes: resolvedToYes,
            submissionTime: block.timestamp,
            settled: false
        });

        emit AssertionSubmitted(msg.sender, marketId, assertionId, resolvedToYes, block.timestamp);
    }

    function assertionResolvedCallback(bytes32 assertionId, bool assertedTruthfully) external nonReentrant {
        if (msg.sender != address(config.optimisticOracleV3)) {
            revert OnlyOptimisticOracleV3CanCall();
        }
        
        bytes32 marketId = umaSettlements[assertionId].marketId;
        WrappedMarket storage market = wrappedMarkets[marketId];
        if (market.assertionId != assertionId) {
            revert InvalidAssertionId();
        }
        if (market.settled) {
            revert MarketAlreadySettled();
        }
        if (assertedTruthfully) {
            market.settled = true;
            market.resolvedToYes = umaSettlements[assertionId].resolvedToYes;
            // if asserted truthfully, is false, it means it was disputed. We just clean the assertion to enable a new assertion.
        }

        // clear the assertionId to allow close the loop.
        market.assertionId = bytes32(0);
        market.assertionSubmitted = false;

        emit AssertionResolved(marketId, assertionId, market.resolvedToYes, assertedTruthfully, block.timestamp);
    } 

    function assertionDisputedCallback(bytes32 assertionId) external {
        bytes32 marketId = umaSettlements[assertionId].marketId;

        // do nothing on disputes, just emit the event. We wait for the assertion to be resolved (truthfully or not) to close the loop.
        emit AssertionDisputed(marketId, assertionId, block.timestamp);
    }
}
