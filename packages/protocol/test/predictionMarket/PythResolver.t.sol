// SPDX-License-Identifier: MIT
pragma solidity ^0.8.19;

import "forge-std/Test.sol";

import "../../src/predictionMarket/resolvers/PythResolver.sol";
import "../../src/predictionMarket/interfaces/IPredictionMarketResolver.sol";
import "../../src/predictionMarket/resolvers/pythLazer/IPythLazer.sol";
import "../../src/predictionMarket/resolvers/pythLazer/PythLazerStructs.sol";

contract MockPythLazer is IPythLazer {
    uint256 internal fee;

    function setFee(uint256 _fee) external {
        fee = _fee;
    }

    function verification_fee() external view returns (uint256) {
        return fee;
    }

    function verifyUpdate(
        bytes calldata update
    ) external payable returns (bytes calldata payload, address signer) {
        require(msg.value >= fee, "fee");
        payload = update; // for unit tests, treat `update` as already-verified payload bytes
        signer = address(0xBEEF);
    }
}

contract PythResolverTest is Test {
    PythResolver resolver;
    MockPythLazer mockPythLazer;

    uint256 constant MAX_MARKETS = 10;

    function setUp() public {
        vm.warp(1000);
        mockPythLazer = new MockPythLazer();
        mockPythLazer.setFee(0);

        PythResolver.Settings memory settings = PythResolver.Settings({
            maxPredictionMarkets: MAX_MARKETS,
            pythLazer: IPythLazer(address(mockPythLazer))
        });

        resolver = new PythResolver(settings);
    }

    function _encodeOutcome(
        bytes32 priceId,
        uint64 endTime,
        int64 strikePrice,
        int32 strikeExpo,
        bool overWinsOnTie,
        bool prediction
    ) internal pure returns (bytes memory) {
        PythResolver.BinaryOptionOutcome[]
            memory outcomes = new PythResolver.BinaryOptionOutcome[](1);
        outcomes[0] = PythResolver.BinaryOptionOutcome({
            priceId: priceId,
            endTime: endTime,
            strikePrice: strikePrice,
            strikeExpo: strikeExpo,
            overWinsOnTie: overWinsOnTie,
            prediction: prediction
        });
        return abi.encode(outcomes);
    }

    function _updateData(
        bytes32 priceId,
        int64 price,
        int32 expo,
        uint64 publishTimeSec
    ) internal pure returns (bytes[] memory updateData) {
        updateData = new bytes[](1);
        // Lazer payload format (see `PythLazerLib.parsePayloadHeader`):
        // [magic:uint32][timestampUs:uint64][channel:uint8][feedsLen:uint8]
        // then each feed: [feedId:uint32][numProps:uint8][propId:uint8][value...]
        uint64 timestampUs = publishTimeSec * 1_000_000;
        uint32 feedId = uint32(uint256(priceId));

        // Properties: Price (0) int64, Exponent (4) int16
        updateData[0] = abi.encodePacked(
            bytes4(uint32(2479346549)),
            bytes8(timestampUs),
            bytes1(uint8(PythLazerStructs.Channel.FixedRate50)),
            bytes1(uint8(1)), // feedsLen
            bytes4(feedId),
            bytes1(uint8(2)), // numProperties
            bytes1(uint8(PythLazerStructs.PriceFeedProperty.Price)),
            bytes8(uint64(uint256(int256(price)))),
            bytes1(uint8(PythLazerStructs.PriceFeedProperty.Exponent)),
            bytes2(uint16(uint32(uint256(int256(expo)))))
        );
    }

    function test_validatePredictionMarkets_success() public view {
        // Pyth Lazer feed ids are uint32 values encoded into bytes32 (high bits zero).
        bytes32 priceId = bytes32(uint256(1));
        bytes memory encoded = _encodeOutcome(priceId, 2000, 100, -8, true, true);

        (bool isValid, IPredictionMarketResolver.Error err) = resolver
            .validatePredictionMarkets(encoded);
        assertTrue(isValid);
        assertEq(
            uint256(err),
            uint256(IPredictionMarketResolver.Error.NO_ERROR)
        );
    }

    function test_validatePredictionMarkets_invalidPriceId() public view {
        bytes memory encoded = _encodeOutcome(bytes32(0), 2000, 100, -8, true, true);

        (bool isValid, IPredictionMarketResolver.Error err) = resolver
            .validatePredictionMarkets(encoded);
        assertFalse(isValid);
        assertEq(
            uint256(err),
            uint256(IPredictionMarketResolver.Error.INVALID_MARKET)
        );
    }

    function test_validatePredictionMarkets_rejectsNonUint32PriceId() public view {
        // High bits set -> not a uint32 feed id.
        bytes32 badPriceId = bytes32(uint256(type(uint32).max) + 1);
        bytes memory encoded = _encodeOutcome(
            badPriceId,
            2000,
            100,
            -8,
            true,
            true
        );

        (bool isValid, IPredictionMarketResolver.Error err) = resolver
            .validatePredictionMarkets(encoded);
        assertFalse(isValid);
        assertEq(
            uint256(err),
            uint256(IPredictionMarketResolver.Error.INVALID_MARKET)
        );
    }

    function test_validatePredictionMarkets_marketNotOpened() public {
        vm.warp(3000);
        bytes32 priceId = bytes32(uint256(1));
        bytes memory encoded = _encodeOutcome(priceId, 2000, 100, -8, true, true);

        (bool isValid, IPredictionMarketResolver.Error err) = resolver
            .validatePredictionMarkets(encoded);
        assertFalse(isValid);
        assertEq(
            uint256(err),
            uint256(IPredictionMarketResolver.Error.MARKET_NOT_OPENED)
        );
    }

    function test_getPredictionResolution_unsettled() public view {
        bytes32 priceId = bytes32(uint256(1));
        bytes memory encoded = _encodeOutcome(priceId, 2000, 100, -8, true, true);

        (
            bool isResolved,
            IPredictionMarketResolver.Error err,
            bool parlaySuccess
        ) = resolver.getPredictionResolution(encoded);
        assertFalse(isResolved);
        assertEq(
            uint256(err),
            uint256(IPredictionMarketResolver.Error.MARKET_NOT_SETTLED)
        );
        assertTrue(parlaySuccess);
    }

    function test_settleMarket_andResolve_overWins() public {
        bytes32 priceId = bytes32(uint256(1));
        uint64 endTime = 2000;
        int32 expo = -8;
        int64 strike = 100;

        vm.warp(endTime);

        bytes[] memory updateData = _updateData(priceId, 150, expo, endTime);
        PythResolver.BinaryOptionMarket memory market = PythResolver
            .BinaryOptionMarket({
                priceId: priceId,
                endTime: endTime,
                strikePrice: strike,
                strikeExpo: expo,
                overWinsOnTie: true
            });

        (, bool resolvedToOver) = resolver.settleMarket(market, updateData);
        assertTrue(resolvedToOver);

        // Maker predicts over -> win
        {
            bytes memory encodedWin = _encodeOutcome(
                priceId,
                endTime,
                strike,
                expo,
                true,
                true
            );
            (
                bool isResolved,
                IPredictionMarketResolver.Error err,
                bool parlaySuccess
            ) = resolver.getPredictionResolution(encodedWin);
            assertTrue(isResolved);
            assertEq(
                uint256(err),
                uint256(IPredictionMarketResolver.Error.NO_ERROR)
            );
            assertTrue(parlaySuccess);
        }

        // Maker predicts under -> lose
        {
            bytes memory encodedLose = _encodeOutcome(
                priceId,
                endTime,
                strike,
                expo,
                true,
                false
            );
            (
                bool isResolved,
                IPredictionMarketResolver.Error err,
                bool parlaySuccess
            ) = resolver.getPredictionResolution(encodedLose);
            assertTrue(isResolved);
            assertEq(
                uint256(err),
                uint256(IPredictionMarketResolver.Error.NO_ERROR)
            );
            assertFalse(parlaySuccess);
        }
    }

    function test_settleMarket_storesSettlementFields() public {
        bytes32 priceId = bytes32(uint256(1));
        uint64 endTime = 2000;
        int32 expo = -8;

        vm.warp(endTime);

        bytes[] memory updateData = _updateData(priceId, 150, expo, endTime);
        PythResolver.BinaryOptionMarket memory market = PythResolver
            .BinaryOptionMarket({
                priceId: priceId,
                endTime: endTime,
                strikePrice: 100,
                strikeExpo: expo,
                overWinsOnTie: true
            });

        (bytes32 marketId, ) = resolver.settleMarket(market, updateData);

        // Keep locals small to avoid stack-too-deep in tests
        (
            bool settled,
            bool storedOutcome,
            int64 storedPrice,
            int32 storedExpo,
            uint64 publishTime
        ) = resolver.settlements(marketId);
        assertTrue(settled);
        assertTrue(storedOutcome);
        assertEq(storedPrice, 150);
        assertEq(storedExpo, expo);
        assertEq(publishTime, endTime);
    }

    function test_tieBehavior_overWinsOnTie_true() public {
        bytes32 priceId = bytes32(uint256(2));
        uint64 endTime = 2000;
        int32 expo = -8;
        int64 strike = 100;

        vm.warp(endTime);

        bytes[] memory updateData = _updateData(priceId, strike, expo, endTime); // price == strike
        PythResolver.BinaryOptionMarket memory market = PythResolver
            .BinaryOptionMarket({
                priceId: priceId,
                endTime: endTime,
                strikePrice: strike,
                strikeExpo: expo,
                overWinsOnTie: true
            });

        (, bool resolvedToOver) = resolver.settleMarket(market, updateData);
        assertTrue(resolvedToOver);

        // Maker predicts over should win
        bytes memory encoded = _encodeOutcome(
            priceId,
            endTime,
            strike,
            expo,
            true,
            true
        );
        (, , bool parlaySuccess) = resolver.getPredictionResolution(encoded);
        assertTrue(parlaySuccess);
    }

    function test_tieBehavior_overWinsOnTie_false() public {
        bytes32 priceId = bytes32(uint256(3));
        uint64 endTime = 2000;
        int32 expo = -8;
        int64 strike = 100;

        vm.warp(endTime);

        bytes[] memory updateData = _updateData(priceId, strike, expo, endTime); // price == strike
        PythResolver.BinaryOptionMarket memory market = PythResolver
            .BinaryOptionMarket({
                priceId: priceId,
                endTime: endTime,
                strikePrice: strike,
                strikeExpo: expo,
                overWinsOnTie: false
            });

        (, bool resolvedToOver) = resolver.settleMarket(market, updateData);
        assertFalse(resolvedToOver);

        // Maker predicts over should lose
        bytes memory encoded = _encodeOutcome(
            priceId,
            endTime,
            strike,
            expo,
            false,
            true
        );
        (, , bool parlaySuccess) = resolver.getPredictionResolution(encoded);
        assertFalse(parlaySuccess);
    }

    function test_settleMarket_revertOnExpoMismatch() public {
        bytes32 priceId = bytes32(uint256(1));
        uint64 endTime = 2000;

        vm.warp(endTime);

        bytes[] memory updateData = _updateData(priceId, 150, -8, endTime);
        PythResolver.BinaryOptionMarket memory market = PythResolver
            .BinaryOptionMarket({
                priceId: priceId,
                endTime: endTime,
                strikePrice: 100,
                strikeExpo: -6,
                overWinsOnTie: true
            });

        vm.expectRevert(
            abi.encodeWithSelector(
                PythResolver.StrikeExpoMismatch.selector,
                int32(-6),
                int32(-8)
            )
        );
        resolver.settleMarket(market, updateData);
    }

    function test_settleMarket_revertIfPublishTimeOutOfRange() public {
        bytes32 priceId = bytes32(uint256(1));
        uint64 endTime = 2000;
        int32 expo = -8;

        vm.warp(endTime);

        // publishTimeSec doesn't match endTime, and window=0 => should revert
        bytes[] memory updateData = _updateData(priceId, 150, expo, endTime + 1);
        PythResolver.BinaryOptionMarket memory market = PythResolver
            .BinaryOptionMarket({
                priceId: priceId,
                endTime: endTime,
                strikePrice: 100,
                strikeExpo: expo,
                overWinsOnTie: true
            });

        vm.expectRevert(PythResolver.InvalidMarketData.selector);
        resolver.settleMarket(market, updateData);
    }

    function test_settleMarket_revertOnZeroPrice_missingByUpstreamSemantics() public {
        bytes32 priceId = bytes32(uint256(1));
        uint64 endTime = 2000;
        int32 expo = -8;

        vm.warp(endTime);

        // Upstream Pyth Lazer semantics treat value==0 as "ApplicableButMissing" for Price.
        // This should revert when the resolver tries to read the price.
        bytes[] memory updateData = _updateData(priceId, 0, expo, endTime);
        PythResolver.BinaryOptionMarket memory market = PythResolver
            .BinaryOptionMarket({
                priceId: priceId,
                endTime: endTime,
                strikePrice: 1, // any positive strike
                strikeExpo: expo,
                overWinsOnTie: true
            });

        vm.expectRevert("Price is not present for the timestamp");
        resolver.settleMarket(market, updateData);
    }
}


