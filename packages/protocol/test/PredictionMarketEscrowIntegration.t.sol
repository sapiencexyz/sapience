// SPDX-License-Identifier: MIT
pragma solidity ^0.8.19;

import "forge-std/Test.sol";
import "../src/PredictionMarketEscrow.sol";
import "../src/PredictionMarketTokenFactory.sol";
import "../src/resolvers/mocks/ManualConditionResolver.sol";
import "../src/interfaces/IV2Types.sol";
import "../src/interfaces/IPredictionMarketEscrow.sol";
import "../src/interfaces/IV2Events.sol";
import "../src/interfaces/IPredictionMarketToken.sol";
import "./mocks/MockERC20.sol";

/**
 * @title PredictionMarketEscrowIntegrationTest
 * @notice Integration tests for PredictionMarketEscrow with ManualConditionResolver
 * @dev Tests full flows: mint -> settle conditions -> settle prediction -> redeem
 */
contract PredictionMarketEscrowIntegrationTest is Test {
    PredictionMarketEscrow public market;
    ManualConditionResolver public resolver;
    ManualConditionResolver public resolver2;
    MockERC20 public collateralToken;

    address public owner;
    address public predictor;
    address public counterparty;
    address public settler;
    address public tokenBuyer;

    uint256 public predictorPk;
    uint256 public counterpartyPk;

    bytes32 public constant REF_CODE = keccak256("integration-test");

    uint256 private _nextNonce = 1;

    function _freshNonce() internal returns (uint256) {
        return _nextNonce++;
    }

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
        PredictionMarketTokenFactory tokenFactory =
            new PredictionMarketTokenFactory(owner);
        market = new PredictionMarketEscrow(
            address(collateralToken), owner, address(tokenFactory)
        );
        vm.prank(owner);
        tokenFactory.setDeployer(address(market));

        vm.prank(owner);
        resolver = new ManualConditionResolver(owner);
        vm.prank(owner);
        resolver2 = new ManualConditionResolver(owner);

        vm.prank(owner);
        resolver.approveSettler(settler);
        vm.prank(owner);
        resolver2.approveSettler(settler);

        // Mint tokens
        collateralToken.mint(predictor, 100_000e18);
        collateralToken.mint(counterparty, 100_000e18);
        collateralToken.mint(tokenBuyer, 100_000e18);

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
        uint256 collateral,
        uint256 nonce,
        uint256 deadline,
        uint256 pk
    ) internal view returns (bytes memory) {
        bytes32 approvalHash = market.getMintApprovalHash(
            predictionHash, signer, collateral, nonce, deadline
        );
        (uint8 v, bytes32 r, bytes32 s) = vm.sign(pk, approvalHash);
        return abi.encodePacked(r, s, v);
    }

    /// @dev Sort two picks by keccak256 of conditionId for canonical ordering
    function _sortTwo(bytes memory a, bytes memory b)
        internal
        pure
        returns (bytes memory first, bytes memory second)
    {
        if (keccak256(a) < keccak256(b)) {
            return (a, b);
        }
        return (b, a);
    }

    function _createMintRequest(
        IV2Types.Pick[] memory picks,
        uint256 pCollateral,
        uint256 cCollateral
    ) internal returns (IV2Types.MintRequest memory request) {
        bytes32 pickConfigId = keccak256(abi.encode(picks));
        bytes32 predictionHash = keccak256(
            abi.encode(
                pickConfigId,
                pCollateral,
                cCollateral,
                predictor,
                counterparty,
                address(0),
                ""
            )
        );

        uint256 pNonce = _freshNonce();
        uint256 cNonce = _freshNonce();
        uint256 deadline = block.timestamp + 1 hours;

        request.picks = picks;
        request.predictorCollateral = pCollateral;
        request.counterpartyCollateral = cCollateral;
        request.predictor = predictor;
        request.counterparty = counterparty;
        request.predictorNonce = pNonce;
        request.counterpartyNonce = cNonce;
        request.predictorDeadline = deadline;
        request.counterpartyDeadline = deadline;
        request.predictorSignature = _signApproval(
            predictionHash,
            predictor,
            pCollateral,
            pNonce,
            deadline,
            predictorPk
        );
        request.counterpartySignature = _signApproval(
            predictionHash,
            counterparty,
            cCollateral,
            cNonce,
            deadline,
            counterpartyPk
        );
        request.refCode = REF_CODE;
        request.predictorSessionKeyData = "";
        request.counterpartySessionKeyData = "";
        request.predictorSponsor = address(0);
        request.predictorSponsorData = "";
    }

    // ============ Full Flow Tests ============

    /**
     * @notice Test: Single pick prediction - predictor wins
     * Flow: mint -> settle condition (YES) -> settle prediction -> predictor redeems all
     */
    function test_fullFlow_singlePick_predictorWins() public {
        bytes32 conditionId = keccak256("game-1-team-a-wins");

        // 1. Create prediction (predictor predicts YES on Team A)
        IV2Types.Pick[] memory picks = new IV2Types.Pick[](1);
        picks[0] = IV2Types.Pick({
            conditionResolver: address(resolver),
            conditionId: abi.encode(conditionId),
            predictedOutcome: IV2Types.OutcomeSide.YES
        });

        uint256 pCollateral = 1000e18;
        uint256 cCollateral = 1500e18;
        IV2Types.MintRequest memory request =
            _createMintRequest(picks, pCollateral, cCollateral);
        (
            bytes32 predictionId,
            address predictorToken,
            address counterpartyToken
        ) = market.mint(request);

        uint256 totalCollateral = pCollateral + cCollateral;

        // Verify initial state (tokens = totalCollateral in proportional model)
        assertEq(collateralToken.balanceOf(address(market)), totalCollateral);
        assertEq(
            IPredictionMarketToken(predictorToken).balanceOf(predictor),
            totalCollateral
        );
        assertEq(
            IPredictionMarketToken(counterpartyToken).balanceOf(counterparty),
            totalCollateral
        );

        // 2. Settle condition - Team A wins (YES)
        vm.prank(settler);
        resolver.settleCondition(conditionId, IV2Types.OutcomeVector(1, 0));

        // 3. Settle prediction
        assertTrue(market.canSettle(predictionId));
        market.settle(predictionId, REF_CODE);

        IV2Types.Prediction memory prediction =
            market.getPrediction(predictionId);
        IV2Types.PickConfiguration memory config =
            market.getPickConfiguration(prediction.pickConfigId);
        assertEq(
            uint256(config.result),
            uint256(IV2Types.SettlementResult.PREDICTOR_WINS)
        );

        // 4. Predictor redeems - gets all collateral
        uint256 predictorBalanceBefore = collateralToken.balanceOf(predictor);

        vm.prank(predictor);
        uint256 payout =
            market.redeem(predictorToken, totalCollateral, REF_CODE);

        assertEq(payout, totalCollateral);
        assertEq(
            collateralToken.balanceOf(predictor),
            predictorBalanceBefore + totalCollateral
        );
        assertEq(collateralToken.balanceOf(address(market)), 0);

        // Counterparty gets nothing
        vm.prank(counterparty);
        uint256 counterpartyPayout =
            market.redeem(counterpartyToken, totalCollateral, REF_CODE);
        assertEq(counterpartyPayout, 0);
    }

    /**
     * @notice Test: Two pick multi-pick prediction - predictor wins both
     */
    function test_fullFlow_twoPicks_predictorWinsBoth() public {
        bytes32 condition1 = keccak256("game-1-over-200");
        bytes32 condition2 = keccak256("game-2-team-b-wins");

        // Sort conditions for canonical order (must be ascending by conditionId when same resolver)
        (bytes32 first, bytes32 second) = keccak256(abi.encode(condition1))
            < keccak256(abi.encode(condition2))
            ? (condition1, condition2)
            : (condition2, condition1);

        // 1. Create multi-pick prediction
        IV2Types.Pick[] memory picks = new IV2Types.Pick[](2);
        picks[0] = IV2Types.Pick({
            conditionResolver: address(resolver),
            conditionId: abi.encode(first),
            predictedOutcome: IV2Types.OutcomeSide.YES
        });
        picks[1] = IV2Types.Pick({
            conditionResolver: address(resolver),
            conditionId: abi.encode(second),
            predictedOutcome: IV2Types.OutcomeSide.NO
        });

        uint256 pCollateral = 500e18;
        uint256 cCollateral = 1000e18;
        IV2Types.MintRequest memory request =
            _createMintRequest(picks, pCollateral, cCollateral);
        (bytes32 predictionId, address predictorToken,) = market.mint(request);

        // 2. Settle conditions - both match predictor's picks
        vm.startPrank(settler);
        resolver.settleCondition(first, IV2Types.OutcomeVector(1, 0)); // YES
        resolver.settleCondition(second, IV2Types.OutcomeVector(0, 1)); // NO
        vm.stopPrank();

        // 3. Settle and redeem
        market.settle(predictionId, REF_CODE);

        uint256 totalCollateral = pCollateral + cCollateral;
        vm.prank(predictor);
        uint256 payout =
            market.redeem(predictorToken, totalCollateral, REF_CODE);

        assertEq(payout, totalCollateral); // All collateral
    }

    /**
     * @notice Test: Two pick multi-pick prediction - predictor loses one
     */
    function test_fullFlow_twoPicks_predictorLosesOne() public {
        bytes32 condition1 = keccak256("game-1-over-200");
        bytes32 condition2 = keccak256("game-2-team-b-wins");

        // Sort conditions for canonical order
        (bytes32 first, bytes32 second) = keccak256(abi.encode(condition1))
            < keccak256(abi.encode(condition2))
            ? (condition1, condition2)
            : (condition2, condition1);

        IV2Types.Pick[] memory picks = new IV2Types.Pick[](2);
        picks[0] = IV2Types.Pick({
            conditionResolver: address(resolver),
            conditionId: abi.encode(first),
            predictedOutcome: IV2Types.OutcomeSide.YES
        });
        picks[1] = IV2Types.Pick({
            conditionResolver: address(resolver),
            conditionId: abi.encode(second),
            predictedOutcome: IV2Types.OutcomeSide.YES
        });

        uint256 pCollateral = 500e18;
        uint256 cCollateral = 1000e18;
        IV2Types.MintRequest memory request =
            _createMintRequest(picks, pCollateral, cCollateral);
        (bytes32 predictionId,, address counterpartyToken) =
            market.mint(request);

        // Settle - first YES (predictor wins), second NO (predictor loses)
        vm.startPrank(settler);
        resolver.settleCondition(first, IV2Types.OutcomeVector(1, 0)); // YES - predictor wins this pick
        resolver.settleCondition(second, IV2Types.OutcomeVector(0, 1)); // NO - predictor loses this pick
        vm.stopPrank();

        // Multi-pick prediction fails because predictor lost one pick
        market.settle(predictionId, REF_CODE);

        IV2Types.Prediction memory prediction =
            market.getPrediction(predictionId);
        IV2Types.PickConfiguration memory config =
            market.getPickConfiguration(prediction.pickConfigId);
        assertEq(
            uint256(config.result),
            uint256(IV2Types.SettlementResult.COUNTERPARTY_WINS)
        );

        // Counterparty gets all
        uint256 totalCollateral = pCollateral + cCollateral;
        vm.prank(counterparty);
        uint256 payout =
            market.redeem(counterpartyToken, totalCollateral, REF_CODE);
        assertEq(payout, totalCollateral);
    }

    /**
     * @notice Test: Single pick with tie - both get original collateral back
     */
    function test_fullFlow_singlePick_tie() public {
        bytes32 conditionId = keccak256("game-tied");

        IV2Types.Pick[] memory picks = new IV2Types.Pick[](1);
        picks[0] = IV2Types.Pick({
            conditionResolver: address(resolver),
            conditionId: abi.encode(conditionId),
            predictedOutcome: IV2Types.OutcomeSide.YES
        });

        uint256 pCollateral = 1000e18;
        uint256 cCollateral = 1500e18;
        IV2Types.MintRequest memory request =
            _createMintRequest(picks, pCollateral, cCollateral);
        (
            bytes32 predictionId,
            address predictorToken,
            address counterpartyToken
        ) = market.mint(request);

        // Settle to tie
        vm.prank(settler);
        resolver.settleCondition(conditionId, IV2Types.OutcomeVector(1, 1));

        market.settle(predictionId, REF_CODE);

        IV2Types.Prediction memory prediction =
            market.getPrediction(predictionId);
        IV2Types.PickConfiguration memory config =
            market.getPickConfiguration(prediction.pickConfigId);
        assertEq(
            uint256(config.result),
            uint256(IV2Types.SettlementResult.COUNTERPARTY_WINS)
        );

        // Non-decisive = counterparty wins — counterparty gets all collateral
        uint256 totalCollateral = pCollateral + cCollateral;

        // Predictor gets nothing
        vm.prank(predictor);
        uint256 predictorPayout =
            market.redeem(predictorToken, totalCollateral, REF_CODE);

        vm.prank(counterparty);
        uint256 counterpartyPayout =
            market.redeem(counterpartyToken, totalCollateral, REF_CODE);

        assertEq(predictorPayout, 0);
        assertEq(counterpartyPayout, totalCollateral);
    }

    /**
     * @notice Test: Position token transfer - buyer redeems
     */
    function test_fullFlow_tokenTransfer_buyerRedeems() public {
        bytes32 conditionId = keccak256("transferable-position");

        IV2Types.Pick[] memory picks = new IV2Types.Pick[](1);
        picks[0] = IV2Types.Pick({
            conditionResolver: address(resolver),
            conditionId: abi.encode(conditionId),
            predictedOutcome: IV2Types.OutcomeSide.YES
        });

        uint256 pCollateral = 1000e18;
        uint256 cCollateral = 1000e18;
        IV2Types.MintRequest memory request =
            _createMintRequest(picks, pCollateral, cCollateral);
        (bytes32 predictionId, address predictorToken,) = market.mint(request);

        // Predictor sells half their position to tokenBuyer
        uint256 totalCollateral = pCollateral + cCollateral;
        uint256 halfTokens = totalCollateral / 2;
        vm.prank(predictor);
        IPredictionMarketToken(predictorToken).transfer(tokenBuyer, halfTokens);

        assertEq(
            IPredictionMarketToken(predictorToken).balanceOf(predictor),
            halfTokens
        );
        assertEq(
            IPredictionMarketToken(predictorToken).balanceOf(tokenBuyer),
            halfTokens
        );

        // Settle - predictor wins
        vm.prank(settler);
        resolver.settleCondition(conditionId, IV2Types.OutcomeVector(1, 0));
        market.settle(predictionId, REF_CODE);

        // Both predictor and buyer can redeem their portions
        vm.prank(predictor);
        uint256 predictorPayout =
            market.redeem(predictorToken, halfTokens, REF_CODE);

        vm.prank(tokenBuyer);
        uint256 buyerPayout =
            market.redeem(predictorToken, halfTokens, REF_CODE);

        // Each gets half of total collateral
        assertEq(predictorPayout, totalCollateral / 2);
        assertEq(buyerPayout, totalCollateral / 2);
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
            conditionId: abi.encode(condition1),
            predictedOutcome: IV2Types.OutcomeSide.YES
        });

        IV2Types.Pick[] memory picks2 = new IV2Types.Pick[](1);
        picks2[0] = IV2Types.Pick({
            conditionResolver: address(resolver),
            conditionId: abi.encode(condition2),
            predictedOutcome: IV2Types.OutcomeSide.NO
        });

        IV2Types.MintRequest memory request1 =
            _createMintRequest(picks1, 100e18, 100e18);
        (bytes32 predictionId1, address predictorToken1,) =
            market.mint(request1);

        IV2Types.MintRequest memory request2 =
            _createMintRequest(picks2, 200e18, 200e18);
        (bytes32 predictionId2,, address counterpartyToken2) =
            market.mint(request2);

        // Settle conditions - predictor wins first, loses second
        vm.startPrank(settler);
        resolver.settleCondition(condition1, IV2Types.OutcomeVector(1, 0)); // YES
        resolver.settleCondition(condition2, IV2Types.OutcomeVector(1, 0)); // YES (predictor predicted NO, loses)
        vm.stopPrank();

        // Settle both predictions
        market.settle(predictionId1, REF_CODE);
        market.settle(predictionId2, REF_CODE);

        // Verify outcomes (result is on PickConfiguration now)
        {
            IV2Types.Prediction memory p1 = market.getPrediction(predictionId1);
            IV2Types.PickConfiguration memory config1 =
                market.getPickConfiguration(p1.pickConfigId);
            assertEq(
                uint256(config1.result),
                uint256(IV2Types.SettlementResult.PREDICTOR_WINS)
            );
        }
        {
            IV2Types.Prediction memory p2 = market.getPrediction(predictionId2);
            IV2Types.PickConfiguration memory config2 =
                market.getPickConfiguration(p2.pickConfigId);
            assertEq(
                uint256(config2.result),
                uint256(IV2Types.SettlementResult.COUNTERPARTY_WINS)
            );
        }

        // Redeem full token balances (totalCollateral per prediction)
        vm.prank(predictor);
        assertEq(market.redeem(predictorToken1, 200e18, REF_CODE), 200e18);

        vm.prank(counterparty);
        assertEq(market.redeem(counterpartyToken2, 400e18, REF_CODE), 400e18);
    }

    /**
     * @notice Test: Batch resolution optimization path
     */
    function test_fullFlow_batchResolution_samResolver() public {
        // Create 4 conditions - sort by keccak256 of encoded bytes for canonical order
        bytes[4] memory conds;
        conds[0] = abi.encode(bytes32(uint256(1)));
        conds[1] = abi.encode(bytes32(uint256(2)));
        conds[2] = abi.encode(bytes32(uint256(3)));
        conds[3] = abi.encode(bytes32(uint256(4)));

        // Bubble sort by keccak256
        for (uint256 i = 0; i < 4; i++) {
            for (uint256 j = i + 1; j < 4; j++) {
                if (keccak256(conds[i]) > keccak256(conds[j])) {
                    (conds[i], conds[j]) = (conds[j], conds[i]);
                }
            }
        }

        IV2Types.Pick[] memory picks = new IV2Types.Pick[](4);
        picks[0] = IV2Types.Pick(
            address(resolver), conds[0], IV2Types.OutcomeSide.YES
        );
        picks[1] = IV2Types.Pick(
            address(resolver), conds[1], IV2Types.OutcomeSide.YES
        );
        picks[2] = IV2Types.Pick(
            address(resolver), conds[2], IV2Types.OutcomeSide.YES
        );
        picks[3] = IV2Types.Pick(
            address(resolver), conds[3], IV2Types.OutcomeSide.YES
        );

        uint256 pCollateral = 1000e18;
        uint256 cCollateral = 1000e18;
        IV2Types.MintRequest memory request =
            _createMintRequest(picks, pCollateral, cCollateral);
        (bytes32 predictionId, address predictorToken,) = market.mint(request);

        // Batch settle all conditions (raw bytes32 for ManualConditionResolver)
        bytes32[] memory conditionIds = new bytes32[](4);
        conditionIds[0] = bytes32(uint256(1));
        conditionIds[1] = bytes32(uint256(2));
        conditionIds[2] = bytes32(uint256(3));
        conditionIds[3] = bytes32(uint256(4));

        IV2Types.OutcomeVector[] memory outcomes =
            new IV2Types.OutcomeVector[](4);
        outcomes[0] = IV2Types.OutcomeVector(1, 0); // YES
        outcomes[1] = IV2Types.OutcomeVector(1, 0); // YES
        outcomes[2] = IV2Types.OutcomeVector(1, 0); // YES
        outcomes[3] = IV2Types.OutcomeVector(1, 0); // YES

        vm.prank(settler);
        resolver.settleConditions(conditionIds, outcomes);

        // All picks match - predictor wins
        market.settle(predictionId, REF_CODE);

        IV2Types.Prediction memory prediction =
            market.getPrediction(predictionId);
        IV2Types.PickConfiguration memory config =
            market.getPickConfiguration(prediction.pickConfigId);
        assertEq(
            uint256(config.result),
            uint256(IV2Types.SettlementResult.PREDICTOR_WINS)
        );

        uint256 totalCollateral = pCollateral + cCollateral;
        vm.prank(predictor);
        uint256 payout =
            market.redeem(predictorToken, totalCollateral, REF_CODE);
        assertEq(payout, totalCollateral);
    }

    /**
     * @notice Test: Asymmetric collateral amounts
     */
    function test_fullFlow_asymmetricCollaterals() public {
        bytes32 conditionId = keccak256("asymmetric");

        IV2Types.Pick[] memory picks = new IV2Types.Pick[](1);
        picks[0] = IV2Types.Pick({
            conditionResolver: address(resolver),
            conditionId: abi.encode(conditionId),
            predictedOutcome: IV2Types.OutcomeSide.YES
        });

        // Predictor puts up 100, counterparty puts up 10000 (100:1 odds)
        uint256 pCollateral = 100e18;
        uint256 cCollateral = 10_000e18;
        IV2Types.MintRequest memory request =
            _createMintRequest(picks, pCollateral, cCollateral);
        (bytes32 predictionId, address predictorToken,) = market.mint(request);

        // Predictor wins
        vm.prank(settler);
        resolver.settleCondition(conditionId, IV2Types.OutcomeVector(1, 0));
        market.settle(predictionId, REF_CODE);

        // Predictor gets all collateral
        uint256 totalCollateral = pCollateral + cCollateral;
        vm.prank(predictor);
        uint256 payout =
            market.redeem(predictorToken, totalCollateral, REF_CODE);
        assertEq(payout, totalCollateral);
    }

    // ============ Event Emission Tests ============

    /**
     * @notice Test: PickConfigCreated is emitted on first mint for a pick config
     */
    function test_emit_PickConfigCreated_onFirstMint() public {
        bytes32 conditionId = keccak256("event-test-pick-config");

        IV2Types.Pick[] memory picks = new IV2Types.Pick[](1);
        picks[0] = IV2Types.Pick({
            conditionResolver: address(resolver),
            conditionId: abi.encode(conditionId),
            predictedOutcome: IV2Types.OutcomeSide.YES
        });

        bytes32 pickConfigId = keccak256(abi.encode(picks));

        uint256 pCollateral = 1000e18;
        uint256 cCollateral = 1000e18;
        IV2Types.MintRequest memory request =
            _createMintRequest(picks, pCollateral, cCollateral);

        // Expect PickConfigCreated with the correct pickConfigId
        vm.expectEmit(true, false, false, false, address(market));
        emit IV2Events.PickConfigCreated(
            pickConfigId, address(0), address(0), picks
        );

        market.mint(request);
    }

    /**
     * @notice Test: PickConfigCreated is NOT emitted on second mint with same picks
     */
    function test_noEmit_PickConfigCreated_onSecondMint() public {
        bytes32 conditionId = keccak256("event-test-no-duplicate");

        IV2Types.Pick[] memory picks = new IV2Types.Pick[](1);
        picks[0] = IV2Types.Pick({
            conditionResolver: address(resolver),
            conditionId: abi.encode(conditionId),
            predictedOutcome: IV2Types.OutcomeSide.YES
        });

        uint256 pCollateral = 500e18;
        uint256 cCollateral = 500e18;

        // First mint - creates pick config
        IV2Types.MintRequest memory request1 =
            _createMintRequest(picks, pCollateral, cCollateral);
        market.mint(request1);

        // Second mint with same picks - should NOT emit PickConfigCreated
        IV2Types.MintRequest memory request2 =
            _createMintRequest(picks, pCollateral, cCollateral);

        vm.recordLogs();
        market.mint(request2);
        Vm.Log[] memory logs = vm.getRecordedLogs();

        bytes32 pickConfigCreatedSelector = keccak256(
            "PickConfigCreated(bytes32,address,address,(address,bytes,uint8)[])"
        );

        for (uint256 i = 0; i < logs.length; i++) {
            assertTrue(
                logs[i].topics[0] != pickConfigCreatedSelector,
                "PickConfigCreated should not be emitted on second mint"
            );
        }
    }

    /**
     * @notice Test: PickConfigCreated event contains correct token addresses and picks
     */
    function test_emit_PickConfigCreated_correctData() public {
        bytes32 conditionId = keccak256("event-test-data");

        IV2Types.Pick[] memory picks = new IV2Types.Pick[](1);
        picks[0] = IV2Types.Pick({
            conditionResolver: address(resolver),
            conditionId: abi.encode(conditionId),
            predictedOutcome: IV2Types.OutcomeSide.NO
        });

        bytes32 pickConfigId = keccak256(abi.encode(picks));

        uint256 pCollateral = 1000e18;
        uint256 cCollateral = 1000e18;
        IV2Types.MintRequest memory request =
            _createMintRequest(picks, pCollateral, cCollateral);

        vm.recordLogs();
        (, address predictorToken, address counterpartyToken) =
            market.mint(request);
        Vm.Log[] memory logs = vm.getRecordedLogs();

        // Find the PickConfigCreated event
        bytes32 pickConfigCreatedSelector = keccak256(
            "PickConfigCreated(bytes32,address,address,(address,bytes,uint8)[])"
        );

        bool found = false;
        for (uint256 i = 0; i < logs.length; i++) {
            if (logs[i].topics[0] == pickConfigCreatedSelector) {
                found = true;
                // topic[1] is indexed pickConfigId
                assertEq(logs[i].topics[1], pickConfigId);
                // Decode non-indexed data: (address, address, Pick[])
                (
                    address emittedPredictorToken,
                    address emittedCounterpartyToken,
                ) = abi.decode(
                    logs[i].data, (address, address, IV2Types.Pick[])
                );
                assertEq(emittedPredictorToken, predictorToken);
                assertEq(emittedCounterpartyToken, counterpartyToken);
                break;
            }
        }
        assertTrue(found, "PickConfigCreated event not found");
    }

    /**
     * @notice Test: PredictionCreated event includes pickConfigId
     */
    function test_emit_PredictionCreated_includesPickConfigId() public {
        bytes32 conditionId = keccak256("event-test-prediction-created");

        IV2Types.Pick[] memory picks = new IV2Types.Pick[](1);
        picks[0] = IV2Types.Pick({
            conditionResolver: address(resolver),
            conditionId: abi.encode(conditionId),
            predictedOutcome: IV2Types.OutcomeSide.YES
        });

        bytes32 pickConfigId = keccak256(abi.encode(picks));

        IV2Types.MintRequest memory request =
            _createMintRequest(picks, 1000e18, 2000e18);

        vm.recordLogs();
        (bytes32 predictionId,,) = market.mint(request);
        Vm.Log[] memory logs = vm.getRecordedLogs();

        bytes32 predictionCreatedSelector = keccak256(
            "PredictionCreated(bytes32,address,address,address,address,uint256,uint256,bytes32,bytes32)"
        );

        bool found = false;
        for (uint256 i = 0; i < logs.length; i++) {
            if (logs[i].topics[0] != predictionCreatedSelector) continue;
            found = true;
            assertEq(logs[i].topics[1], predictionId);
            // Decode last field (pickConfigId) from non-indexed data
            (,,,,, bytes32 emittedPickConfigId) = abi.decode(
                logs[i].data,
                (address, address, uint256, uint256, bytes32, bytes32)
            );
            assertEq(emittedPickConfigId, pickConfigId);
            break;
        }
        assertTrue(found, "PredictionCreated event not found");
    }

    /**
     * @notice Test: Second mint with same picks emits PredictionCreated with same pickConfigId
     */
    function test_emit_PredictionCreated_samePickConfigIdOnSecondMint() public {
        bytes32 conditionId = keccak256("event-test-same-config");

        IV2Types.Pick[] memory picks = new IV2Types.Pick[](1);
        picks[0] = IV2Types.Pick({
            conditionResolver: address(resolver),
            conditionId: abi.encode(conditionId),
            predictedOutcome: IV2Types.OutcomeSide.YES
        });

        bytes32 pickConfigId = keccak256(abi.encode(picks));

        // First mint
        IV2Types.MintRequest memory request1 =
            _createMintRequest(picks, 500e18, 500e18);
        market.mint(request1);

        // Second mint with same picks
        IV2Types.MintRequest memory request2 =
            _createMintRequest(picks, 800e18, 800e18);

        vm.recordLogs();
        market.mint(request2);
        Vm.Log[] memory logs = vm.getRecordedLogs();

        bytes32 predictionCreatedSelector = keccak256(
            "PredictionCreated(bytes32,address,address,address,address,uint256,uint256,bytes32,bytes32)"
        );

        bool found = false;
        for (uint256 i = 0; i < logs.length; i++) {
            if (logs[i].topics[0] == predictionCreatedSelector) {
                found = true;
                (,,,,, bytes32 emittedPickConfigId) = abi.decode(
                    logs[i].data,
                    (address, address, uint256, uint256, bytes32, bytes32)
                );
                assertEq(
                    emittedPickConfigId,
                    pickConfigId,
                    "Second mint should have same pickConfigId"
                );
                break;
            }
        }
        assertTrue(found, "PredictionCreated event not found on second mint");
    }

    // ============ Early Settlement Tests ============

    /**
     * @notice Test: Counterparty can claim when only one leg resolves against the predictor
     * The predictor needs ALL legs to win, so one decisive loss should be enough
     * for COUNTERPARTY_WINS even if other legs are still unresolved.
     */
    function test_fullFlow_twoPicks_earlyCounterpartyWin_oneLegLost() public {
        bytes32 condition1 = keccak256("early-settle-leg-1");
        bytes32 condition2 = keccak256("early-settle-leg-2");

        // Sort conditions for canonical order
        (bytes32 first, bytes32 second) = keccak256(abi.encode(condition1))
            < keccak256(abi.encode(condition2))
            ? (condition1, condition2)
            : (condition2, condition1);

        IV2Types.Pick[] memory picks = new IV2Types.Pick[](2);
        picks[0] = IV2Types.Pick({
            conditionResolver: address(resolver),
            conditionId: abi.encode(first),
            predictedOutcome: IV2Types.OutcomeSide.YES
        });
        picks[1] = IV2Types.Pick({
            conditionResolver: address(resolver),
            conditionId: abi.encode(second),
            predictedOutcome: IV2Types.OutcomeSide.YES
        });

        uint256 pCollateral = 500e18;
        uint256 cCollateral = 1000e18;
        IV2Types.MintRequest memory request =
            _createMintRequest(picks, pCollateral, cCollateral);
        (bytes32 predictionId,, address counterpartyToken) =
            market.mint(request);

        // Only settle the SECOND condition — the one predictor LOSES
        // The first condition remains unresolved, which comes first in the loop
        vm.prank(settler);
        resolver.settleCondition(second, IV2Types.OutcomeVector(0, 1)); // NO - predictor loses this pick

        // Should be able to settle even though second condition is unresolved
        market.settle(predictionId, REF_CODE);

        IV2Types.Prediction memory prediction =
            market.getPrediction(predictionId);
        IV2Types.PickConfiguration memory config =
            market.getPickConfiguration(prediction.pickConfigId);
        assertEq(
            uint256(config.result),
            uint256(IV2Types.SettlementResult.COUNTERPARTY_WINS)
        );

        // Counterparty gets all
        uint256 totalCollateral = pCollateral + cCollateral;
        vm.prank(counterparty);
        uint256 payout =
            market.redeem(counterpartyToken, totalCollateral, REF_CODE);
        assertEq(payout, totalCollateral);
    }

    /**
     * @notice Test: Counterparty can claim when one leg resolves as a tie (non-decisive)
     * while other legs are still unresolved.
     */
    function test_fullFlow_twoPicks_earlyCounterpartyWin_oneLegTie() public {
        bytes32 condition1 = keccak256("early-tie-leg-1");
        bytes32 condition2 = keccak256("early-tie-leg-2");

        // Sort conditions for canonical order
        (bytes32 first, bytes32 second) = keccak256(abi.encode(condition1))
            < keccak256(abi.encode(condition2))
            ? (condition1, condition2)
            : (condition2, condition1);

        IV2Types.Pick[] memory picks = new IV2Types.Pick[](2);
        picks[0] = IV2Types.Pick({
            conditionResolver: address(resolver),
            conditionId: abi.encode(first),
            predictedOutcome: IV2Types.OutcomeSide.YES
        });
        picks[1] = IV2Types.Pick({
            conditionResolver: address(resolver),
            conditionId: abi.encode(second),
            predictedOutcome: IV2Types.OutcomeSide.YES
        });

        uint256 pCollateral = 500e18;
        uint256 cCollateral = 1000e18;
        IV2Types.MintRequest memory request =
            _createMintRequest(picks, pCollateral, cCollateral);
        (bytes32 predictionId,, address counterpartyToken) =
            market.mint(request);

        // Only settle the SECOND condition as a TIE (non-decisive)
        // The first condition remains unresolved
        vm.prank(settler);
        resolver.settleCondition(second, IV2Types.OutcomeVector(1, 1)); // TIE

        // Should settle as COUNTERPARTY_WINS even with first leg unresolved
        market.settle(predictionId, REF_CODE);

        IV2Types.Prediction memory prediction =
            market.getPrediction(predictionId);
        IV2Types.PickConfiguration memory config =
            market.getPickConfiguration(prediction.pickConfigId);
        assertEq(
            uint256(config.result),
            uint256(IV2Types.SettlementResult.COUNTERPARTY_WINS)
        );

        // Counterparty gets all
        uint256 totalCollateral = pCollateral + cCollateral;
        vm.prank(counterparty);
        uint256 payout =
            market.redeem(counterpartyToken, totalCollateral, REF_CODE);
        assertEq(payout, totalCollateral);
    }

    /**
     * @notice Test: Predictor wins one leg but other is unresolved — must wait
     * Settlement should revert because predictor needs ALL legs to win.
     */
    function test_fullFlow_twoPicks_predictorWinsOne_otherUnresolved_reverts()
        public
    {
        bytes32 condition1 = keccak256("wait-leg-1");
        bytes32 condition2 = keccak256("wait-leg-2");

        (bytes32 first, bytes32 second) = keccak256(abi.encode(condition1))
            < keccak256(abi.encode(condition2))
            ? (condition1, condition2)
            : (condition2, condition1);

        IV2Types.Pick[] memory picks = new IV2Types.Pick[](2);
        picks[0] = IV2Types.Pick({
            conditionResolver: address(resolver),
            conditionId: abi.encode(first),
            predictedOutcome: IV2Types.OutcomeSide.YES
        });
        picks[1] = IV2Types.Pick({
            conditionResolver: address(resolver),
            conditionId: abi.encode(second),
            predictedOutcome: IV2Types.OutcomeSide.YES
        });

        uint256 pCollateral = 500e18;
        uint256 cCollateral = 1000e18;
        IV2Types.MintRequest memory request =
            _createMintRequest(picks, pCollateral, cCollateral);
        (bytes32 predictionId,,) = market.mint(request);

        // Settle only first condition in predictor's favor
        vm.prank(settler);
        resolver.settleCondition(first, IV2Types.OutcomeVector(1, 0)); // YES - predictor wins this pick

        // Should revert — predictor needs both legs, one is still unresolved
        vm.expectRevert(
            IPredictionMarketEscrow.PredictionNotResolvable.selector
        );
        market.settle(predictionId, REF_CODE);
    }

    /**
     * @notice Test: All legs unresolved — settlement reverts
     */
    function test_fullFlow_twoPicks_allUnresolved_reverts() public {
        bytes32 condition1 = keccak256("unresolved-leg-1");
        bytes32 condition2 = keccak256("unresolved-leg-2");

        (bytes32 first, bytes32 second) = keccak256(abi.encode(condition1))
            < keccak256(abi.encode(condition2))
            ? (condition1, condition2)
            : (condition2, condition1);

        IV2Types.Pick[] memory picks = new IV2Types.Pick[](2);
        picks[0] = IV2Types.Pick({
            conditionResolver: address(resolver),
            conditionId: abi.encode(first),
            predictedOutcome: IV2Types.OutcomeSide.YES
        });
        picks[1] = IV2Types.Pick({
            conditionResolver: address(resolver),
            conditionId: abi.encode(second),
            predictedOutcome: IV2Types.OutcomeSide.YES
        });

        IV2Types.MintRequest memory request =
            _createMintRequest(picks, 500e18, 1000e18);
        (bytes32 predictionId,,) = market.mint(request);

        // Neither condition settled
        vm.expectRevert(
            IPredictionMarketEscrow.PredictionNotResolvable.selector
        );
        market.settle(predictionId, REF_CODE);
    }

    /**
     * @notice Test: 3-leg parlay — one leg lost, two unresolved, counterparty wins early
     */
    function test_fullFlow_threePicks_earlyCounterpartyWin_oneLegLost() public {
        bytes32 condition1 = keccak256("three-leg-1");
        bytes32 condition2 = keccak256("three-leg-2");
        bytes32 condition3 = keccak256("three-leg-3");

        // Sort all three by keccak256 of encoded conditionId for canonical ordering
        bytes32[] memory sorted = new bytes32[](3);
        sorted[0] = condition1;
        sorted[1] = condition2;
        sorted[2] = condition3;
        // Simple bubble sort for 3 elements — compare by keccak256(abi.encode())
        if (keccak256(abi.encode(sorted[0])) > keccak256(abi.encode(sorted[1])))
        {
            (sorted[0], sorted[1]) = (sorted[1], sorted[0]);
        }
        if (keccak256(abi.encode(sorted[1])) > keccak256(abi.encode(sorted[2])))
        {
            (sorted[1], sorted[2]) = (sorted[2], sorted[1]);
        }
        if (keccak256(abi.encode(sorted[0])) > keccak256(abi.encode(sorted[1])))
        {
            (sorted[0], sorted[1]) = (sorted[1], sorted[0]);
        }

        IV2Types.Pick[] memory picks = new IV2Types.Pick[](3);
        picks[0] = IV2Types.Pick({
            conditionResolver: address(resolver),
            conditionId: abi.encode(sorted[0]),
            predictedOutcome: IV2Types.OutcomeSide.YES
        });
        picks[1] = IV2Types.Pick({
            conditionResolver: address(resolver),
            conditionId: abi.encode(sorted[1]),
            predictedOutcome: IV2Types.OutcomeSide.YES
        });
        picks[2] = IV2Types.Pick({
            conditionResolver: address(resolver),
            conditionId: abi.encode(sorted[2]),
            predictedOutcome: IV2Types.OutcomeSide.NO
        });

        uint256 pCollateral = 500e18;
        uint256 cCollateral = 1000e18;
        IV2Types.MintRequest memory request =
            _createMintRequest(picks, pCollateral, cCollateral);
        (bytes32 predictionId,, address counterpartyToken) =
            market.mint(request);

        // Settle only the middle condition — predictor loses (predicted YES, got NO)
        vm.prank(settler);
        resolver.settleCondition(sorted[1], IV2Types.OutcomeVector(0, 1));

        // Should settle as COUNTERPARTY_WINS despite two legs unresolved
        market.settle(predictionId, REF_CODE);

        IV2Types.PickConfiguration memory config = market.getPickConfiguration(
            market.getPrediction(predictionId).pickConfigId
        );
        assertEq(
            uint256(config.result),
            uint256(IV2Types.SettlementResult.COUNTERPARTY_WINS)
        );

        uint256 totalCollateral = pCollateral + cCollateral;
        vm.prank(counterparty);
        uint256 payout =
            market.redeem(counterpartyToken, totalCollateral, REF_CODE);
        assertEq(payout, totalCollateral);
    }

    /**
     * @notice Test: Mixed resolvers (individual path) — one leg lost on second resolver,
     * other leg unresolved on first resolver — counterparty wins early
     */
    function test_fullFlow_twoPicks_mixedResolvers_earlyCounterpartyWin()
        public
    {
        bytes32 condition1 = keccak256("mixed-resolver-leg-1");
        bytes32 condition2 = keccak256("mixed-resolver-leg-2");

        // Picks must be sorted by (resolver, conditionId) ascending
        // Determine which resolver comes first
        (
            address firstResolver,
            bytes32 firstCondition,
            address secondResolver,
            bytes32 secondCondition
        ) = address(resolver) < address(resolver2)
            ? (address(resolver), condition1, address(resolver2), condition2)
            : (address(resolver2), condition2, address(resolver), condition1);

        IV2Types.Pick[] memory picks = new IV2Types.Pick[](2);
        picks[0] = IV2Types.Pick({
            conditionResolver: firstResolver,
            conditionId: abi.encode(firstCondition),
            predictedOutcome: IV2Types.OutcomeSide.YES
        });
        picks[1] = IV2Types.Pick({
            conditionResolver: secondResolver,
            conditionId: abi.encode(secondCondition),
            predictedOutcome: IV2Types.OutcomeSide.YES
        });

        uint256 pCollateral = 500e18;
        uint256 cCollateral = 1000e18;
        IV2Types.MintRequest memory request =
            _createMintRequest(picks, pCollateral, cCollateral);
        (bytes32 predictionId,, address counterpartyToken) =
            market.mint(request);

        // Settle only the second pick's condition — predictor loses
        // First pick's condition remains unresolved
        vm.prank(settler);
        ManualConditionResolver(secondResolver)
            .settleCondition(secondCondition, IV2Types.OutcomeVector(0, 1));

        // Should settle via _resolveIndividual path
        market.settle(predictionId, REF_CODE);

        IV2Types.PickConfiguration memory config = market.getPickConfiguration(
            market.getPrediction(predictionId).pickConfigId
        );
        assertEq(
            uint256(config.result),
            uint256(IV2Types.SettlementResult.COUNTERPARTY_WINS)
        );

        uint256 totalCollateral = pCollateral + cCollateral;
        vm.prank(counterparty);
        uint256 payout =
            market.redeem(counterpartyToken, totalCollateral, REF_CODE);
        assertEq(payout, totalCollateral);
    }

    /**
     * @notice Test: Mixed resolvers — predictor wins one leg, other unresolved — must wait
     */
    function test_fullFlow_twoPicks_mixedResolvers_predictorWinsOne_reverts()
        public
    {
        bytes32 condition1 = keccak256("mixed-wait-leg-1");
        bytes32 condition2 = keccak256("mixed-wait-leg-2");

        // Sort by resolver address
        (
            address firstResolver,
            bytes32 firstCondition,
            address secondResolver,
            bytes32 secondCondition
        ) = address(resolver) < address(resolver2)
            ? (address(resolver), condition1, address(resolver2), condition2)
            : (address(resolver2), condition2, address(resolver), condition1);

        IV2Types.Pick[] memory picks = new IV2Types.Pick[](2);
        picks[0] = IV2Types.Pick({
            conditionResolver: firstResolver,
            conditionId: abi.encode(firstCondition),
            predictedOutcome: IV2Types.OutcomeSide.YES
        });
        picks[1] = IV2Types.Pick({
            conditionResolver: secondResolver,
            conditionId: abi.encode(secondCondition),
            predictedOutcome: IV2Types.OutcomeSide.YES
        });

        IV2Types.MintRequest memory request =
            _createMintRequest(picks, 500e18, 1000e18);
        (bytes32 predictionId,,) = market.mint(request);

        // Settle first pick's condition — predictor wins this one
        vm.prank(settler);
        ManualConditionResolver(firstResolver)
            .settleCondition(firstCondition, IV2Types.OutcomeVector(1, 0));

        // Should revert — second leg still unresolved
        vm.expectRevert(
            IPredictionMarketEscrow.PredictionNotResolvable.selector
        );
        market.settle(predictionId, REF_CODE);
    }
}
