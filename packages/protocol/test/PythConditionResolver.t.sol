// SPDX-License-Identifier: MIT
pragma solidity ^0.8.19;

import "forge-std/Test.sol";
import "../src/resolvers/pyth/PythConditionResolver.sol";
import "../src/interfaces/IV2Types.sol";

/// @notice Mock PythLazer verifier that returns a pre-configured payload
/// @dev Does not implement IPythLazer directly because the interface returns
///      `bytes calldata` which cannot be returned from a mock. ABI encoding
///      is identical for memory/calldata, so cross-contract calls work.
contract MockPythLazer {
    bytes private _payload;
    uint256 private _fee;

    function setPayload(bytes memory payload_) external {
        _payload = payload_;
    }

    function setFee(uint256 fee_) external {
        _fee = fee_;
    }

    function verification_fee() external view returns (uint256) {
        return _fee;
    }

    function verifyUpdate(bytes calldata)
        external
        payable
        returns (bytes memory payload, address signer)
    {
        return (_payload, address(this));
    }
}

/**
 * @title PythConditionResolverTest
 * @notice Tests for PythConditionResolver vulnerabilities
 * @dev Tests for #70062 (microsecond alignment) and #70045 (feed freshness)
 */
contract PythConditionResolverTest is Test {
    PythConditionResolver public resolver;
    MockPythLazer public mockPythLazer;

    uint32 constant FORMAT_MAGIC = 2_479_346_549;
    uint32 constant FEED_ID = 1;
    uint64 constant END_TIME = 1_708_435_200; // Feb 20, 2024
    int64 constant STRIKE_PRICE = 5_000_000_000_000; // 50000.00000000
    int32 constant STRIKE_EXPO = -8;
    int64 constant BENCHMARK_PRICE = 5_100_000_000_000; // 51000 > strike

    function setUp() public {
        mockPythLazer = new MockPythLazer();
        resolver = new PythConditionResolver(address(mockPythLazer));
        // Warp past market end time
        vm.warp(END_TIME + 1);
    }

    /// @notice Build a Pyth Lazer payload with the given timestamp (microseconds)
    /// @dev Payload format (all big-endian):
    ///   [4] magic | [8] timestamp_us | [1] channel | [1] feedsLen
    ///   [4] feedId | [1] numProperties
    ///   [1] Price propId=0 | [8] price
    ///   [1] Exponent propId=4 | [2] exponent
    function _buildPayload(
        uint64 timestampUs,
        uint32 feedId,
        int64 price,
        int16 exponent
    ) internal pure returns (bytes memory) {
        return abi.encodePacked(
            bytes4(uint32(FORMAT_MAGIC)), // magic
            bytes8(timestampUs), // timestamp in microseconds
            uint8(1), // channel = RealTime
            uint8(1), // 1 feed
            bytes4(feedId), // feedId
            uint8(2), // 2 properties
            uint8(0), // Price property (id=0)
            bytes8(uint64(int64(price))), // price as int64
            uint8(4), // Exponent property (id=4)
            bytes2(uint16(int16(exponent))) // exponent as int16
        );
    }

    function _defaultMarket()
        internal
        pure
        returns (PythConditionResolver.BinaryOptionMarket memory)
    {
        return PythConditionResolver.BinaryOptionMarket({
            priceId: bytes32(uint256(FEED_ID)),
            endTime: END_TIME,
            strikePrice: STRIKE_PRICE,
            strikeExpo: STRIKE_EXPO,
            overWinsOnTie: true
        });
    }

    // ============ #70062: Microsecond alignment ============

    /// @notice Settlement with a whole-second timestamp should succeed (baseline)
    function test_settleCondition_wholeSecondTimestamp_succeeds() public {
        // Timestamp with zero microsecond residue
        uint64 timestampUs = uint64(END_TIME) * 1_000_000; // exact second
        bytes memory payload = _buildPayload(
            timestampUs, FEED_ID, BENCHMARK_PRICE, int16(STRIKE_EXPO)
        );
        mockPythLazer.setPayload(payload);

        bytes[] memory updateData = new bytes[](1);
        updateData[0] = "dummy"; // mock ignores input

        PythConditionResolver.BinaryOptionMarket memory mkt = _defaultMarket();

        (bytes memory conditionId, bool resolvedToOver) =
            resolver.settleCondition(mkt, updateData);

        assertTrue(resolvedToOver, "should resolve to over (price > strike)");
        assertTrue(conditionId.length > 0, "conditionId should not be empty");
    }

    /// @notice Settlement with microsecond residue should succeed after fix
    /// @dev Before fix: reverts with InvalidMarketData() due to alignment check
    ///      After fix: succeeds because publishTimeSec truncation is sufficient
    function test_settleCondition_microsecondTimestamp_succeeds() public {
        // Timestamp with non-zero microsecond residue (realistic Pyth Lazer)
        uint64 timestampUs = uint64(END_TIME) * 1_000_000 + 123_456;
        bytes memory payload = _buildPayload(
            timestampUs, FEED_ID, BENCHMARK_PRICE, int16(STRIKE_EXPO)
        );
        mockPythLazer.setPayload(payload);

        bytes[] memory updateData = new bytes[](1);
        updateData[0] = "dummy";

        PythConditionResolver.BinaryOptionMarket memory mkt = _defaultMarket();

        // Should succeed — microsecond residue should not prevent settlement
        (bytes memory conditionId, bool resolvedToOver) =
            resolver.settleCondition(mkt, updateData);

        assertTrue(resolvedToOver, "should resolve to over");
        assertTrue(conditionId.length > 0, "conditionId should not be empty");
    }

    /// @notice Timestamp that truncates to wrong second should still be rejected
    function test_settleCondition_wrongSecond_reverts() public {
        // Timestamp from a different second (END_TIME + 1)
        uint64 timestampUs = (uint64(END_TIME) + 1) * 1_000_000 + 500_000;
        bytes memory payload = _buildPayload(
            timestampUs, FEED_ID, BENCHMARK_PRICE, int16(STRIKE_EXPO)
        );
        mockPythLazer.setPayload(payload);

        bytes[] memory updateData = new bytes[](1);
        updateData[0] = "dummy";

        PythConditionResolver.BinaryOptionMarket memory mkt = _defaultMarket();

        vm.expectRevert(PythConditionResolver.InvalidMarketData.selector);
        resolver.settleCondition(mkt, updateData);
    }

    /// @notice Microsecond residue of 999999 (maximum sub-second) should succeed
    function test_settleCondition_maxMicrosecondResidue_succeeds() public {
        uint64 timestampUs = uint64(END_TIME) * 1_000_000 + 999_999;
        bytes memory payload = _buildPayload(
            timestampUs, FEED_ID, BENCHMARK_PRICE, int16(STRIKE_EXPO)
        );
        mockPythLazer.setPayload(payload);

        bytes[] memory updateData = new bytes[](1);
        updateData[0] = "dummy";

        PythConditionResolver.BinaryOptionMarket memory mkt = _defaultMarket();

        (, bool resolvedToOver) = resolver.settleCondition(mkt, updateData);
        assertTrue(resolvedToOver);
    }

    // ============ #70045: Feed freshness (trust assumption) ============

    /// @notice Documents the trust assumption: we rely on Pyth Lazer's signature
    ///         verification to guarantee the price was observed at the stated timestamp.
    ///         The exact-second match (publishTimeSec == endTime) constrains the
    ///         timestamp but does not check on-chain staleness vs block.timestamp.
    function test_settleCondition_trustAssumption_noStalenessCheck() public {
        // Even with block.timestamp far in the future, settlement works
        // as long as the Pyth payload timestamp matches endTime
        vm.warp(END_TIME + 365 days);

        uint64 timestampUs = uint64(END_TIME) * 1_000_000;
        bytes memory payload = _buildPayload(
            timestampUs, FEED_ID, BENCHMARK_PRICE, int16(STRIKE_EXPO)
        );
        mockPythLazer.setPayload(payload);

        bytes[] memory updateData = new bytes[](1);
        updateData[0] = "dummy";

        PythConditionResolver.BinaryOptionMarket memory mkt = _defaultMarket();

        // This succeeds: no on-chain staleness check exists.
        // Security relies on Pyth Lazer's cryptographic verification.
        (, bool resolvedToOver) = resolver.settleCondition(mkt, updateData);
        assertTrue(resolvedToOver);
    }

    // ============ IConditionResolver interface tests ============

    /// @notice getResolution returns correct outcome after settlement
    function test_getResolution_afterSettle() public {
        uint64 timestampUs = uint64(END_TIME) * 1_000_000;
        bytes memory payload = _buildPayload(
            timestampUs, FEED_ID, BENCHMARK_PRICE, int16(STRIKE_EXPO)
        );
        mockPythLazer.setPayload(payload);

        bytes[] memory updateData = new bytes[](1);
        updateData[0] = "dummy";

        PythConditionResolver.BinaryOptionMarket memory mkt = _defaultMarket();
        (bytes memory conditionId,) = resolver.settleCondition(mkt, updateData);

        (bool isResolved, IV2Types.OutcomeVector memory outcome) =
            resolver.getResolution(conditionId);
        assertTrue(isResolved);
        assertEq(outcome.yesWeight, 1);
        assertEq(outcome.noWeight, 0);
    }

    /// @notice getResolution returns unresolved for unsettled condition
    function test_getResolution_unsettled() public view {
        bytes memory conditionId = abi.encode(
            bytes32(uint256(999)), uint64(0), int64(0), int32(0), false
        );
        (bool isResolved, IV2Types.OutcomeVector memory outcome) =
            resolver.getResolution(conditionId);
        assertFalse(isResolved);
        assertEq(outcome.yesWeight, 0);
        assertEq(outcome.noWeight, 0);
    }
}
