// SPDX-License-Identifier: MIT
pragma solidity ^0.8.19;

import {PythLazerStructs} from "./PythLazerStructs.sol";

/// @notice Memory-friendly parser for Pyth Lazer payloads.
/// @dev Upstream `PythLazerLib.parseUpdateFromPayload` accepts `bytes calldata`, but when we call
///      `PythLazer.verifyUpdate` the returned payload is `bytes memory`. This adapter avoids
///      rewriting the verifier call pattern and keeps parsing logic self-contained.
library PythLazerLibBytes {
    error InvalidMagic();
    error UnknownProperty();
    error InvalidMarketSessionValue();
    error PayloadHasExtraBytes();

    uint32 internal constant FORMAT_MAGIC = 2479346549;

    function _requireInBounds(bytes memory b, uint256 pos, uint256 size) private pure {
        require(pos + size <= b.length, "out of bounds");
    }

    function _readU8(bytes memory b, uint256 pos) private pure returns (uint8 v) {
        _requireInBounds(b, pos, 1);
        assembly {
            v := byte(0, mload(add(add(b, 0x20), pos)))
        }
    }

    /// @dev Reads big-endian uint16 from `b[pos:pos+2]`.
    function _readU16BE(bytes memory b, uint256 pos) private pure returns (uint16 v) {
        _requireInBounds(b, pos, 2);
        uint256 w;
        assembly {
            w := mload(add(add(b, 0x20), pos))
        }
        v = uint16(w >> 240);
    }

    /// @dev Reads big-endian uint32 from `b[pos:pos+4]`.
    function _readU32BE(bytes memory b, uint256 pos) private pure returns (uint32 v) {
        _requireInBounds(b, pos, 4);
        uint256 w;
        assembly {
            w := mload(add(add(b, 0x20), pos))
        }
        v = uint32(w >> 224);
    }

    /// @dev Reads big-endian uint64 from `b[pos:pos+8]`.
    function _readU64BE(bytes memory b, uint256 pos) private pure returns (uint64 v) {
        _requireInBounds(b, pos, 8);
        uint256 w;
        assembly {
            w := mload(add(add(b, 0x20), pos))
        }
        v = uint64(w >> 192);
    }

    function _readI64BE(bytes memory b, uint256 pos) private pure returns (int64 v) {
        uint64 u = _readU64BE(b, pos);
        assembly {
            v := signextend(7, u)
        }
    }

    function _readI16BE(bytes memory b, uint256 pos) private pure returns (int16 v) {
        uint16 u = _readU16BE(b, pos);
        assembly {
            v := signextend(1, u)
        }
    }

    function _parsePayloadHeader(
        bytes memory payload
    )
        private
        pure
        returns (
            uint64 timestampUs,
            PythLazerStructs.Channel channel,
            uint8 feedsLen,
            uint16 pos
        )
    {
        pos = 0;
        uint32 magic = _readU32BE(payload, pos);
        pos += 4;
        if (magic != FORMAT_MAGIC) revert InvalidMagic();

        timestampUs = _readU64BE(payload, pos);
        pos += 8;

        channel = PythLazerStructs.Channel(_readU8(payload, pos));
        pos += 1;

        feedsLen = _readU8(payload, pos);
        pos += 1;
    }

    function _parseFeedHeader(
        bytes memory payload,
        uint16 pos
    ) private pure returns (uint32 feedId, uint8 numProperties, uint16 newPos) {
        feedId = _readU32BE(payload, pos);
        pos += 4;
        numProperties = _readU8(payload, pos);
        pos += 1;
        newPos = pos;
    }

    function _parseProperty(
        bytes memory payload,
        uint16 pos
    )
        private
        pure
        returns (PythLazerStructs.PriceFeedProperty property, uint16 newPos)
    {
        uint8 propertyId = _readU8(payload, pos);
        if (propertyId > 9) revert UnknownProperty();
        property = PythLazerStructs.PriceFeedProperty(propertyId);
        pos += 1;
        newPos = pos;
    }

    /// @notice Parse complete update from payload bytes (memory).
    function parseUpdateFromPayloadBytes(
        bytes memory payload
    ) internal pure returns (PythLazerStructs.Update memory update) {
        uint16 pos;
        uint8 feedsLen;
        (update.timestamp, update.channel, feedsLen, pos) = _parsePayloadHeader(
            payload
        );

        update.feeds = new PythLazerStructs.Feed[](feedsLen);

        for (uint8 i = 0; i < feedsLen; i++) {
            PythLazerStructs.Feed memory feed;

            uint32 feedId;
            uint8 numProperties;
            (feedId, numProperties, pos) = _parseFeedHeader(payload, pos);

            feed.feedId = feedId;
            feed.triStateMap = 0;

            for (uint8 j = 0; j < numProperties; j++) {
                PythLazerStructs.PriceFeedProperty prop;
                (prop, pos) = _parseProperty(payload, pos);

                if (prop == PythLazerStructs.PriceFeedProperty.Price) {
                    feed._price = _readI64BE(payload, pos);
                    pos += 8;
                    // Match upstream semantics: value==0 means ApplicableButMissing.
                    if (feed._price != 0) {
                        feed.triStateMap |= (uint256(2) << (2 * uint8(prop)));
                    } else {
                        feed.triStateMap |= (uint256(1) << (2 * uint8(prop)));
                    }
                } else if (
                    prop == PythLazerStructs.PriceFeedProperty.BestBidPrice
                ) {
                    feed._bestBidPrice = _readI64BE(payload, pos);
                    pos += 8;
                    if (feed._bestBidPrice != 0) {
                        feed.triStateMap |= (uint256(2) << (2 * uint8(prop)));
                    } else {
                        feed.triStateMap |= (uint256(1) << (2 * uint8(prop)));
                    }
                } else if (
                    prop == PythLazerStructs.PriceFeedProperty.BestAskPrice
                ) {
                    feed._bestAskPrice = _readI64BE(payload, pos);
                    pos += 8;
                    if (feed._bestAskPrice != 0) {
                        feed.triStateMap |= (uint256(2) << (2 * uint8(prop)));
                    } else {
                        feed.triStateMap |= (uint256(1) << (2 * uint8(prop)));
                    }
                } else if (
                    prop == PythLazerStructs.PriceFeedProperty.PublisherCount
                ) {
                    feed._publisherCount = _readU16BE(payload, pos);
                    pos += 2;
                    if (feed._publisherCount != 0) {
                        feed.triStateMap |= (uint256(2) << (2 * uint8(prop)));
                    } else {
                        feed.triStateMap |= (uint256(1) << (2 * uint8(prop)));
                    }
                } else if (
                    prop == PythLazerStructs.PriceFeedProperty.Exponent
                ) {
                    feed._exponent = _readI16BE(payload, pos);
                    pos += 2;
                    feed.triStateMap |= (uint256(2) << (2 * uint8(prop)));
                } else if (
                    prop == PythLazerStructs.PriceFeedProperty.Confidence
                ) {
                    feed._confidence = _readU64BE(payload, pos);
                    pos += 8;
                    if (feed._confidence != 0) {
                        feed.triStateMap |= (uint256(2) << (2 * uint8(prop)));
                    } else {
                        feed.triStateMap |= (uint256(1) << (2 * uint8(prop)));
                    }
                } else if (
                    prop == PythLazerStructs.PriceFeedProperty.FundingRate
                ) {
                    uint8 exists = _readU8(payload, pos);
                    pos += 1;
                    if (exists != 0) {
                        feed._fundingRate = _readI64BE(payload, pos);
                        pos += 8;
                        feed.triStateMap |= (uint256(2) << (2 * uint8(prop)));
                    } else {
                        feed.triStateMap |= (uint256(1) << (2 * uint8(prop)));
                    }
                } else if (
                    prop == PythLazerStructs.PriceFeedProperty.FundingTimestamp
                ) {
                    uint8 exists = _readU8(payload, pos);
                    pos += 1;
                    if (exists != 0) {
                        feed._fundingTimestamp = _readU64BE(payload, pos);
                        pos += 8;
                        feed.triStateMap |= (uint256(2) << (2 * uint8(prop)));
                    } else {
                        feed.triStateMap |= (uint256(1) << (2 * uint8(prop)));
                    }
                } else if (
                    prop ==
                    PythLazerStructs.PriceFeedProperty.FundingRateInterval
                ) {
                    uint8 exists = _readU8(payload, pos);
                    pos += 1;
                    if (exists != 0) {
                        feed._fundingRateInterval = _readU64BE(payload, pos);
                        pos += 8;
                        feed.triStateMap |= (uint256(2) << (2 * uint8(prop)));
                    } else {
                        feed.triStateMap |= (uint256(1) << (2 * uint8(prop)));
                    }
                } else if (
                    prop == PythLazerStructs.PriceFeedProperty.MarketSession
                ) {
                    int16 v = _readI16BE(payload, pos);
                    pos += 2;
                    if (v < 0 || v > 4) revert InvalidMarketSessionValue();
                    feed._marketSession = PythLazerStructs.MarketSession(
                        uint8(uint16(v))
                    );
                    feed.triStateMap |= (uint256(2) << (2 * uint8(prop)));
                } else {
                    // Should be unreachable due to enum bound check
                    revert UnknownProperty();
                }
            }

            update.feeds[i] = feed;
        }

        if (pos != payload.length) revert PayloadHasExtraBytes();
    }
}


