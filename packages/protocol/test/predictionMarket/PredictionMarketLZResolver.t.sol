// SPDX-License-Identifier: MIT
pragma solidity ^0.8.19;

import {TestHelperOz5} from "@layerzerolabs/test-devtools-evm-foundry/contracts/TestHelperOz5.sol";
import {PredictionMarketLZResolver} from "../../src/predictionMarket/resolvers/PredictionMarketLZResolver.sol";
import {Encoder} from "../../src/bridge/cmdEncoder.sol";
import {BridgeTypes} from "../../src/bridge/BridgeTypes.sol";
import {Origin} from "@layerzerolabs/lz-evm-protocol-v2/contracts/interfaces/ILayerZeroEndpointV2.sol";
import {IPredictionMarketResolver} from "../../src/predictionMarket/interfaces/IPredictionMarketResolver.sol";

import "forge-std/Test.sol";
import "cannon-std/Cannon.sol";

/**
 * @title PredictionMarketLZResolverTestWrapper
 * @notice Wrapper to expose lzReceive for testing
 */
contract PredictionMarketLZResolverTestWrapper is PredictionMarketLZResolver {
    constructor(
        address _endpoint,
        address _owner,
        Settings memory _config
    ) PredictionMarketLZResolver(_endpoint, _owner, _config) {}

    function exposed_lzReceive(
        Origin calldata _origin,
        bytes32 _guid,
        bytes calldata _message,
        address _executor,
        bytes calldata _extraData
    ) external {
        _lzReceive(_origin, _guid, _message, _executor, _extraData);
    }
}

/**
 * @title PredictionMarketLZResolverTest
 * @notice Test suite for PredictionMarketLZResolver (PM side)
 */
contract PredictionMarketLZResolverTest is TestHelperOz5 {
    using Cannon for Vm;

    // Users
    address private owner = address(this);
    address private unauthorizedUser = address(0x1);

    // Contracts
    PredictionMarketLZResolverTestWrapper private pmResolver;
    PredictionMarketLZResolverTestWrapper private umaResolver; // Mock resolver on UMA side

    // LZ data
    uint32 private pmEiD = 1;
    uint32 private umaEiD = 2;

    address pmEndpoint;
    address umaEndpoint;

    // Test data
    uint256 public constant MAX_PREDICTION_MARKETS = 10;
    bytes32 public constant TEST_MARKET_ID = keccak256("test-market");

    function setUp() public override {
        vm.deal(owner, 100 ether);
        vm.deal(unauthorizedUser, 100 ether);

        super.setUp();
        setUpEndpoints(2, LibraryType.UltraLightNode);

        // Deploy PM-side resolver
        pmResolver = PredictionMarketLZResolverTestWrapper(
            payable(
                _deployOApp(
                    type(PredictionMarketLZResolverTestWrapper).creationCode,
                    abi.encode(
                        address(endpoints[pmEiD]),
                        owner,
                        PredictionMarketLZResolver.Settings({maxPredictionMarkets: MAX_PREDICTION_MARKETS})
                    )
                )
            )
        );

        // Deploy mock UMA-side resolver (just for message simulation)
        umaResolver = PredictionMarketLZResolverTestWrapper(
            payable(
                _deployOApp(
                    type(PredictionMarketLZResolverTestWrapper).creationCode,
                    abi.encode(
                        address(endpoints[umaEiD]),
                        owner,
                        PredictionMarketLZResolver.Settings({maxPredictionMarkets: MAX_PREDICTION_MARKETS})
                    )
                )
            )
        );

        address[] memory oapps = new address[](2);
        oapps[0] = address(pmResolver);
        oapps[1] = address(umaResolver);
        this.wireOApps(oapps);

        pmEndpoint = address(pmResolver.endpoint());
        umaEndpoint = address(umaResolver.endpoint());

        vm.deal(address(pmResolver), 100 ether);

        // Configure bridge
        pmResolver.setBridgeConfig(
            BridgeTypes.BridgeConfig({remoteEid: umaEiD, remoteBridge: address(umaResolver)})
        );
    }

    // ============ Constructor Tests ============

    function test_constructor_validParameters() public view {
        assertEq(address(pmResolver.owner()), owner, "Owner should be set");
        (uint256 maxPredictionMarkets) = pmResolver.config();
        assertEq(maxPredictionMarkets, MAX_PREDICTION_MARKETS, "Max markets should be set");
    }

    // ============ Configuration Tests ============

    function test_setBridgeConfig() public {
        BridgeTypes.BridgeConfig memory newConfig =
            BridgeTypes.BridgeConfig({remoteEid: 999, remoteBridge: address(0x1234)});

        pmResolver.setBridgeConfig(newConfig);

        BridgeTypes.BridgeConfig memory retrievedConfig = pmResolver.getBridgeConfig();
        assertEq(retrievedConfig.remoteEid, 999, "Remote EID should be updated");
        assertEq(retrievedConfig.remoteBridge, address(0x1234), "Remote bridge should be updated");
    }

    function test_setConfig() public {
        PredictionMarketLZResolver.Settings memory newConfig =
            PredictionMarketLZResolver.Settings({maxPredictionMarkets: 20});

        pmResolver.setConfig(newConfig);

        (uint256 maxPredictionMarkets) = pmResolver.config();
        assertEq(maxPredictionMarkets, 20, "Max markets should be updated");
    }

    function test_configuration_onlyOwner() public {
        vm.prank(unauthorizedUser);
        vm.expectRevert();
        pmResolver.setBridgeConfig(
            BridgeTypes.BridgeConfig({remoteEid: umaEiD, remoteBridge: address(umaResolver)})
        );

        vm.prank(unauthorizedUser);
        vm.expectRevert();
        pmResolver.setConfig(PredictionMarketLZResolver.Settings({maxPredictionMarkets: 20}));
    }

    // ============ Validation Tests ============

    function test_validatePredictionMarkets_success() public view {
        PredictionMarketLZResolver.PredictedOutcome[] memory outcomes =
            new PredictionMarketLZResolver.PredictedOutcome[](1);
        outcomes[0] = PredictionMarketLZResolver.PredictedOutcome({
            marketId: TEST_MARKET_ID,
            prediction: true
        });

        bytes memory encodedOutcomes = abi.encode(outcomes);

        (bool isValid, IPredictionMarketResolver.Error error) = pmResolver.validatePredictionMarkets(encodedOutcomes);

        assertTrue(isValid, "Should be valid");
        assertEq(uint256(error), uint256(IPredictionMarketResolver.Error.NO_ERROR), "Should have no error");
    }

    function test_validatePredictionMarkets_noMarkets() public {
        PredictionMarketLZResolver.PredictedOutcome[] memory outcomes =
            new PredictionMarketLZResolver.PredictedOutcome[](0);
        bytes memory encodedOutcomes = abi.encode(outcomes);

        vm.expectRevert(PredictionMarketLZResolver.MustHaveAtLeastOneMarket.selector);
        pmResolver.validatePredictionMarkets(encodedOutcomes);
    }

    function test_validatePredictionMarkets_tooManyMarkets() public {
        PredictionMarketLZResolver.PredictedOutcome[] memory outcomes =
            new PredictionMarketLZResolver.PredictedOutcome[](MAX_PREDICTION_MARKETS + 1);
        for (uint256 i = 0; i < MAX_PREDICTION_MARKETS + 1; i++) {
            outcomes[i] = PredictionMarketLZResolver.PredictedOutcome({
                marketId: keccak256(abi.encodePacked("market", i)),
                prediction: true
            });
        }

        bytes memory encodedOutcomes = abi.encode(outcomes);

        vm.expectRevert(PredictionMarketLZResolver.TooManyMarkets.selector);
        pmResolver.validatePredictionMarkets(encodedOutcomes);
    }

    function test_validatePredictionMarkets_invalidMarket() public view {
        PredictionMarketLZResolver.PredictedOutcome[] memory outcomes =
            new PredictionMarketLZResolver.PredictedOutcome[](1);
        outcomes[0] = PredictionMarketLZResolver.PredictedOutcome({
            marketId: bytes32(0),
            prediction: true
        });

        bytes memory encodedOutcomes = abi.encode(outcomes);

        (bool isValid, IPredictionMarketResolver.Error error) = pmResolver.validatePredictionMarkets(encodedOutcomes);

        assertFalse(isValid, "Should be invalid");
        assertEq(uint256(error), uint256(IPredictionMarketResolver.Error.INVALID_MARKET), "Should have invalid market error");
    }

    function test_validatePredictionMarkets_multipleMarkets() public view {
        PredictionMarketLZResolver.PredictedOutcome[] memory outcomes =
            new PredictionMarketLZResolver.PredictedOutcome[](3);
        for (uint256 i = 0; i < 3; i++) {
            outcomes[i] = PredictionMarketLZResolver.PredictedOutcome({
                marketId: keccak256(abi.encodePacked("market", i)),
                prediction: i % 2 == 0
            });
        }

        bytes memory encodedOutcomes = abi.encode(outcomes);

        (bool isValid, IPredictionMarketResolver.Error error) = pmResolver.validatePredictionMarkets(encodedOutcomes);

        assertTrue(isValid, "Should be valid");
        assertEq(uint256(error), uint256(IPredictionMarketResolver.Error.NO_ERROR), "Should have no error");
    }

    // ============ Resolution Tests ============

    function test_getPredictionResolution_noMarketsWrapped() public view {
        PredictionMarketLZResolver.PredictedOutcome[] memory outcomes =
            new PredictionMarketLZResolver.PredictedOutcome[](1);
        outcomes[0] = PredictionMarketLZResolver.PredictedOutcome({
            marketId: TEST_MARKET_ID,
            prediction: true
        });

        bytes memory encodedOutcomes = abi.encode(outcomes);

        (bool isResolved, IPredictionMarketResolver.Error error, bool parlaySuccess) =
            pmResolver.getPredictionResolution(encodedOutcomes);

        assertFalse(isResolved, "Should not be resolved");
        assertEq(uint256(error), uint256(IPredictionMarketResolver.Error.MARKET_NOT_SETTLED), "Should have MARKET_NOT_SETTLED error");
        assertTrue(parlaySuccess, "Parlay success should default to true");
    }

    function test_getPredictionResolution_invalidMarket() public view {
        PredictionMarketLZResolver.PredictedOutcome[] memory outcomes =
            new PredictionMarketLZResolver.PredictedOutcome[](1);
        outcomes[0] = PredictionMarketLZResolver.PredictedOutcome({
            marketId: bytes32(0),
            prediction: true
        });

        bytes memory encodedOutcomes = abi.encode(outcomes);

        (bool isResolved, IPredictionMarketResolver.Error error, bool parlaySuccess) =
            pmResolver.getPredictionResolution(encodedOutcomes);

        assertFalse(isResolved, "Should not be resolved");
        assertEq(uint256(error), uint256(IPredictionMarketResolver.Error.INVALID_MARKET), "Should have invalid market error");
        assertTrue(parlaySuccess, "Parlay success should default to true");
    }

    function test_getPredictionResolution_unsettledMarket() public {
        // First, simulate market being wrapped but not settled via LayerZero message
        _simulateMarketResolved(TEST_MARKET_ID, true, false, false); // assertedTruthfully = false means not settled

        PredictionMarketLZResolver.PredictedOutcome[] memory outcomes =
            new PredictionMarketLZResolver.PredictedOutcome[](1);
        outcomes[0] = PredictionMarketLZResolver.PredictedOutcome({
            marketId: TEST_MARKET_ID,
            prediction: true
        });

        bytes memory encodedOutcomes = abi.encode(outcomes);

        (bool isResolved, IPredictionMarketResolver.Error error, bool parlaySuccess) =
            pmResolver.getPredictionResolution(encodedOutcomes);

        assertFalse(isResolved, "Should not be resolved");
        assertEq(uint256(error), uint256(IPredictionMarketResolver.Error.MARKET_NOT_SETTLED), "Should have MARKET_NOT_SETTLED error");
        assertTrue(parlaySuccess, "Parlay success should default to true");
    }

    function test_getPredictionResolution_settledCorrect() public {
        // Simulate market being resolved to YES
        _simulateMarketResolved(TEST_MARKET_ID, true, true, true);

        PredictionMarketLZResolver.PredictedOutcome[] memory outcomes =
            new PredictionMarketLZResolver.PredictedOutcome[](1);
        outcomes[0] = PredictionMarketLZResolver.PredictedOutcome({
            marketId: TEST_MARKET_ID,
            prediction: true // Correct prediction
        });

        bytes memory encodedOutcomes = abi.encode(outcomes);

        (bool isResolved, IPredictionMarketResolver.Error error, bool parlaySuccess) =
            pmResolver.getPredictionResolution(encodedOutcomes);

        assertTrue(isResolved, "Should be resolved");
        assertEq(uint256(error), uint256(IPredictionMarketResolver.Error.NO_ERROR), "Should have no error");
        assertTrue(parlaySuccess, "Parlay should succeed");
    }

    function test_getPredictionResolution_settledIncorrect() public {
        // Simulate market being resolved to YES
        _simulateMarketResolved(TEST_MARKET_ID, true, true, true);

        PredictionMarketLZResolver.PredictedOutcome[] memory outcomes =
            new PredictionMarketLZResolver.PredictedOutcome[](1);
        outcomes[0] = PredictionMarketLZResolver.PredictedOutcome({
            marketId: TEST_MARKET_ID,
            prediction: false // Wrong prediction
        });

        bytes memory encodedOutcomes = abi.encode(outcomes);

        (bool isResolved, IPredictionMarketResolver.Error error, bool parlaySuccess) =
            pmResolver.getPredictionResolution(encodedOutcomes);

        assertTrue(isResolved, "Should be resolved");
        assertEq(uint256(error), uint256(IPredictionMarketResolver.Error.NO_ERROR), "Should have no error");
        assertFalse(parlaySuccess, "Parlay should fail");
    }

    function test_getPredictionResolution_multipleMarkets() public {
        bytes32 marketId1 = keccak256("market1");
        bytes32 marketId2 = keccak256("market2");
        bytes32 marketId3 = keccak256("market3");

        // Resolve all markets to YES
        _simulateMarketResolved(marketId1, true, true, true);
        _simulateMarketResolved(marketId2, true, true, true);
        _simulateMarketResolved(marketId3, true, true, true);

        PredictionMarketLZResolver.PredictedOutcome[] memory outcomes =
            new PredictionMarketLZResolver.PredictedOutcome[](3);
        outcomes[0] = PredictionMarketLZResolver.PredictedOutcome({marketId: marketId1, prediction: true});
        outcomes[1] = PredictionMarketLZResolver.PredictedOutcome({marketId: marketId2, prediction: true});
        outcomes[2] = PredictionMarketLZResolver.PredictedOutcome({marketId: marketId3, prediction: true});

        bytes memory encodedOutcomes = abi.encode(outcomes);

        (bool isResolved, IPredictionMarketResolver.Error error, bool parlaySuccess) =
            pmResolver.getPredictionResolution(encodedOutcomes);

        assertTrue(isResolved, "Should be resolved");
        assertEq(uint256(error), uint256(IPredictionMarketResolver.Error.NO_ERROR), "Should have no error");
        assertTrue(parlaySuccess, "Parlay should succeed - all correct");
    }

    function test_getPredictionResolution_decisiveLoss() public {
        bytes32 marketId1 = keccak256("market1");
        bytes32 marketId2 = keccak256("market2");

        // Resolve all markets to YES
        _simulateMarketResolved(marketId1, true, true, true);
        // marketId2 is not settled

        PredictionMarketLZResolver.PredictedOutcome[] memory outcomes =
            new PredictionMarketLZResolver.PredictedOutcome[](2);
        outcomes[0] = PredictionMarketLZResolver.PredictedOutcome({marketId: marketId1, prediction: false}); // Wrong
        outcomes[1] = PredictionMarketLZResolver.PredictedOutcome({marketId: marketId2, prediction: true});

        bytes memory encodedOutcomes = abi.encode(outcomes);

        (bool isResolved, IPredictionMarketResolver.Error error, bool parlaySuccess) =
            pmResolver.getPredictionResolution(encodedOutcomes);

        // Should return decisive loss even though second market is unsettled
        assertTrue(isResolved, "Should be resolved due to decisive loss");
        assertEq(uint256(error), uint256(IPredictionMarketResolver.Error.NO_ERROR), "Should have no error");
        assertFalse(parlaySuccess, "Parlay should fail - wrong prediction");
    }

    // ============ Encoding/Decoding Tests ============

    function test_encodePredictionOutcomes() public view {
        PredictionMarketLZResolver.PredictedOutcome[] memory outcomes =
            new PredictionMarketLZResolver.PredictedOutcome[](2);
        outcomes[0] = PredictionMarketLZResolver.PredictedOutcome({
            marketId: keccak256("market1"),
            prediction: true
        });
        outcomes[1] = PredictionMarketLZResolver.PredictedOutcome({
            marketId: keccak256("market2"),
            prediction: false
        });

        bytes memory encoded = pmResolver.encodePredictionOutcomes(outcomes);

        // Decode and verify
        PredictionMarketLZResolver.PredictedOutcome[] memory decoded = pmResolver.decodePredictionOutcomes(encoded);

        assertEq(decoded.length, 2, "Length should match");
        assertEq(decoded[0].marketId, keccak256("market1"), "Market ID 1 should match");
        assertTrue(decoded[0].prediction, "Prediction 1 should be true");
        assertEq(decoded[1].marketId, keccak256("market2"), "Market ID 2 should match");
        assertFalse(decoded[1].prediction, "Prediction 2 should be false");
    }

    function test_decodePredictionOutcomes() public view {
        PredictionMarketLZResolver.PredictedOutcome[] memory outcomes =
            new PredictionMarketLZResolver.PredictedOutcome[](1);
        outcomes[0] = PredictionMarketLZResolver.PredictedOutcome({
            marketId: TEST_MARKET_ID,
            prediction: true
        });

        bytes memory encoded = abi.encode(outcomes);
        PredictionMarketLZResolver.PredictedOutcome[] memory decoded = pmResolver.decodePredictionOutcomes(encoded);

        assertEq(decoded.length, 1, "Length should match");
        assertEq(decoded[0].marketId, TEST_MARKET_ID, "Market ID should match");
        assertTrue(decoded[0].prediction, "Prediction should be true");
    }

    // ============ View Functions Tests ============

    function test_getMarket() public view {
        PredictionMarketLZResolver.WrappedMarket memory market = pmResolver.getMarket(TEST_MARKET_ID);

        assertEq(market.marketId, bytes32(0), "Market should not exist initially");
        assertFalse(market.settled, "Market should not be settled");
        assertFalse(market.resolvedToYes, "Market should not be resolved");
    }

    function test_isMarketSettled() public view {
        bool settled = pmResolver.isMarketSettled(TEST_MARKET_ID);
        assertFalse(settled, "Market should not be settled initially");
    }

    function test_getMarketResolution() public {
        // First settle the market
        _simulateMarketResolved(TEST_MARKET_ID, true, true, true);

        bool resolvedToYes = pmResolver.getMarketResolution(TEST_MARKET_ID);
        assertTrue(resolvedToYes, "Market should be resolved to YES");
    }

    function test_getMarketResolution_revertIfNotSettled() public {
        vm.expectRevert("Market not settled");
        pmResolver.getMarketResolution(TEST_MARKET_ID);
    }

    // ============ LayerZero Message Tests ============

    function test_lzReceive_validMessage() public {
        _simulateMarketResolved(TEST_MARKET_ID, true, true, true);

        PredictionMarketLZResolver.WrappedMarket memory market = pmResolver.getMarket(TEST_MARKET_ID);
        assertEq(market.marketId, TEST_MARKET_ID, "Market ID should be set");
        assertTrue(market.settled, "Market should be settled");
        assertTrue(market.resolvedToYes, "Market should be resolved to YES");
    }

    function test_lzReceive_invalidSourceChain() public {
        // Try to receive message from wrong chain
        Origin memory wrongOrigin = Origin({
            srcEid: 999, // Wrong EID
            sender: bytes32(uint256(uint160(address(umaResolver)))),
            nonce: 1
        });

        bytes memory message = _buildMarketResolvedMessage(TEST_MARKET_ID, true, true, true);
        bytes memory options = "";

        vm.expectRevert(
            abi.encodeWithSelector(
                PredictionMarketLZResolver.InvalidSourceChain.selector, umaEiD, 999
            )
        );

        pmResolver.exposed_lzReceive(wrongOrigin, bytes32(0), message, address(0), options);
    }

    function test_lzReceive_invalidSender() public {
        Origin memory wrongOrigin = Origin({
            srcEid: umaEiD,
            sender: bytes32(uint256(uint160(address(0xBAD)))),
            nonce: 1
        });

        bytes memory message = _buildMarketResolvedMessage(TEST_MARKET_ID, true, true, true);
        bytes memory options = "";

        vm.expectRevert(
            abi.encodeWithSelector(
                PredictionMarketLZResolver.InvalidSender.selector, address(umaResolver), address(0xBAD)
            )
        );

        pmResolver.exposed_lzReceive(wrongOrigin, bytes32(0), message, address(0), options);
    }

    function test_lzReceive_invalidCommandType() public {
        // Build message with invalid command type
        bytes memory commandPayload = Encoder.encodeFromUMAMarketResolved(TEST_MARKET_ID, true, true);
        bytes memory message = abi.encode(uint16(999), commandPayload); // Invalid command

        Origin memory origin = Origin({
            srcEid: umaEiD,
            sender: bytes32(uint256(uint160(address(umaResolver)))),
            nonce: 1
        });

        vm.expectRevert(abi.encodeWithSelector(PredictionMarketLZResolver.InvalidCommandType.selector, 999));

        pmResolver.exposed_lzReceive(origin, bytes32(0), message, address(0), "");
    }

    // ============ Helper Functions ============

    function _simulateMarketResolved(bytes32 marketId, bool resolvedToYes, bool assertedTruthfully, bool sendToResolver)
        internal
    {
        bytes memory message = _buildMarketResolvedMessage(marketId, resolvedToYes, assertedTruthfully, sendToResolver);

        Origin memory origin = Origin({
            srcEid: umaEiD,
            sender: bytes32(uint256(uint160(address(umaResolver)))),
            nonce: 1
        });

        if (sendToResolver) {
            pmResolver.exposed_lzReceive(origin, bytes32(0), message, address(0), "");
        }
    }

    function _buildMarketResolvedMessage(bytes32 marketId, bool resolvedToYes, bool assertedTruthfully, bool encodeMessage)
        internal
        pure
        returns (bytes memory)
    {
        bytes memory commandPayload = Encoder.encodeFromUMAMarketResolved(marketId, resolvedToYes, assertedTruthfully);
        if (encodeMessage) {
            return abi.encode(Encoder.CMD_FROM_UMA_MARKET_RESOLVED, commandPayload);
        }
        return commandPayload;
    }

}

