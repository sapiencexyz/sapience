// SPDX-License-Identifier: MIT
pragma solidity ^0.8.19;

import "forge-std/Test.sol";
import "../../src/v2/PredictionMarketV2.sol";
import "../../src/v2/resolvers/ManualConditionResolver.sol";
import "../../src/v2/interfaces/IV2Types.sol";
import "../../src/v2/interfaces/IPositionToken.sol";
import "./mocks/MockERC20.sol";

/**
 * @title PredictionMarketV2IntegrationTest
 * @notice Integration tests for PredictionMarketV2 with ManualConditionResolver
 * @dev Tests full flows: mint -> settle conditions -> settle prediction -> redeem
 */
contract PredictionMarketV2IntegrationTest is Test {
    PredictionMarketV2 public market;
    ManualConditionResolver public resolver;
    MockERC20 public collateralToken;

    address public owner;
    address public predictor;
    address public counterparty;
    address public settler;
    address public tokenBuyer;

    uint256 public predictorPk;
    uint256 public counterpartyPk;

    bytes32 public constant REF_CODE = keccak256("integration-test");

    function setUp() public {
        owner = vm.addr(1);
        predictorPk = 2;
        predictor = vm.addr(predictorPk);
        counterpartyPk = 3;
        counterparty = vm.addr(counterpartyPk);
        settler = vm.addr(4);
        tokenBuyer = vm.addr(5);

        // Deploy contracts
        collateralToken = new MockERC20("Test USDE", "USDE", 18);
        market = new PredictionMarketV2(address(collateralToken));

        vm.prank(owner);
        resolver = new ManualConditionResolver(owner);

        vm.prank(owner);
        resolver.approveSettler(settler);

        // Mint tokens
        collateralToken.mint(predictor, 100000e18);
        collateralToken.mint(counterparty, 100000e18);
        collateralToken.mint(tokenBuyer, 100000e18);

        // Approve market
        vm.prank(predictor);
        collateralToken.approve(address(market), type(uint256).max);
        vm.prank(counterparty);
        collateralToken.approve(address(market), type(uint256).max);
    }

    // ============ Helper Functions ============

    function _signApproval(
        bytes32 predictionHash,
        address signer,
        uint256 wager,
        uint256 nonce,
        uint256 deadline,
        uint256 pk
    ) internal view returns (bytes memory) {
        bytes32 approvalHash = market.getMintApprovalHash(predictionHash, signer, wager, nonce, deadline);
        (uint8 v, bytes32 r, bytes32 s) = vm.sign(pk, approvalHash);
        return abi.encodePacked(r, s, v);
    }

    function _createMintRequest(
        IV2Types.Pick[] memory picks,
        uint256 pWager,
        uint256 cWager
    ) internal view returns (IV2Types.MintRequest memory request) {
        bytes32 predictionId = keccak256(abi.encode(picks));
        bytes32 predictionHash = keccak256(
            abi.encode(predictionId, pWager, cWager, predictor, counterparty)
        );

        uint256 pNonce = market.getNonce(predictor);
        uint256 cNonce = market.getNonce(counterparty);
        uint256 deadline = block.timestamp + 1 hours;

        request.picks = picks;
        request.predictorWager = pWager;
        request.counterpartyWager = cWager;
        request.predictor = predictor;
        request.counterparty = counterparty;
        request.predictorNonce = pNonce;
        request.counterpartyNonce = cNonce;
        request.predictorDeadline = deadline;
        request.counterpartyDeadline = deadline;
        request.predictorSignature = _signApproval(predictionHash, predictor, pWager, pNonce, deadline, predictorPk);
        request.counterpartySignature = _signApproval(predictionHash, counterparty, cWager, cNonce, deadline, counterpartyPk);
        request.refCode = REF_CODE;
        request.predictorSessionKeyData = "";
        request.counterpartySessionKeyData = "";
    }

    // ============ Full Flow Tests ============

    /**
     * @notice Test: Single pick parlay - predictor wins
     * Flow: mint -> settle condition (YES) -> settle prediction -> predictor redeems all
     */
    function test_fullFlow_singlePick_predictorWins() public {
        bytes32 conditionId = keccak256("game-1-team-a-wins");

        // 1. Create prediction (predictor bets YES on Team A)
        IV2Types.Pick[] memory picks = new IV2Types.Pick[](1);
        picks[0] = IV2Types.Pick({
            conditionResolver: address(resolver),
            conditionId: conditionId,
            predictedOutcome: IV2Types.OutcomeSide.YES
        });

        uint256 pWager = 1000e18;
        uint256 cWager = 1500e18;
        IV2Types.MintRequest memory request = _createMintRequest(picks, pWager, cWager);
        (bytes32 predictionId, address predictorToken, address counterpartyToken) = market.mint(request);

        // Verify initial state (tokens = wager amounts in fungible model)
        assertEq(collateralToken.balanceOf(address(market)), 2500e18);
        assertEq(IPositionToken(predictorToken).balanceOf(predictor), pWager);
        assertEq(IPositionToken(counterpartyToken).balanceOf(counterparty), cWager);

        // 2. Settle condition - Team A wins (YES)
        vm.prank(settler);
        resolver.settleCondition(conditionId, IV2Types.OutcomeVector(1, 0));

        // 3. Settle prediction
        assertTrue(market.canSettle(predictionId));
        market.settle(predictionId, REF_CODE);

        IV2Types.Prediction memory prediction = market.getPrediction(predictionId);
        IV2Types.PickConfiguration memory config = market.getPickConfiguration(prediction.pickConfigId);
        assertEq(uint256(config.result), uint256(IV2Types.SettlementResult.PREDICTOR_WINS));

        // 4. Predictor redeems - gets all collateral
        uint256 predictorBalanceBefore = collateralToken.balanceOf(predictor);

        vm.prank(predictor);
        uint256 payout = market.redeem(predictorToken, pWager, REF_CODE);

        assertEq(payout, 2500e18);
        assertEq(collateralToken.balanceOf(predictor), predictorBalanceBefore + 2500e18);
        assertEq(collateralToken.balanceOf(address(market)), 0);

        // Counterparty gets nothing
        vm.prank(counterparty);
        uint256 counterpartyPayout = market.redeem(counterpartyToken, cWager, REF_CODE);
        assertEq(counterpartyPayout, 0);
    }

    /**
     * @notice Test: Two pick parlay - predictor wins both
     */
    function test_fullFlow_twoPicks_predictorWinsBoth() public {
        bytes32 condition1 = keccak256("game-1-over-200");
        bytes32 condition2 = keccak256("game-2-team-b-wins");

        // Sort conditions for canonical order (must be ascending by conditionId when same resolver)
        (bytes32 first, bytes32 second) = condition1 < condition2 ? (condition1, condition2) : (condition2, condition1);

        // 1. Create parlay prediction
        IV2Types.Pick[] memory picks = new IV2Types.Pick[](2);
        picks[0] = IV2Types.Pick({
            conditionResolver: address(resolver),
            conditionId: first,
            predictedOutcome: IV2Types.OutcomeSide.YES
        });
        picks[1] = IV2Types.Pick({
            conditionResolver: address(resolver),
            conditionId: second,
            predictedOutcome: IV2Types.OutcomeSide.NO
        });

        uint256 pWager = 500e18;
        uint256 cWager = 1000e18;
        IV2Types.MintRequest memory request = _createMintRequest(picks, pWager, cWager);
        (bytes32 predictionId, address predictorToken,) = market.mint(request);

        // 2. Settle conditions - both match predictor's picks
        vm.startPrank(settler);
        resolver.settleCondition(first, IV2Types.OutcomeVector(1, 0)); // YES
        resolver.settleCondition(second, IV2Types.OutcomeVector(0, 1)); // NO
        vm.stopPrank();

        // 3. Settle and redeem
        market.settle(predictionId, REF_CODE);

        vm.prank(predictor);
        uint256 payout = market.redeem(predictorToken, pWager, REF_CODE);

        assertEq(payout, 1500e18); // All collateral
    }

    /**
     * @notice Test: Two pick parlay - predictor loses one
     */
    function test_fullFlow_twoPicks_predictorLosesOne() public {
        bytes32 condition1 = keccak256("game-1-over-200");
        bytes32 condition2 = keccak256("game-2-team-b-wins");

        // Sort conditions for canonical order
        (bytes32 first, bytes32 second) = condition1 < condition2 ? (condition1, condition2) : (condition2, condition1);

        IV2Types.Pick[] memory picks = new IV2Types.Pick[](2);
        picks[0] = IV2Types.Pick({
            conditionResolver: address(resolver),
            conditionId: first,
            predictedOutcome: IV2Types.OutcomeSide.YES
        });
        picks[1] = IV2Types.Pick({
            conditionResolver: address(resolver),
            conditionId: second,
            predictedOutcome: IV2Types.OutcomeSide.YES
        });

        uint256 pWager = 500e18;
        uint256 cWager = 1000e18;
        IV2Types.MintRequest memory request = _createMintRequest(picks, pWager, cWager);
        (bytes32 predictionId,, address counterpartyToken) = market.mint(request);

        // Settle - first YES (predictor wins), second NO (predictor loses)
        vm.startPrank(settler);
        resolver.settleCondition(first, IV2Types.OutcomeVector(1, 0)); // YES - predictor wins this pick
        resolver.settleCondition(second, IV2Types.OutcomeVector(0, 1)); // NO - predictor loses this pick
        vm.stopPrank();

        // Parlay fails because predictor lost one pick
        market.settle(predictionId, REF_CODE);

        IV2Types.Prediction memory prediction = market.getPrediction(predictionId);
        IV2Types.PickConfiguration memory config = market.getPickConfiguration(prediction.pickConfigId);
        assertEq(uint256(config.result), uint256(IV2Types.SettlementResult.COUNTERPARTY_WINS));

        // Counterparty gets all
        vm.prank(counterparty);
        uint256 payout = market.redeem(counterpartyToken, cWager, REF_CODE);
        assertEq(payout, 1500e18);
    }

    /**
     * @notice Test: Single pick with tie - both get original wagers back
     */
    function test_fullFlow_singlePick_tie() public {
        bytes32 conditionId = keccak256("game-tied");

        IV2Types.Pick[] memory picks = new IV2Types.Pick[](1);
        picks[0] = IV2Types.Pick({
            conditionResolver: address(resolver),
            conditionId: conditionId,
            predictedOutcome: IV2Types.OutcomeSide.YES
        });

        uint256 pWager = 1000e18;
        uint256 cWager = 1500e18;
        IV2Types.MintRequest memory request = _createMintRequest(picks, pWager, cWager);
        (bytes32 predictionId, address predictorToken, address counterpartyToken) = market.mint(request);

        // Settle to tie
        vm.prank(settler);
        resolver.settleCondition(conditionId, IV2Types.OutcomeVector(1, 1));

        market.settle(predictionId, REF_CODE);

        IV2Types.Prediction memory prediction = market.getPrediction(predictionId);
        IV2Types.PickConfiguration memory config = market.getPickConfiguration(prediction.pickConfigId);
        assertEq(uint256(config.result), uint256(IV2Types.SettlementResult.NON_DECISIVE));

        // Both get their original wagers back
        vm.prank(predictor);
        uint256 predictorPayout = market.redeem(predictorToken, pWager, REF_CODE);

        vm.prank(counterparty);
        uint256 counterpartyPayout = market.redeem(counterpartyToken, cWager, REF_CODE);

        assertEq(predictorPayout, 1000e18);
        assertEq(counterpartyPayout, 1500e18);
    }

    /**
     * @notice Test: Position token transfer - buyer redeems
     */
    function test_fullFlow_tokenTransfer_buyerRedeems() public {
        bytes32 conditionId = keccak256("transferable-position");

        IV2Types.Pick[] memory picks = new IV2Types.Pick[](1);
        picks[0] = IV2Types.Pick({
            conditionResolver: address(resolver),
            conditionId: conditionId,
            predictedOutcome: IV2Types.OutcomeSide.YES
        });

        uint256 pWager = 1000e18;
        uint256 cWager = 1000e18;
        IV2Types.MintRequest memory request = _createMintRequest(picks, pWager, cWager);
        (bytes32 predictionId, address predictorToken,) = market.mint(request);

        // Predictor sells half their position to tokenBuyer
        uint256 halfTokens = pWager / 2;
        vm.prank(predictor);
        IPositionToken(predictorToken).transfer(tokenBuyer, halfTokens);

        assertEq(IPositionToken(predictorToken).balanceOf(predictor), halfTokens);
        assertEq(IPositionToken(predictorToken).balanceOf(tokenBuyer), halfTokens);

        // Settle - predictor wins
        vm.prank(settler);
        resolver.settleCondition(conditionId, IV2Types.OutcomeVector(1, 0));
        market.settle(predictionId, REF_CODE);

        // Both predictor and buyer can redeem their portions
        vm.prank(predictor);
        uint256 predictorPayout = market.redeem(predictorToken, halfTokens, REF_CODE);

        vm.prank(tokenBuyer);
        uint256 buyerPayout = market.redeem(predictorToken, halfTokens, REF_CODE);

        // Each gets half of total collateral
        assertEq(predictorPayout, 1000e18); // 50% of 2000
        assertEq(buyerPayout, 1000e18); // 50% of 2000
    }

    /**
     * @notice Test: Multiple predictions with same resolver
     */
    function test_fullFlow_multiplePredictions() public {
        bytes32 condition1 = keccak256("prediction-1-condition");
        bytes32 condition2 = keccak256("prediction-2-condition");

        // Create two separate predictions
        IV2Types.Pick[] memory picks1 = new IV2Types.Pick[](1);
        picks1[0] = IV2Types.Pick({
            conditionResolver: address(resolver),
            conditionId: condition1,
            predictedOutcome: IV2Types.OutcomeSide.YES
        });

        IV2Types.Pick[] memory picks2 = new IV2Types.Pick[](1);
        picks2[0] = IV2Types.Pick({
            conditionResolver: address(resolver),
            conditionId: condition2,
            predictedOutcome: IV2Types.OutcomeSide.NO
        });

        IV2Types.MintRequest memory request1 = _createMintRequest(picks1, 100e18, 100e18);
        (bytes32 predictionId1, address predictorToken1,) = market.mint(request1);

        IV2Types.MintRequest memory request2 = _createMintRequest(picks2, 200e18, 200e18);
        (bytes32 predictionId2,, address counterpartyToken2) = market.mint(request2);

        // Settle conditions - predictor wins first, loses second
        vm.startPrank(settler);
        resolver.settleCondition(condition1, IV2Types.OutcomeVector(1, 0)); // YES
        resolver.settleCondition(condition2, IV2Types.OutcomeVector(1, 0)); // YES (predictor bet NO, loses)
        vm.stopPrank();

        // Settle both predictions
        market.settle(predictionId1, REF_CODE);
        market.settle(predictionId2, REF_CODE);

        // Verify outcomes (result is on PickConfiguration now)
        {
            IV2Types.Prediction memory p1 = market.getPrediction(predictionId1);
            IV2Types.PickConfiguration memory config1 = market.getPickConfiguration(p1.pickConfigId);
            assertEq(uint256(config1.result), uint256(IV2Types.SettlementResult.PREDICTOR_WINS));
        }
        {
            IV2Types.Prediction memory p2 = market.getPrediction(predictionId2);
            IV2Types.PickConfiguration memory config2 = market.getPickConfiguration(p2.pickConfigId);
            assertEq(uint256(config2.result), uint256(IV2Types.SettlementResult.COUNTERPARTY_WINS));
        }

        // Redeem (100e18 tokens for prediction1, 200e18 for prediction2)
        vm.prank(predictor);
        assertEq(market.redeem(predictorToken1, 100e18, REF_CODE), 200e18);

        vm.prank(counterparty);
        assertEq(market.redeem(counterpartyToken2, 200e18, REF_CODE), 400e18);
    }

    /**
     * @notice Test: Batch resolution optimization path
     */
    function test_fullFlow_batchResolution_samResolver() public {
        // Create 4 conditions - all from same resolver
        // Use bytes32 values that are naturally ordered
        bytes32 c1 = bytes32(uint256(1));
        bytes32 c2 = bytes32(uint256(2));
        bytes32 c3 = bytes32(uint256(3));
        bytes32 c4 = bytes32(uint256(4));

        IV2Types.Pick[] memory picks = new IV2Types.Pick[](4);
        picks[0] = IV2Types.Pick(address(resolver), c1, IV2Types.OutcomeSide.YES);
        picks[1] = IV2Types.Pick(address(resolver), c2, IV2Types.OutcomeSide.YES);
        picks[2] = IV2Types.Pick(address(resolver), c3, IV2Types.OutcomeSide.NO);
        picks[3] = IV2Types.Pick(address(resolver), c4, IV2Types.OutcomeSide.YES);

        uint256 pWager = 1000e18;
        uint256 cWager = 1000e18;
        IV2Types.MintRequest memory request = _createMintRequest(picks, pWager, cWager);
        (bytes32 predictionId, address predictorToken,) = market.mint(request);

        // Batch settle all conditions
        bytes32[] memory conditionIds = new bytes32[](4);
        conditionIds[0] = c1;
        conditionIds[1] = c2;
        conditionIds[2] = c3;
        conditionIds[3] = c4;

        IV2Types.OutcomeVector[] memory outcomes = new IV2Types.OutcomeVector[](4);
        outcomes[0] = IV2Types.OutcomeVector(1, 0); // YES
        outcomes[1] = IV2Types.OutcomeVector(1, 0); // YES
        outcomes[2] = IV2Types.OutcomeVector(0, 1); // NO
        outcomes[3] = IV2Types.OutcomeVector(1, 0); // YES

        vm.prank(settler);
        resolver.settleConditions(conditionIds, outcomes);

        // All picks match - predictor wins
        market.settle(predictionId, REF_CODE);

        IV2Types.Prediction memory prediction = market.getPrediction(predictionId);
        IV2Types.PickConfiguration memory config = market.getPickConfiguration(prediction.pickConfigId);
        assertEq(uint256(config.result), uint256(IV2Types.SettlementResult.PREDICTOR_WINS));

        vm.prank(predictor);
        uint256 payout = market.redeem(predictorToken, pWager, REF_CODE);
        assertEq(payout, 2000e18);
    }

    /**
     * @notice Test: Asymmetric wagers
     */
    function test_fullFlow_asymmetricWagers() public {
        bytes32 conditionId = keccak256("asymmetric");

        IV2Types.Pick[] memory picks = new IV2Types.Pick[](1);
        picks[0] = IV2Types.Pick({
            conditionResolver: address(resolver),
            conditionId: conditionId,
            predictedOutcome: IV2Types.OutcomeSide.YES
        });

        // Predictor bets 100, counterparty bets 10000 (100:1 odds)
        uint256 pWager = 100e18;
        uint256 cWager = 10000e18;
        IV2Types.MintRequest memory request = _createMintRequest(picks, pWager, cWager);
        (bytes32 predictionId, address predictorToken,) = market.mint(request);

        // Predictor wins
        vm.prank(settler);
        resolver.settleCondition(conditionId, IV2Types.OutcomeVector(1, 0));
        market.settle(predictionId, REF_CODE);

        // Predictor gets 101x return
        vm.prank(predictor);
        uint256 payout = market.redeem(predictorToken, pWager, REF_CODE);
        assertEq(payout, 10100e18);
    }
}
