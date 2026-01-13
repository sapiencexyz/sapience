// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import {Test} from "forge-std/Test.sol";
import {PredictionMarketLZConditionalTokensResolver} from "../../src/predictionMarket/resolvers/PredictionMarketLZConditionalTokensResolver.sol";
import {IPredictionMarketLZConditionalTokensResolver} from "../../src/predictionMarket/resolvers/interfaces/IPredictionMarketLZConditionalTokensResolver.sol";
import {IPredictionMarketResolver} from "../../src/predictionMarket/interfaces/IPredictionMarketResolver.sol";

/// @notice Minimal interface for querying Gnosis ConditionalTokens
interface IConditionalTokens {
    function payoutDenominator(bytes32 conditionId) external view returns (uint256);
    function payoutNumerators(bytes32 conditionId, uint256 index) external view returns (uint256);
}

/// @notice Mock LayerZero endpoint for fork testing
contract MockEndpoint {
    address public delegate;
    
    function setDelegate(address _delegate) external {
        delegate = _delegate;
    }
    
    function quote(
        bytes memory,
        address
    ) external pure returns (uint256, uint256) {
        return (0, 0);
    }
}

/**
 * @title PredictionMarketLZConditionalTokensResolverForkTest
 * @notice Fork test that validates the resolver's binary payout parsing against
 *         real on-chain data from the Polygon ConditionalTokens contract.
 * @dev Run with: POLYGON_RPC_URL=https://polygon-bor-rpc.publicnode.com forge test --match-contract Fork -vvv
 */
contract PredictionMarketLZConditionalTokensResolverForkTest is Test {
    // Fork ID
    uint256 polygonFork;

    // Real Gnosis ConditionalTokens contract on Polygon
    address constant CTF = 0x4D97DCd97eC945f40cF65F87097ACe5EA0476045;

    // Real resolved conditionIds from Polymarket (block ~80313100)
    // Condition that resolved to YES: payoutNumerators = [0, 1]
    bytes32 constant CONDITION_YES = 0x67903aa8fb5c90e936777cebd9c6570cb70dfeb1128008c04f11ae8e162111bc;

    // Condition that resolved to NO: payoutNumerators = [1, 0]
    bytes32 constant CONDITION_NO = 0xace50cca5ccad582a0cbe373d62b6c6796dd89202bf47c726a3abb48688ba25e;

    // ConditionalTokens interface
    IConditionalTokens ctf;
    
    // Mock endpoint for resolver deployment
    MockEndpoint mockEndpoint;

    function setUp() public {
        // Create fork from environment variable or default public RPC
        // Using latest block since public RPCs may not support historical state
        string memory rpcUrl = vm.envOr("POLYGON_RPC_URL", string("https://polygon-bor-rpc.publicnode.com"));
        polygonFork = vm.createFork(rpcUrl);
        vm.selectFork(polygonFork);

        ctf = IConditionalTokens(CTF);
        
        // Deploy mock endpoint for tests that need to deploy the resolver
        mockEndpoint = new MockEndpoint();
    }

    // ============ Direct CTF Query Tests ============

    function test_fork_queryConditionYes_rawData() public {
        // Query the real ConditionalTokens contract
        uint256 denom = ctf.payoutDenominator(CONDITION_YES);
        uint256 noPayout = ctf.payoutNumerators(CONDITION_YES, 0);
        uint256 yesPayout = ctf.payoutNumerators(CONDITION_YES, 1);

        // Verify expected values
        assertGt(denom, 0, "Condition should be resolved (denom > 0)");
        assertEq(noPayout, 0, "NO payout should be 0");
        assertEq(yesPayout, denom, "YES payout should equal denominator");

        // Log for debugging
        emit log_named_bytes32("conditionId", CONDITION_YES);
        emit log_named_uint("payoutDenominator", denom);
        emit log_named_uint("payoutNumerators[0] (NO)", noPayout);
        emit log_named_uint("payoutNumerators[1] (YES)", yesPayout);
    }

    function test_fork_queryConditionNo_rawData() public {
        // Query the real ConditionalTokens contract
        uint256 denom = ctf.payoutDenominator(CONDITION_NO);
        uint256 noPayout = ctf.payoutNumerators(CONDITION_NO, 0);
        uint256 yesPayout = ctf.payoutNumerators(CONDITION_NO, 1);

        // Verify expected values
        assertGt(denom, 0, "Condition should be resolved (denom > 0)");
        assertEq(noPayout, denom, "NO payout should equal denominator");
        assertEq(yesPayout, 0, "YES payout should be 0");

        // Log for debugging
        emit log_named_bytes32("conditionId", CONDITION_NO);
        emit log_named_uint("payoutDenominator", denom);
        emit log_named_uint("payoutNumerators[0] (NO)", noPayout);
        emit log_named_uint("payoutNumerators[1] (YES)", yesPayout);
    }

    // ============ Binary Resolution Logic Tests ============

    function test_fork_binaryResolution_yes() public view {
        uint256 denom = ctf.payoutDenominator(CONDITION_YES);
        uint256 noPayout = ctf.payoutNumerators(CONDITION_YES, 0);
        uint256 yesPayout = ctf.payoutNumerators(CONDITION_YES, 1);

        // Apply the resolver's binary logic
        bool isResolved = denom > 0;
        bool isStrictBinary = (noPayout + yesPayout == denom) && (noPayout != yesPayout);
        bool resolvedToYes = yesPayout > 0;

        assertTrue(isResolved, "Should be resolved");
        assertTrue(isStrictBinary, "Should be strict binary");
        assertTrue(resolvedToYes, "Should resolve to YES");
    }

    function test_fork_binaryResolution_no() public view {
        uint256 denom = ctf.payoutDenominator(CONDITION_NO);
        uint256 noPayout = ctf.payoutNumerators(CONDITION_NO, 0);
        uint256 yesPayout = ctf.payoutNumerators(CONDITION_NO, 1);

        // Apply the resolver's binary logic
        bool isResolved = denom > 0;
        bool isStrictBinary = (noPayout + yesPayout == denom) && (noPayout != yesPayout);
        bool resolvedToYes = yesPayout > 0;

        assertTrue(isResolved, "Should be resolved");
        assertTrue(isStrictBinary, "Should be strict binary");
        assertFalse(resolvedToYes, "Should resolve to NO");
    }

    // ============ Integration with Resolver Contract ============

    /**
     * @notice Deploy the resolver and feed it real payout data
     * @dev This simulates what would happen after an lzRead response
     */
    function test_fork_resolverCanDeploy() public {
        // Deploy the resolver to verify it can be constructed with real config
        address owner = address(this);

        PredictionMarketLZConditionalTokensResolver resolver = new PredictionMarketLZConditionalTokensResolver(
            address(mockEndpoint),
            owner,
            IPredictionMarketLZConditionalTokensResolver.Settings({
                maxPredictionMarkets: 10
            })
        );

        // Verify config was set correctly
        uint256 maxPredictionMarkets = resolver.config();
        
        assertEq(maxPredictionMarkets, 10, "Max prediction markets should be 10");
    }

    // ============ Full Resolver Integration with Test Wrapper ============

    /**
     * @notice Test the full resolver flow using exposed internal functions
     */
    function test_fork_fullResolverFlow_yes() public {
        // Deploy the test wrapper resolver
        ResolverTestWrapper resolver = new ResolverTestWrapper(
            address(mockEndpoint),
            address(this),
            IPredictionMarketLZConditionalTokensResolver.Settings({
                maxPredictionMarkets: 10
            })
        );

        // Query real data from Polygon CTF
        uint256 denom = ctf.payoutDenominator(CONDITION_YES);
        uint256 noPayout = ctf.payoutNumerators(CONDITION_YES, 0);
        uint256 yesPayout = ctf.payoutNumerators(CONDITION_YES, 1);

        // Process through resolver
        resolver.exposed_finalizeResolution(CONDITION_YES, denom, noPayout, yesPayout);

        // Verify state
        IPredictionMarketLZConditionalTokensResolver.ConditionState memory state =
            resolver.getCondition(CONDITION_YES);

        assertTrue(state.settled, "Should be settled");
        assertFalse(state.invalid, "Should not be invalid");
        assertTrue(state.resolvedToYes, "Should resolve to YES");
        assertEq(state.payoutDenominator, denom, "Denom should match");
        assertEq(state.noPayout, noPayout, "No payout should match");
        assertEq(state.yesPayout, yesPayout, "Yes payout should match");

        // Verify via getPredictionResolution
        IPredictionMarketLZConditionalTokensResolver.PredictedOutcome[] memory outcomes =
            new IPredictionMarketLZConditionalTokensResolver.PredictedOutcome[](1);
        outcomes[0] = IPredictionMarketLZConditionalTokensResolver.PredictedOutcome({
            marketId: CONDITION_YES,
            prediction: true // Predicting YES
        });

        bytes memory encodedOutcomes = abi.encode(outcomes);
        (bool isResolved, IPredictionMarketResolver.Error error, bool parlaySuccess) =
            resolver.getPredictionResolution(encodedOutcomes);

        assertTrue(isResolved, "Should be resolved");
        assertEq(uint256(error), uint256(IPredictionMarketResolver.Error.NO_ERROR), "No error");
        assertTrue(parlaySuccess, "Parlay should succeed");
    }

    function test_fork_fullResolverFlow_no() public {
        // Deploy the test wrapper resolver
        ResolverTestWrapper resolver = new ResolverTestWrapper(
            address(mockEndpoint),
            address(this),
            IPredictionMarketLZConditionalTokensResolver.Settings({
                maxPredictionMarkets: 10
            })
        );

        // Query real data from Polygon CTF
        uint256 denom = ctf.payoutDenominator(CONDITION_NO);
        uint256 noPayout = ctf.payoutNumerators(CONDITION_NO, 0);
        uint256 yesPayout = ctf.payoutNumerators(CONDITION_NO, 1);

        // Process through resolver
        resolver.exposed_finalizeResolution(CONDITION_NO, denom, noPayout, yesPayout);

        // Verify state
        IPredictionMarketLZConditionalTokensResolver.ConditionState memory state =
            resolver.getCondition(CONDITION_NO);

        assertTrue(state.settled, "Should be settled");
        assertFalse(state.invalid, "Should not be invalid");
        assertFalse(state.resolvedToYes, "Should resolve to NO");

        // Verify via getPredictionResolution - predicting NO should succeed
        IPredictionMarketLZConditionalTokensResolver.PredictedOutcome[] memory outcomes =
            new IPredictionMarketLZConditionalTokensResolver.PredictedOutcome[](1);
        outcomes[0] = IPredictionMarketLZConditionalTokensResolver.PredictedOutcome({
            marketId: CONDITION_NO,
            prediction: false // Predicting NO
        });

        bytes memory encodedOutcomes = abi.encode(outcomes);
        (bool isResolved, IPredictionMarketResolver.Error error, bool parlaySuccess) =
            resolver.getPredictionResolution(encodedOutcomes);

        assertTrue(isResolved, "Should be resolved");
        assertEq(uint256(error), uint256(IPredictionMarketResolver.Error.NO_ERROR), "No error");
        assertTrue(parlaySuccess, "Parlay should succeed (predicted NO correctly)");
    }

    function test_fork_fullResolverFlow_wrongPrediction() public {
        // Deploy the test wrapper resolver
        ResolverTestWrapper resolver = new ResolverTestWrapper(
            address(mockEndpoint),
            address(this),
            IPredictionMarketLZConditionalTokensResolver.Settings({
                maxPredictionMarkets: 10
            })
        );

        // Query real data from Polygon CTF
        uint256 denom = ctf.payoutDenominator(CONDITION_YES);
        uint256 noPayout = ctf.payoutNumerators(CONDITION_YES, 0);
        uint256 yesPayout = ctf.payoutNumerators(CONDITION_YES, 1);

        // Process through resolver
        resolver.exposed_finalizeResolution(CONDITION_YES, denom, noPayout, yesPayout);

        // Predict NO when actual outcome was YES - should fail
        IPredictionMarketLZConditionalTokensResolver.PredictedOutcome[] memory outcomes =
            new IPredictionMarketLZConditionalTokensResolver.PredictedOutcome[](1);
        outcomes[0] = IPredictionMarketLZConditionalTokensResolver.PredictedOutcome({
            marketId: CONDITION_YES,
            prediction: false // Wrong prediction
        });

        bytes memory encodedOutcomes = abi.encode(outcomes);
        (bool isResolved, IPredictionMarketResolver.Error error, bool parlaySuccess) =
            resolver.getPredictionResolution(encodedOutcomes);

        assertTrue(isResolved, "Should be resolved");
        assertEq(uint256(error), uint256(IPredictionMarketResolver.Error.NO_ERROR), "No error");
        assertFalse(parlaySuccess, "Parlay should fail (wrong prediction)");
    }

    // ============ Parlay with Multiple Real Conditions ============

    function test_fork_parlay_multipleRealConditions() public {
        ResolverTestWrapper resolver = new ResolverTestWrapper(
            address(mockEndpoint),
            address(this),
            IPredictionMarketLZConditionalTokensResolver.Settings({
                maxPredictionMarkets: 10
            })
        );

        // Process both real conditions
        {
            uint256 denom = ctf.payoutDenominator(CONDITION_YES);
            uint256 noPayout = ctf.payoutNumerators(CONDITION_YES, 0);
            uint256 yesPayout = ctf.payoutNumerators(CONDITION_YES, 1);
            resolver.exposed_finalizeResolution(CONDITION_YES, denom, noPayout, yesPayout);
        }

        {
            uint256 denom = ctf.payoutDenominator(CONDITION_NO);
            uint256 noPayout = ctf.payoutNumerators(CONDITION_NO, 0);
            uint256 yesPayout = ctf.payoutNumerators(CONDITION_NO, 1);
            resolver.exposed_finalizeResolution(CONDITION_NO, denom, noPayout, yesPayout);
        }

        // Create parlay with both conditions - correct predictions
        IPredictionMarketLZConditionalTokensResolver.PredictedOutcome[] memory outcomes =
            new IPredictionMarketLZConditionalTokensResolver.PredictedOutcome[](2);
        outcomes[0] = IPredictionMarketLZConditionalTokensResolver.PredictedOutcome({
            marketId: CONDITION_YES,
            prediction: true // Correct
        });
        outcomes[1] = IPredictionMarketLZConditionalTokensResolver.PredictedOutcome({
            marketId: CONDITION_NO,
            prediction: false // Correct
        });

        bytes memory encodedOutcomes = abi.encode(outcomes);
        (bool isResolved, IPredictionMarketResolver.Error error, bool parlaySuccess) =
            resolver.getPredictionResolution(encodedOutcomes);

        assertTrue(isResolved, "Should be resolved");
        assertEq(uint256(error), uint256(IPredictionMarketResolver.Error.NO_ERROR), "No error");
        assertTrue(parlaySuccess, "Parlay should succeed (both correct)");
    }
}

/**
 * @title ResolverTestWrapper
 * @notice Wrapper to expose internal functions for testing
 */
contract ResolverTestWrapper is PredictionMarketLZConditionalTokensResolver {
    constructor(
        address _endpoint,
        address _owner,
        Settings memory _config
    ) PredictionMarketLZConditionalTokensResolver(_endpoint, _owner, _config) {}

    function exposed_finalizeResolution(
        bytes32 conditionId,
        uint256 denom,
        uint256 noPayout,
        uint256 yesPayout
    ) external {
        _finalizeResolution(conditionId, denom, noPayout, yesPayout);
    }
}
