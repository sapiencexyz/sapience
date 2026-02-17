// SPDX-License-Identifier: MIT
pragma solidity ^0.8.19;

import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";

import {IPredictionMarketResolver} from "../interfaces/IPredictionMarketResolver.sol";
import {IPythLazer} from "./pythLazer/IPythLazer.sol";
import {PythLazerLib} from "./pythLazer/PythLazerLib.sol";
import {PythLazerLibBytes} from "./pythLazer/PythLazerLibBytes.sol";
import {PythLazerStructs} from "./pythLazer/PythLazerStructs.sol";

/// @title PythResolver
/// @notice Resolver for binary options settled using Pyth Lazer verified historical updates.
/// @dev `getPredictionResolution` is view-only, so settlement is performed via an explicit `settleMarket` tx
///      that verifies a signed Lazer update on-chain and stores the result.
contract PythResolver is IPredictionMarketResolver, ReentrancyGuard {
    // ============ Custom Errors ============
    error MustHaveAtLeastOneMarket();
    error TooManyMarkets();
    error MarketNotEnded();
    error MarketAlreadySettled();
    error InvalidMarketData();
    error InsufficientUpdateFee(uint256 required, uint256 provided);
    error StrikeExpoMismatch(int32 strikeExpo, int32 priceExpo);
    error RefundFailed();

    // ============ Events ============
    event ConfigInitialized(
        address indexed pythLazer,
        uint256 maxPredictionMarkets
    );

    event MarketSettled(
        bytes32 indexed marketId,
        bytes32 indexed priceId,
        uint64 indexed endTime,
        bool resolvedToOver,
        int64 benchmarkPrice,
        int32 benchmarkExpo,
        uint64 publishTime
    );

    // ============ Settings ============
    struct Settings {
        uint256 maxPredictionMarkets;
        IPythLazer pythLazer;
    }

    uint256 public immutable maxPredictionMarkets;
    IPythLazer public immutable pythLazer;

    // ============ Binary Option Encoding ============
    struct BinaryOptionMarket {
        bytes32 priceId;
        uint64 endTime;
        int64 strikePrice;
        int32 strikeExpo;
        bool overWinsOnTie; // default true (price >= strike)
    }

    /// @notice One predicted outcome in a parlay.
    /// @dev `prediction` is the maker's bet: true = Over, false = Under.
    struct BinaryOptionOutcome {
        bytes32 priceId;
        uint64 endTime;
        int64 strikePrice;
        int32 strikeExpo;
        bool overWinsOnTie;
        bool prediction;
    }

    struct MarketSettlement {
        bool settled;
        bool resolvedToOver;
        int64 benchmarkPrice;
        int32 benchmarkExpo;
        uint64 publishTime;
    }

    mapping(bytes32 => MarketSettlement) public settlements; // marketId => settlement

    function _asFeedId(bytes32 priceId) internal pure returns (uint32 feedId) {
        // In this resolver, `priceId` is expected to encode a Pyth Lazer `feedId` (uint32)
        // as a `bytes32` with all high bits zero.
        uint256 raw = uint256(priceId);
        if (raw > type(uint32).max) revert InvalidMarketData();
        feedId = uint32(raw);
    }

    function _benchmarkFromVerifiedPayload(
        bytes memory payload,
        uint32 targetFeedId
    )
        internal
        pure
        returns (
            int64 benchmarkPrice,
            int32 benchmarkExpo,
            uint64 publishTimeSec,
            uint64 publishTimeMicros
        )
    {
        PythLazerStructs.Update memory u = PythLazerLibBytes
            .parseUpdateFromPayloadBytes(payload);

        // Payload header timestamp is microseconds.
        publishTimeMicros = u.timestamp;
        publishTimeSec = uint64(u.timestamp / 1_000_000);

        bool found;
        PythLazerStructs.Feed memory feed;
        for (uint256 i = 0; i < u.feeds.length; i++) {
            if (u.feeds[i].feedId == targetFeedId) {
                feed = u.feeds[i];
                found = true;
                break;
            }
        }
        if (!found) revert InvalidMarketData();

        benchmarkPrice = PythLazerLib.getPrice(feed);
        benchmarkExpo = int32(PythLazerLib.getExponent(feed));
    }

    constructor(Settings memory _config) {
        maxPredictionMarkets = _config.maxPredictionMarkets;
        pythLazer = _config.pythLazer;

        emit ConfigInitialized(address(_config.pythLazer), _config.maxPredictionMarkets);
    }

    // ============ Resolver Interface ============
    function validatePredictionMarkets(
        bytes calldata encodedPredictedOutcomes
    ) external view returns (bool isValid, Error error) {
        isValid = true;
        error = Error.NO_ERROR;

        BinaryOptionOutcome[] memory outcomes = decodePredictionOutcomes(
            encodedPredictedOutcomes
        );

        if (outcomes.length == 0) revert MustHaveAtLeastOneMarket();
        if (outcomes.length > maxPredictionMarkets) revert TooManyMarkets();

        for (uint256 i = 0; i < outcomes.length; i++) {
            if (outcomes[i].priceId == bytes32(0)) {
                return (false, Error.INVALID_MARKET);
            }
            // Enforce that priceId encodes a uint32 feed id (high bits must be zero).
            if (uint256(outcomes[i].priceId) > type(uint32).max) {
                return (false, Error.INVALID_MARKET);
            }
            // Market must not be expired at mint time
            if (outcomes[i].endTime <= block.timestamp) {
                return (false, Error.MARKET_NOT_OPENED);
            }
            // Strike sanity
            if (outcomes[i].strikePrice <= 0) {
                return (false, Error.INVALID_MARKET);
            }
        }
    }

    function getPredictionResolution(
        bytes calldata encodedPredictedOutcomes
    ) external view returns (bool isResolved, Error error, bool parlaySuccess) {
        BinaryOptionOutcome[] memory outcomes = decodePredictionOutcomes(
            encodedPredictedOutcomes
        );

        parlaySuccess = true;
        isResolved = true;
        error = Error.NO_ERROR;
        bool hasUnsettledMarkets = false;

        if (outcomes.length == 0) {
            return (false, Error.MUST_HAVE_AT_LEAST_ONE_MARKET, true);
        }
        if (outcomes.length > maxPredictionMarkets) {
            return (false, Error.TOO_MANY_MARKETS, true);
        }

        for (uint256 i = 0; i < outcomes.length; i++) {
            if (outcomes[i].priceId == bytes32(0)) {
                return (false, Error.INVALID_MARKET, true);
            }
            if (uint256(outcomes[i].priceId) > type(uint32).max) {
                return (false, Error.INVALID_MARKET, true);
            }

            bytes32 marketId = getMarketId(
                BinaryOptionMarket({
                    priceId: outcomes[i].priceId,
                    endTime: outcomes[i].endTime,
                    strikePrice: outcomes[i].strikePrice,
                    strikeExpo: outcomes[i].strikeExpo,
                    overWinsOnTie: outcomes[i].overWinsOnTie
                })
            );

            MarketSettlement memory s = settlements[marketId];
            if (!s.settled) {
                hasUnsettledMarkets = true;
                continue;
            }

            bool marketOutcomeOver = s.resolvedToOver;
            if (outcomes[i].prediction != marketOutcomeOver) {
                // decisive loss
                return (true, Error.NO_ERROR, false);
            }
        }

        if (hasUnsettledMarkets) {
            return (false, Error.MARKET_NOT_SETTLED, true);
        }

        return (true, Error.NO_ERROR, true);
    }

    // ============ Settlement ============
    function settleMarket(
        BinaryOptionMarket calldata market,
        bytes[] calldata updateData
    )
        external
        payable
        nonReentrant
        returns (bytes32 marketId, bool resolvedToOver)
    {
        if (market.priceId == bytes32(0)) revert InvalidMarketData();
        // Ensure priceId cannot alias multiple distinct markets onto the same uint32 feed id.
        // (We encode the uint32 feed id in the low bits of bytes32.)
        uint32 feedId = _asFeedId(market.priceId);
        if (market.strikePrice <= 0) revert InvalidMarketData();
        if (block.timestamp < market.endTime) revert MarketNotEnded();

        marketId = getMarketId(market);
        if (settlements[marketId].settled) revert MarketAlreadySettled();

        // Deterministic second-level settlement: the verified update must be
        // (1) exactly second-aligned and (2) match the market's endTime exactly.
        uint64 expectedPublishTimeSec = market.endTime;

        // Verify the update on-chain using the Pyth Lazer verifier and parse the verified payload.
        if (updateData.length != 1) revert InvalidMarketData();

        uint256 fee = pythLazer.verification_fee();
        if (msg.value < fee) revert InsufficientUpdateFee(fee, msg.value);

        int64 benchmarkPrice;
        int32 benchmarkExpo;
        uint64 publishTimeSec;
        uint64 publishTimeMicros;
        {
            (bytes memory payload, ) = pythLazer.verifyUpdate{value: fee}(
                updateData[0]
            );
            (benchmarkPrice, benchmarkExpo, publishTimeSec, publishTimeMicros) = _benchmarkFromVerifiedPayload(
                payload,
                feedId
            );
        }

        // Enforce exact-second alignment: timestamp must be divisible by 1,000,000 (microseconds per second)
        if (publishTimeMicros % 1_000_000 != 0) {
            revert InvalidMarketData();
        }
        if (publishTimeSec != expectedPublishTimeSec) revert InvalidMarketData();

        // Preferred: avoid rounding by requiring exact exponent match.
        if (benchmarkExpo != market.strikeExpo) {
            revert StrikeExpoMismatch(market.strikeExpo, benchmarkExpo);
        }

        resolvedToOver = market.overWinsOnTie
            ? (benchmarkPrice >= market.strikePrice)
            : (benchmarkPrice > market.strikePrice);

        settlements[marketId] = MarketSettlement({
            settled: true,
            resolvedToOver: resolvedToOver,
            benchmarkPrice: benchmarkPrice,
            benchmarkExpo: benchmarkExpo,
            publishTime: publishTimeSec
        });

        emit MarketSettled(
            marketId,
            market.priceId,
            market.endTime,
            resolvedToOver,
            benchmarkPrice,
            benchmarkExpo,
            publishTimeSec
        );

        // Refund excess ETH (if any)
        if (msg.value > fee) {
            (bool ok, ) = msg.sender.call{value: msg.value - fee}("");
            if (!ok) revert RefundFailed();
        }
    }

    // ============ Encoding / Decoding ============
    function encodePredictionOutcomes(
        BinaryOptionOutcome[] calldata outcomes
    ) external pure returns (bytes memory) {
        return abi.encode(outcomes);
    }

    function decodePredictionOutcomes(
        bytes calldata encodedPredictedOutcomes
    ) public pure returns (BinaryOptionOutcome[] memory) {
        return abi.decode(encodedPredictedOutcomes, (BinaryOptionOutcome[]));
    }

    function getMarketId(
        BinaryOptionMarket memory market
    ) public pure returns (bytes32) {
        return
            keccak256(
                abi.encode(
                    market.priceId,
                    market.endTime,
                    market.strikePrice,
                    market.strikeExpo,
                    market.overWinsOnTie
                )
            );
    }
}


