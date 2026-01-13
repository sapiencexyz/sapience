// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import {TestHelperOz5} from "@layerzerolabs/test-devtools-evm-foundry/contracts/TestHelperOz5.sol";
import {PredictionMarketLZConditionalTokensResolver} from "../../src/predictionMarket/resolvers/PredictionMarketLZConditionalTokensResolver.sol";
import {IPredictionMarketLZConditionalTokensResolver} from "../../src/predictionMarket/resolvers/interfaces/IPredictionMarketLZConditionalTokensResolver.sol";
import {Origin} from "@layerzerolabs/lz-evm-protocol-v2/contracts/interfaces/ILayerZeroEndpointV2.sol";
import {IPredictionMarketResolver} from "../../src/predictionMarket/interfaces/IPredictionMarketResolver.sol";
import {Encoder} from "../../src/bridge/cmdEncoder.sol";
import {BridgeTypes} from "../../src/bridge/BridgeTypes.sol";

import "forge-std/Test.sol";

/**
 * @title PredictionMarketLZConditionalTokensResolverTestWrapper
 * @notice Wrapper to expose internal functions for testing
 */
contract PredictionMarketLZConditionalTokensResolverTestWrapper is PredictionMarketLZConditionalTokensResolver {
    constructor(
        address _endpoint,
        address _owner,
        Settings memory _config
    ) PredictionMarketLZConditionalTokensResolver(_endpoint, _owner, _config) {}

    /// @notice Exposed lzReceive for testing callback decoding
    function exposed_lzReceive(
        Origin calldata _origin,
        bytes32 _guid,
        bytes calldata _message,
        address _executor,
        bytes calldata _extraData
    ) external {
        _lzReceive(_origin, _guid, _message, _executor, _extraData);
    }

    /// @notice Exposed finalizeResolution for direct unit testing
    function exposed_finalizeResolution(
        bytes32 conditionId,
        uint256 denom,
        uint256 noPayout,
        uint256 yesPayout
    ) external {
        _finalizeResolution(conditionId, denom, noPayout, yesPayout);
    }
}

/**
 * @title PredictionMarketLZConditionalTokensResolverTest
 * @notice Test suite for PredictionMarketLZConditionalTokensResolver
 */
contract PredictionMarketLZConditionalTokensResolverTest is TestHelperOz5 {
    // Users
    address private owner = address(this);
    address private unauthorizedUser = address(0x1);
    address private conditionalTokensReader = address(0x1234);

    // Contracts
    PredictionMarketLZConditionalTokensResolverTestWrapper private resolver;

    // LZ data
    uint32 private localEid = 1;
    uint32 private remoteEid = 2; // Polygon EID

    address localEndpoint;

    // Test data
    uint256 public constant MAX_PREDICTION_MARKETS = 10;
    
    bytes32 public constant TEST_CONDITION_ID = keccak256("test-condition");
    bytes32 public constant TEST_CONDITION_ID_2 = keccak256("test-condition-2");
    bytes32 public constant TEST_CONDITION_ID_3 = keccak256("test-condition-3");

    function setUp() public override {
        vm.deal(owner, 100 ether);
        vm.deal(unauthorizedUser, 100 ether);

        super.setUp();
        setUpEndpoints(3, LibraryType.UltraLightNode);

        // Deploy resolver
        resolver = PredictionMarketLZConditionalTokensResolverTestWrapper(
            payable(
                _deployOApp(
                    type(PredictionMarketLZConditionalTokensResolverTestWrapper).creationCode,
                    abi.encode(
                        address(endpoints[localEid]),
                        owner,
                        IPredictionMarketLZConditionalTokensResolver.Settings({
                            maxPredictionMarkets: MAX_PREDICTION_MARKETS
                        })
                    )
                )
            )
        );

        localEndpoint = address(resolver.endpoint());

        // Set bridge config
        resolver.setBridgeConfig(BridgeTypes.BridgeConfig({
            remoteEid: remoteEid,
            remoteBridge: conditionalTokensReader
        }));

        // Set peer for remote chain
        resolver.setPeer(remoteEid, bytes32(uint256(uint160(conditionalTokensReader))));

        vm.deal(address(resolver), 100 ether);
    }

    // ============ Constructor Tests ============

    function test_constructor_validParameters() public view {
        assertEq(address(resolver.owner()), owner, "Owner should be set");
        
        uint256 maxPredictionMarkets = resolver.config();
        assertEq(maxPredictionMarkets, MAX_PREDICTION_MARKETS, "Max markets should be set");
    }

    // ============ Configuration Tests ============

    function test_setConfig() public {
        IPredictionMarketLZConditionalTokensResolver.Settings memory newConfig =
            IPredictionMarketLZConditionalTokensResolver.Settings({
                maxPredictionMarkets: 20
            });

        resolver.setConfig(newConfig);

        uint256 maxPredictionMarkets = resolver.config();
        assertEq(maxPredictionMarkets, 20, "Max markets should be updated");
    }

    function test_setConfig_onlyOwner() public {
        vm.prank(unauthorizedUser);
        vm.expectRevert();
        resolver.setConfig(
            IPredictionMarketLZConditionalTokensResolver.Settings({
                maxPredictionMarkets: 20
            })
        );
    }

    function test_setBridgeConfig() public {
        address testBridge = address(0xABCD);
        BridgeTypes.BridgeConfig memory newConfig = BridgeTypes.BridgeConfig({
            remoteEid: 999,
            remoteBridge: testBridge
        });

        resolver.setBridgeConfig(newConfig);

        BridgeTypes.BridgeConfig memory config = resolver.getBridgeConfig();
        assertEq(config.remoteEid, 999, "Remote EID should be updated");
        assertEq(config.remoteBridge, testBridge, "Remote bridge should be updated");
    }

    // ============ Validation Tests ============

    function test_validatePredictionMarkets_success() public view {
        IPredictionMarketLZConditionalTokensResolver.PredictedOutcome[] memory outcomes =
            new IPredictionMarketLZConditionalTokensResolver.PredictedOutcome[](1);
        outcomes[0] = IPredictionMarketLZConditionalTokensResolver.PredictedOutcome({
            marketId: TEST_CONDITION_ID,
            prediction: true
        });

        bytes memory encodedOutcomes = abi.encode(outcomes);

        (bool isValid, IPredictionMarketResolver.Error error) = resolver.validatePredictionMarkets(encodedOutcomes);

        assertTrue(isValid, "Should be valid");
        assertEq(uint256(error), uint256(IPredictionMarketResolver.Error.NO_ERROR), "Should have no error");
    }

    function test_validatePredictionMarkets_noMarkets() public {
        IPredictionMarketLZConditionalTokensResolver.PredictedOutcome[] memory outcomes =
            new IPredictionMarketLZConditionalTokensResolver.PredictedOutcome[](0);
        bytes memory encodedOutcomes = abi.encode(outcomes);

        vm.expectRevert(IPredictionMarketLZConditionalTokensResolver.MustHaveAtLeastOneMarket.selector);
        resolver.validatePredictionMarkets(encodedOutcomes);
    }

    function test_validatePredictionMarkets_tooManyMarkets() public {
        IPredictionMarketLZConditionalTokensResolver.PredictedOutcome[] memory outcomes =
            new IPredictionMarketLZConditionalTokensResolver.PredictedOutcome[](MAX_PREDICTION_MARKETS + 1);
        for (uint256 i = 0; i < MAX_PREDICTION_MARKETS + 1; i++) {
            outcomes[i] = IPredictionMarketLZConditionalTokensResolver.PredictedOutcome({
                marketId: keccak256(abi.encodePacked("condition", i)),
                prediction: true
            });
        }

        bytes memory encodedOutcomes = abi.encode(outcomes);

        vm.expectRevert(IPredictionMarketLZConditionalTokensResolver.TooManyMarkets.selector);
        resolver.validatePredictionMarkets(encodedOutcomes);
    }

    function test_validatePredictionMarkets_invalidConditionId() public view {
        IPredictionMarketLZConditionalTokensResolver.PredictedOutcome[] memory outcomes =
            new IPredictionMarketLZConditionalTokensResolver.PredictedOutcome[](1);
        outcomes[0] = IPredictionMarketLZConditionalTokensResolver.PredictedOutcome({
            marketId: bytes32(0),
            prediction: true
        });

        bytes memory encodedOutcomes = abi.encode(outcomes);

        (bool isValid, IPredictionMarketResolver.Error error) = resolver.validatePredictionMarkets(encodedOutcomes);

        assertFalse(isValid, "Should be invalid");
        assertEq(uint256(error), uint256(IPredictionMarketResolver.Error.INVALID_MARKET), "Should have invalid market error");
    }

    // ============ Resolution Finalization Tests (Binary Payout Logic) ============

    function test_finalizeResolution_yesOutcome() public {
        // denom=1, no=0, yes=1 => YES wins
        resolver.exposed_finalizeResolution(TEST_CONDITION_ID, 1, 0, 1);

        IPredictionMarketLZConditionalTokensResolver.ConditionState memory condition =
            resolver.getCondition(TEST_CONDITION_ID);

        assertTrue(condition.settled, "Should be settled");
        assertFalse(condition.invalid, "Should not be invalid");
        assertTrue(condition.resolvedToYes, "Should resolve to YES");
        assertEq(condition.payoutDenominator, 1, "Denom should be 1");
        assertEq(condition.noPayout, 0, "No payout should be 0");
        assertEq(condition.yesPayout, 1, "Yes payout should be 1");
    }

    function test_finalizeResolution_noOutcome() public {
        // denom=1, no=1, yes=0 => NO wins
        resolver.exposed_finalizeResolution(TEST_CONDITION_ID, 1, 1, 0);

        IPredictionMarketLZConditionalTokensResolver.ConditionState memory condition =
            resolver.getCondition(TEST_CONDITION_ID);

        assertTrue(condition.settled, "Should be settled");
        assertFalse(condition.invalid, "Should not be invalid");
        assertFalse(condition.resolvedToYes, "Should resolve to NO");
        assertEq(condition.payoutDenominator, 1, "Denom should be 1");
        assertEq(condition.noPayout, 1, "No payout should be 1");
        assertEq(condition.yesPayout, 0, "Yes payout should be 0");
    }

    function test_finalizeResolution_yesWithLargerDenom() public {
        // denom=100, no=0, yes=100 => YES wins
        resolver.exposed_finalizeResolution(TEST_CONDITION_ID, 100, 0, 100);

        IPredictionMarketLZConditionalTokensResolver.ConditionState memory condition =
            resolver.getCondition(TEST_CONDITION_ID);

        assertTrue(condition.settled, "Should be settled");
        assertFalse(condition.invalid, "Should not be invalid");
        assertTrue(condition.resolvedToYes, "Should resolve to YES");
    }

    function test_finalizeResolution_noWithLargerDenom() public {
        // denom=100, no=100, yes=0 => NO wins
        resolver.exposed_finalizeResolution(TEST_CONDITION_ID, 100, 100, 0);

        IPredictionMarketLZConditionalTokensResolver.ConditionState memory condition =
            resolver.getCondition(TEST_CONDITION_ID);

        assertTrue(condition.settled, "Should be settled");
        assertFalse(condition.invalid, "Should not be invalid");
        assertFalse(condition.resolvedToYes, "Should resolve to NO");
    }

    function test_finalizeResolution_unresolved() public {
        // denom=0 means unresolved
        resolver.exposed_finalizeResolution(TEST_CONDITION_ID, 0, 0, 0);

        IPredictionMarketLZConditionalTokensResolver.ConditionState memory condition =
            resolver.getCondition(TEST_CONDITION_ID);

        assertFalse(condition.settled, "Should not be settled");
        assertFalse(condition.invalid, "Should not be invalid");
        assertEq(condition.payoutDenominator, 0, "Denom should be 0");
    }

    function test_finalizeResolution_nonBinary_split_marksInvalid() public {
        // denom=2, no=1, yes=1 => Split payout (ambiguous) => marks invalid, does NOT revert
        resolver.exposed_finalizeResolution(TEST_CONDITION_ID, 2, 1, 1);

        IPredictionMarketLZConditionalTokensResolver.ConditionState memory condition =
            resolver.getCondition(TEST_CONDITION_ID);

        assertFalse(condition.settled, "Should not be settled");
        assertTrue(condition.invalid, "Should be marked invalid");
        assertEq(condition.payoutDenominator, 2, "Denom should be stored");
        assertEq(condition.noPayout, 1, "No payout should be stored");
        assertEq(condition.yesPayout, 1, "Yes payout should be stored");
    }

    function test_finalizeResolution_nonBinary_invalidSum_marksInvalid() public {
        // denom=100, no=50, yes=30 => Sum != denom => marks invalid, does NOT revert
        resolver.exposed_finalizeResolution(TEST_CONDITION_ID, 100, 50, 30);

        IPredictionMarketLZConditionalTokensResolver.ConditionState memory condition =
            resolver.getCondition(TEST_CONDITION_ID);

        assertFalse(condition.settled, "Should not be settled");
        assertTrue(condition.invalid, "Should be marked invalid");
    }

    // ============ lzReceive Tests (Single Message Flow) ============

    function test_lzReceive_validMessage_settlesCondition() public {
        Origin memory origin = Origin({
            srcEid: remoteEid,
            sender: bytes32(uint256(uint160(conditionalTokensReader))), // Origin sender is bytes32
            nonce: 1
        });

        // Encode resolution response message
        bytes memory commandPayload = Encoder.encodeFromConditionalTokenReaderResolutionResponse(
            TEST_CONDITION_ID,
            1, // denom
            0, // noPayout
            1  // yesPayout
        );
        bytes memory message = abi.encode(Encoder.CMD_FROM_CONDITIONAL_TOKEN_READER_RESOLUTION_RESPONSE, commandPayload);

        // Simulate receiving the message
        resolver.exposed_lzReceive(origin, bytes32(0), message, address(0), "");

        // Condition should be settled
        assertTrue(resolver.isConditionSettled(TEST_CONDITION_ID), "Should be settled");
        
        IPredictionMarketLZConditionalTokensResolver.ConditionState memory condition = resolver.getCondition(TEST_CONDITION_ID);
        assertTrue(condition.resolvedToYes, "Should resolve to YES");
        assertFalse(condition.invalid, "Should not be invalid");
    }

    function test_lzReceive_invalidSourceChain() public {
        Origin memory origin = Origin({
            srcEid: 999, // Wrong EID
            sender: bytes32(uint256(uint160(conditionalTokensReader))),
            nonce: 1
        });

        bytes memory commandPayload = Encoder.encodeFromConditionalTokenReaderResolutionResponse(
            TEST_CONDITION_ID, 1, 0, 1
        );
        bytes memory message = abi.encode(Encoder.CMD_FROM_CONDITIONAL_TOKEN_READER_RESOLUTION_RESPONSE, commandPayload);

        vm.expectRevert(
            abi.encodeWithSelector(
                IPredictionMarketLZConditionalTokensResolver.InvalidSourceChain.selector,
                remoteEid,
                999
            )
        );
        resolver.exposed_lzReceive(origin, bytes32(0), message, address(0), "");
    }

    function test_lzReceive_invalidSender() public {
        Origin memory origin = Origin({
            srcEid: remoteEid,
            sender: bytes32(uint256(uint160(address(0xBAD)))), // Wrong sender
            nonce: 1
        });

        bytes memory commandPayload = Encoder.encodeFromConditionalTokenReaderResolutionResponse(
            TEST_CONDITION_ID, 1, 0, 1
        );
        bytes memory message = abi.encode(Encoder.CMD_FROM_CONDITIONAL_TOKEN_READER_RESOLUTION_RESPONSE, commandPayload);

        vm.expectRevert(
            abi.encodeWithSelector(
                IPredictionMarketLZConditionalTokensResolver.InvalidSender.selector,
                bytes32(uint256(uint160(conditionalTokensReader))),
                bytes32(uint256(uint160(address(0xBAD))))
            )
        );
        resolver.exposed_lzReceive(origin, bytes32(0), message, address(0), "");
    }

    function test_lzReceive_invalidCommandType() public {
        Origin memory origin = Origin({
            srcEid: remoteEid,
            sender: bytes32(uint256(uint160(conditionalTokensReader))), // Origin sender is bytes32
            nonce: 1
        });

        // Wrong command type
        bytes memory message = abi.encode(uint16(999), abi.encode(TEST_CONDITION_ID, 1, 0, 1));

        vm.expectRevert(
            abi.encodeWithSelector(
                IPredictionMarketLZConditionalTokensResolver.InvalidCommandType.selector,
                999
            )
        );
        resolver.exposed_lzReceive(origin, bytes32(0), message, address(0), "");
    }

    function test_lzReceive_nonBinaryDoesNotRevert() public {
        Origin memory origin = Origin({
            srcEid: remoteEid,
            sender: bytes32(uint256(uint160(conditionalTokensReader))), // Origin sender is bytes32
            nonce: 1
        });

        // Send non-binary: denom=2, no=1, yes=1 (split payout)
        bytes memory commandPayload = Encoder.encodeFromConditionalTokenReaderResolutionResponse(
            TEST_CONDITION_ID, 2, 1, 1
        );
        bytes memory message = abi.encode(Encoder.CMD_FROM_CONDITIONAL_TOKEN_READER_RESOLUTION_RESPONSE, commandPayload);

        // This should NOT revert
        resolver.exposed_lzReceive(origin, bytes32(0), message, address(0), "");

        // Should be marked invalid, not reverted
        IPredictionMarketLZConditionalTokensResolver.ConditionState memory condition = resolver.getCondition(TEST_CONDITION_ID);
        assertFalse(condition.settled, "Should not be settled");
        assertTrue(condition.invalid, "Should be marked invalid");
    }

    // ============ Resolution Query Tests ============

    function test_getPredictionResolution_notQueried() public view {
        IPredictionMarketLZConditionalTokensResolver.PredictedOutcome[] memory outcomes =
            new IPredictionMarketLZConditionalTokensResolver.PredictedOutcome[](1);
        outcomes[0] = IPredictionMarketLZConditionalTokensResolver.PredictedOutcome({
            marketId: TEST_CONDITION_ID,
            prediction: true
        });

        bytes memory encodedOutcomes = abi.encode(outcomes);

        (bool isResolved, IPredictionMarketResolver.Error error, bool parlaySuccess) =
            resolver.getPredictionResolution(encodedOutcomes);

        assertFalse(isResolved, "Should not be resolved");
        assertEq(uint256(error), uint256(IPredictionMarketResolver.Error.MARKET_NOT_SETTLED), "Should have MARKET_NOT_SETTLED error");
        assertTrue(parlaySuccess, "Parlay success should default to true");
    }

    function test_getPredictionResolution_settledCorrect() public {
        // Settle condition to YES
        resolver.exposed_finalizeResolution(TEST_CONDITION_ID, 1, 0, 1);

        IPredictionMarketLZConditionalTokensResolver.PredictedOutcome[] memory outcomes =
            new IPredictionMarketLZConditionalTokensResolver.PredictedOutcome[](1);
        outcomes[0] = IPredictionMarketLZConditionalTokensResolver.PredictedOutcome({
            marketId: TEST_CONDITION_ID,
            prediction: true // Correct prediction
        });

        bytes memory encodedOutcomes = abi.encode(outcomes);

        (bool isResolved, IPredictionMarketResolver.Error error, bool parlaySuccess) =
            resolver.getPredictionResolution(encodedOutcomes);

        assertTrue(isResolved, "Should be resolved");
        assertEq(uint256(error), uint256(IPredictionMarketResolver.Error.NO_ERROR), "Should have no error");
        assertTrue(parlaySuccess, "Parlay should succeed");
    }

    function test_getPredictionResolution_settledIncorrect() public {
        // Settle condition to YES
        resolver.exposed_finalizeResolution(TEST_CONDITION_ID, 1, 0, 1);

        IPredictionMarketLZConditionalTokensResolver.PredictedOutcome[] memory outcomes =
            new IPredictionMarketLZConditionalTokensResolver.PredictedOutcome[](1);
        outcomes[0] = IPredictionMarketLZConditionalTokensResolver.PredictedOutcome({
            marketId: TEST_CONDITION_ID,
            prediction: false // Wrong prediction
        });

        bytes memory encodedOutcomes = abi.encode(outcomes);

        (bool isResolved, IPredictionMarketResolver.Error error, bool parlaySuccess) =
            resolver.getPredictionResolution(encodedOutcomes);

        assertTrue(isResolved, "Should be resolved");
        assertEq(uint256(error), uint256(IPredictionMarketResolver.Error.NO_ERROR), "Should have no error");
        assertFalse(parlaySuccess, "Parlay should fail");
    }

    function test_getPredictionResolution_invalidTreatedAsUnsettled() public {
        // Mark condition as invalid (non-binary)
        resolver.exposed_finalizeResolution(TEST_CONDITION_ID, 2, 1, 1);

        IPredictionMarketLZConditionalTokensResolver.PredictedOutcome[] memory outcomes =
            new IPredictionMarketLZConditionalTokensResolver.PredictedOutcome[](1);
        outcomes[0] = IPredictionMarketLZConditionalTokensResolver.PredictedOutcome({
            marketId: TEST_CONDITION_ID,
            prediction: true
        });

        bytes memory encodedOutcomes = abi.encode(outcomes);

        (bool isResolved, IPredictionMarketResolver.Error error, bool parlaySuccess) =
            resolver.getPredictionResolution(encodedOutcomes);

        // Invalid conditions are treated as unsettled
        assertFalse(isResolved, "Should not be resolved (invalid treated as unsettled)");
        assertEq(uint256(error), uint256(IPredictionMarketResolver.Error.MARKET_NOT_SETTLED), "Should have MARKET_NOT_SETTLED error");
        assertTrue(parlaySuccess, "Parlay success should be true (no decisive loss)");
    }

    function test_getPredictionResolution_multipleConditions_allCorrect() public {
        // Settle all conditions
        resolver.exposed_finalizeResolution(TEST_CONDITION_ID, 1, 0, 1);     // YES
        resolver.exposed_finalizeResolution(TEST_CONDITION_ID_2, 1, 1, 0);   // NO
        resolver.exposed_finalizeResolution(TEST_CONDITION_ID_3, 1, 0, 1);   // YES

        IPredictionMarketLZConditionalTokensResolver.PredictedOutcome[] memory outcomes =
            new IPredictionMarketLZConditionalTokensResolver.PredictedOutcome[](3);
        outcomes[0] = IPredictionMarketLZConditionalTokensResolver.PredictedOutcome({
            marketId: TEST_CONDITION_ID, prediction: true
        });
        outcomes[1] = IPredictionMarketLZConditionalTokensResolver.PredictedOutcome({
            marketId: TEST_CONDITION_ID_2, prediction: false
        });
        outcomes[2] = IPredictionMarketLZConditionalTokensResolver.PredictedOutcome({
            marketId: TEST_CONDITION_ID_3, prediction: true
        });

        bytes memory encodedOutcomes = abi.encode(outcomes);

        (bool isResolved, IPredictionMarketResolver.Error error, bool parlaySuccess) =
            resolver.getPredictionResolution(encodedOutcomes);

        assertTrue(isResolved, "Should be resolved");
        assertEq(uint256(error), uint256(IPredictionMarketResolver.Error.NO_ERROR), "Should have no error");
        assertTrue(parlaySuccess, "Parlay should succeed - all correct");
    }

    function test_getPredictionResolution_decisiveLoss() public {
        // Settle first condition to YES
        resolver.exposed_finalizeResolution(TEST_CONDITION_ID, 1, 0, 1);
        // Second condition not settled

        IPredictionMarketLZConditionalTokensResolver.PredictedOutcome[] memory outcomes =
            new IPredictionMarketLZConditionalTokensResolver.PredictedOutcome[](2);
        outcomes[0] = IPredictionMarketLZConditionalTokensResolver.PredictedOutcome({
            marketId: TEST_CONDITION_ID, prediction: false // Wrong
        });
        outcomes[1] = IPredictionMarketLZConditionalTokensResolver.PredictedOutcome({
            marketId: TEST_CONDITION_ID_2, prediction: true
        });

        bytes memory encodedOutcomes = abi.encode(outcomes);

        (bool isResolved, IPredictionMarketResolver.Error error, bool parlaySuccess) =
            resolver.getPredictionResolution(encodedOutcomes);

        // Should return decisive loss even though second condition is unsettled
        assertTrue(isResolved, "Should be resolved due to decisive loss");
        assertEq(uint256(error), uint256(IPredictionMarketResolver.Error.NO_ERROR), "Should have no error");
        assertFalse(parlaySuccess, "Parlay should fail - wrong prediction");
    }

    function test_getPredictionResolution_partiallySettled() public {
        // Only settle first condition
        resolver.exposed_finalizeResolution(TEST_CONDITION_ID, 1, 0, 1); // YES

        IPredictionMarketLZConditionalTokensResolver.PredictedOutcome[] memory outcomes =
            new IPredictionMarketLZConditionalTokensResolver.PredictedOutcome[](2);
        outcomes[0] = IPredictionMarketLZConditionalTokensResolver.PredictedOutcome({
            marketId: TEST_CONDITION_ID, prediction: true // Correct
        });
        outcomes[1] = IPredictionMarketLZConditionalTokensResolver.PredictedOutcome({
            marketId: TEST_CONDITION_ID_2, prediction: true // Not settled
        });

        bytes memory encodedOutcomes = abi.encode(outcomes);

        (bool isResolved, IPredictionMarketResolver.Error error, bool parlaySuccess) =
            resolver.getPredictionResolution(encodedOutcomes);

        // No decisive loss but not all settled
        assertFalse(isResolved, "Should not be resolved");
        assertEq(uint256(error), uint256(IPredictionMarketResolver.Error.MARKET_NOT_SETTLED), "Should have MARKET_NOT_SETTLED error");
        assertTrue(parlaySuccess, "Parlay success should be true (no losses yet)");
    }

    // ============ Encoding/Decoding Tests ============

    function test_encodePredictionOutcomes() public view {
        IPredictionMarketLZConditionalTokensResolver.PredictedOutcome[] memory outcomes =
            new IPredictionMarketLZConditionalTokensResolver.PredictedOutcome[](2);
        outcomes[0] = IPredictionMarketLZConditionalTokensResolver.PredictedOutcome({
            marketId: TEST_CONDITION_ID,
            prediction: true
        });
        outcomes[1] = IPredictionMarketLZConditionalTokensResolver.PredictedOutcome({
            marketId: TEST_CONDITION_ID_2,
            prediction: false
        });

        bytes memory encoded = resolver.encodePredictionOutcomes(outcomes);

        // Decode and verify
        IPredictionMarketLZConditionalTokensResolver.PredictedOutcome[] memory decoded =
            resolver.decodePredictionOutcomes(encoded);

        assertEq(decoded.length, 2, "Length should match");
        assertEq(decoded[0].marketId, TEST_CONDITION_ID, "Condition ID 1 should match");
        assertTrue(decoded[0].prediction, "Prediction 1 should be true");
        assertEq(decoded[1].marketId, TEST_CONDITION_ID_2, "Condition ID 2 should match");
        assertFalse(decoded[1].prediction, "Prediction 2 should be false");
    }

    // ============ View Functions Tests ============

    function test_getCondition() public view {
        IPredictionMarketLZConditionalTokensResolver.ConditionState memory condition =
            resolver.getCondition(TEST_CONDITION_ID);

        assertEq(condition.conditionId, bytes32(0), "Condition should not exist initially");
        assertFalse(condition.settled, "Condition should not be settled");
        assertFalse(condition.invalid, "Condition should not be invalid");
        assertFalse(condition.resolvedToYes, "Condition should not be resolved");
    }

    function test_isConditionSettled() public view {
        bool settled = resolver.isConditionSettled(TEST_CONDITION_ID);
        assertFalse(settled, "Condition should not be settled initially");
    }

    function test_isConditionSettled_afterSettlement() public {
        resolver.exposed_finalizeResolution(TEST_CONDITION_ID, 1, 0, 1);
        
        bool settled = resolver.isConditionSettled(TEST_CONDITION_ID);
        assertTrue(settled, "Condition should be settled");
    }

    function test_isConditionInvalid() public {
        assertFalse(resolver.isConditionInvalid(TEST_CONDITION_ID), "Should not be invalid initially");
        
        resolver.exposed_finalizeResolution(TEST_CONDITION_ID, 2, 1, 1); // Non-binary
        
        assertTrue(resolver.isConditionInvalid(TEST_CONDITION_ID), "Should be invalid after non-binary");
    }

    function test_getConditionResolution() public {
        // First settle the condition
        resolver.exposed_finalizeResolution(TEST_CONDITION_ID, 1, 0, 1);

        bool resolvedToYes = resolver.getConditionResolution(TEST_CONDITION_ID);
        assertTrue(resolvedToYes, "Condition should be resolved to YES");
    }

    function test_getConditionResolution_revertIfNotSettled() public {
        vm.expectRevert("Condition not settled");
        resolver.getConditionResolution(TEST_CONDITION_ID);
    }
}
