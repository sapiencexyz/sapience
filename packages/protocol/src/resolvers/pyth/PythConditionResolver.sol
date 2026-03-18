// SPDX-License-Identifier: MIT
pragma solidity ^0.8.19;

import {
    ReentrancyGuard
} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";

import { IConditionResolver } from "../../interfaces/IConditionResolver.sol";
import { ConditionResolverBase } from "../ConditionResolverBase.sol";
import { IV2Types } from "../../interfaces/IV2Types.sol";
import { IPythLazer } from "./PythLazerLibs/IPythLazer.sol";
import { PythLazerLib } from "./PythLazerLibs/PythLazerLib.sol";
import { PythLazerLibBytes } from "./PythLazerLibs/PythLazerLibBytes.sol";
import { PythLazerStructs } from "./PythLazerLibs/PythLazerStructs.sol";

/// @title PythConditionResolver
/// @notice V2 condition resolver for binary options settled using Pyth Lazer verified historical updates
/// @dev Each conditionId maps to a unique binary option market (priceId, endTime, strike, etc.)
contract PythConditionResolver is ConditionResolverBase, ReentrancyGuard {
    // ============ Custom Errors ============
    error MarketNotEnded();
    error MarketAlreadySettled();
    error InvalidMarketData();
    error InsufficientUpdateFee(uint256 required, uint256 provided);
    error StrikeExpoMismatch(int32 strikeExpo, int32 priceExpo);
    error RefundFailed();

    // ============ Events ============
    event ConditionResolutionDetail(
        bytes32 indexed conditionIdHash,
        bytes32 indexed priceId,
        uint64 indexed endTime,
        bytes conditionId,
        bool resolvedToOver,
        int64 benchmarkPrice,
        int32 benchmarkExpo,
        uint64 publishTime
    );

    // ============ Types ============
    /// @notice Binary option market parameters
    struct BinaryOptionMarket {
        bytes32 priceId;
        uint64 endTime;
        int64 strikePrice;
        int32 strikeExpo;
        bool overWinsOnTie; // true = price >= strike wins, false = price > strike wins
    }

    /// @notice Settlement data for a resolved market
    struct MarketSettlement {
        bool settled;
        bool resolvedToOver;
        int64 benchmarkPrice;
        int32 benchmarkExpo;
        uint64 publishTime;
    }

    // ============ Storage ============
    IPythLazer public immutable pythLazer;
    mapping(bytes32 => MarketSettlement) public settlements;

    // ============ Constructor ============
    constructor(address _pythLazer) {
        pythLazer = IPythLazer(_pythLazer);
    }

    // ============ IConditionResolver Implementation ============

    /// @inheritdoc IConditionResolver
    function isValidCondition(bytes calldata conditionId)
        external
        pure
        returns (bool)
    {
        // conditionId must be a valid abi.encode of BinaryOptionMarket fields
        // abi.encode(bytes32, uint64, int64, int32, bool) = 5 × 32 = 160 bytes
        if (conditionId.length != 160) return false;
        (bytes32 priceId,,,,) =
            abi.decode(conditionId, (bytes32, uint64, int64, int32, bool));
        return priceId != bytes32(0);
    }

    /// @inheritdoc IConditionResolver
    function getResolution(bytes calldata conditionId)
        external
        view
        returns (bool isResolved, IV2Types.OutcomeVector memory outcome)
    {
        bytes32 key = keccak256(conditionId);
        MarketSettlement memory s = settlements[key];

        if (!s.settled) {
            return (false, IV2Types.OutcomeVector(0, 0));
        }

        // resolvedToOver = YES = [1, 0]
        // !resolvedToOver (Under) = NO = [0, 1]
        if (s.resolvedToOver) {
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
            bool[] memory isResolved,
            IV2Types.OutcomeVector[] memory outcomes
        )
    {
        uint256 length = conditionIds.length;
        isResolved = new bool[](length);
        outcomes = new IV2Types.OutcomeVector[](length);

        for (uint256 i = 0; i < length; i++) {
            bytes32 key = keccak256(conditionIds[i]);
            MarketSettlement memory s = settlements[key];

            if (!s.settled) {
                isResolved[i] = false;
                outcomes[i] = IV2Types.OutcomeVector(0, 0);
            } else {
                isResolved[i] = true;
                outcomes[i] = s.resolvedToOver
                    ? IV2Types.OutcomeVector(1, 0)
                    : IV2Types.OutcomeVector(0, 1);
            }
        }
    }

    /// @inheritdoc IConditionResolver
    function isFinalized(bytes calldata conditionId)
        external
        view
        returns (bool)
    {
        // Once settled, Pyth markets are final (based on verified historical data)
        bytes32 key = keccak256(conditionId);
        return settlements[key].settled;
    }

    // ============ Settlement ============

    /// @notice Settle a condition using a verified Pyth Lazer update
    /// @param market The market parameters
    /// @param updateData The Pyth Lazer update data (single element array)
    /// @return conditionId The unique condition identifier (abi-encoded market params)
    /// @return resolvedToOver True if the condition resolved to OVER (YES)
    function settleCondition(
        BinaryOptionMarket calldata market,
        bytes[] calldata updateData
    )
        external
        payable
        nonReentrant
        returns (bytes memory conditionId, bool resolvedToOver)
    {
        if (market.priceId == bytes32(0)) {
            revert InvalidMarketData();
        }
        uint32 feedId = _asFeedId(market.priceId);
        if (market.strikePrice <= 0) revert InvalidMarketData();
        if (block.timestamp < market.endTime) revert MarketNotEnded();

        conditionId = getConditionId(market);
        bytes32 key = keccak256(conditionId);
        if (settlements[key].settled) revert MarketAlreadySettled();

        // Verify the update on-chain
        if (updateData.length != 1) revert InvalidMarketData();

        uint256 fee = pythLazer.verification_fee();
        if (msg.value < fee) revert InsufficientUpdateFee(fee, msg.value);

        int64 benchmarkPrice;
        int32 benchmarkExpo;
        uint64 publishTimeSec;
        uint64 publishTimeMicros;
        {
            (bytes memory payload,) =
                pythLazer.verifyUpdate{ value: fee }(updateData[0]);
            (benchmarkPrice, benchmarkExpo, publishTimeSec, publishTimeMicros) =
                _benchmarkFromVerifiedPayload(payload, feedId);
        }

        // Enforce exact-second match between the Pyth update and the market endTime.
        // publishTimeSec is already truncated via integer division (timestamp / 1_000_000),
        // so sub-second microsecond residue is safely discarded.
        // TRUST ASSUMPTION: We rely entirely on Pyth Lazer's cryptographic signature
        // verification to guarantee that the price was actually observed at the stated
        // timestamp. There is no on-chain staleness check against block.timestamp.
        // The exact-second match constrains *which* second can settle a market, but
        // a compromised Pyth Lazer signer could submit a validly-signed payload with
        // an arbitrary price for any past timestamp. This is a single-point-of-trust
        // on the Pyth Lazer signer key — acceptable given the protocol's oracle model,
        // but callers should be aware of this trust boundary.
        if (publishTimeSec != market.endTime) revert InvalidMarketData();

        // Require exact exponent match
        if (benchmarkExpo != market.strikeExpo) {
            revert StrikeExpoMismatch(market.strikeExpo, benchmarkExpo);
        }

        resolvedToOver = market.overWinsOnTie
            ? (benchmarkPrice >= market.strikePrice)
            : (benchmarkPrice > market.strikePrice);

        settlements[key] = MarketSettlement({
            settled: true,
            resolvedToOver: resolvedToOver,
            benchmarkPrice: benchmarkPrice,
            benchmarkExpo: benchmarkExpo,
            publishTime: publishTimeSec
        });

        emit ConditionResolutionDetail(
            key,
            market.priceId,
            market.endTime,
            conditionId,
            resolvedToOver,
            benchmarkPrice,
            benchmarkExpo,
            publishTimeSec
        );

        _emitResolved(
            conditionId,
            resolvedToOver
                ? IV2Types.OutcomeVector(1, 0)
                : IV2Types.OutcomeVector(0, 1)
        );

        // Refund excess ETH
        if (msg.value > fee) {
            (bool ok,) = msg.sender.call{ value: msg.value - fee }("");
            if (!ok) revert RefundFailed();
        }
    }

    // ============ View Functions ============

    /// @notice Compute the conditionId for a market
    /// @param market The market parameters
    /// @return The unique condition identifier (abi-encoded market params)
    function getConditionId(BinaryOptionMarket memory market)
        public
        pure
        returns (bytes memory)
    {
        return abi.encode(
            market.priceId,
            market.endTime,
            market.strikePrice,
            market.strikeExpo,
            market.overWinsOnTie
        );
    }

    /// @notice Get the settlement data for a condition
    /// @param conditionId The condition identifier (abi-encoded market params)
    /// @return The settlement data
    function getSettlement(bytes calldata conditionId)
        external
        view
        returns (MarketSettlement memory)
    {
        return settlements[keccak256(conditionId)];
    }

    // ============ Internal Functions ============

    function _asFeedId(bytes32 priceId) internal pure returns (uint32 feedId) {
        uint256 raw = uint256(priceId);
        if (raw > type(uint32).max) revert InvalidMarketData();
        feedId = uint32(raw);
        // feedId 0 is invalid - must specify a valid price feed
        if (feedId == 0) revert InvalidMarketData();
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
        PythLazerStructs.Update memory u = PythLazerLibBytes.parseUpdateFromPayloadBytes(
                payload
            );

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
}
