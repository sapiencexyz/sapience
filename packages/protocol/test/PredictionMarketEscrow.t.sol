// SPDX-License-Identifier: MIT
pragma solidity ^0.8.19;

import "forge-std/Test.sol";
import "../src/PredictionMarketEscrow.sol";
import "../src/PredictionMarketTokenFactory.sol";
import "../src/resolvers/mocks/ManualConditionResolver.sol";
import "../src/interfaces/IV2Types.sol";
import "../src/interfaces/IPredictionMarketToken.sol";
import "./mocks/MockERC20.sol";

contract PredictionMarketEscrowTest is Test {
    PredictionMarketEscrow public market;
    ManualConditionResolver public resolver;
    MockERC20 public collateralToken;

    address public owner;
    address public predictor;
    address public counterparty;
    address public settler;
    address public thirdParty;

    uint256 public predictorPk;
    uint256 public counterpartyPk;

    uint256 public constant PREDICTOR_COLLATERAL = 100e18;
    uint256 public constant COUNTERPARTY_COLLATERAL = 150e18;
    uint256 public constant TOTAL_COLLATERAL =
        PREDICTOR_COLLATERAL + COUNTERPARTY_COLLATERAL;
    bytes32 public constant REF_CODE = keccak256("test-ref-code");

    bytes public conditionId1;
    bytes public conditionId2;
    bytes32 public rawConditionId1;
    bytes32 public rawConditionId2;

    uint256 private _nextNonce = 1;

    function setUp() public {
        // Create accounts with known private keys
        owner = vm.addr(1);
        predictorPk = 2;
        predictor = vm.addr(predictorPk);
        counterpartyPk = 3;
        counterparty = vm.addr(counterpartyPk);
        settler = vm.addr(4);
        thirdParty = vm.addr(5);

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

        // Approve settler
        vm.prank(owner);
        resolver.approveSettler(settler);

        // Create condition IDs
        rawConditionId1 = keccak256(abi.encode("condition-1"));
        rawConditionId2 = keccak256(abi.encode("condition-2"));
        conditionId1 = abi.encode(rawConditionId1);
        conditionId2 = abi.encode(rawConditionId2);

        // Mint tokens to users
        collateralToken.mint(predictor, 10_000e18);
        collateralToken.mint(counterparty, 10_000e18);

        // Approve market to spend tokens
        vm.prank(predictor);
        collateralToken.approve(address(market), type(uint256).max);
        vm.prank(counterparty);
        collateralToken.approve(address(market), type(uint256).max);
    }

    // ============ Helper Functions ============

    function _createPick(
        bytes memory _conditionId,
        IV2Types.OutcomeSide _outcome
    ) internal view returns (IV2Types.Pick memory) {
        return IV2Types.Pick({
            conditionResolver: address(resolver),
            conditionId: _conditionId,
            predictedOutcome: _outcome
        });
    }

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

    function _freshNonce() internal returns (uint256) {
        return _nextNonce++;
    }

    function _createMintRequest(IV2Types.Pick[] memory picks)
        internal
        returns (IV2Types.MintRequest memory request)
    {
        bytes32 pickConfigId = keccak256(abi.encode(picks));
        bytes32 predictionHash = keccak256(
            abi.encode(
                pickConfigId,
                PREDICTOR_COLLATERAL,
                COUNTERPARTY_COLLATERAL,
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
        request.predictorCollateral = PREDICTOR_COLLATERAL;
        request.counterpartyCollateral = COUNTERPARTY_COLLATERAL;
        request.predictor = predictor;
        request.counterparty = counterparty;
        request.predictorNonce = pNonce;
        request.counterpartyNonce = cNonce;
        request.predictorDeadline = deadline;
        request.counterpartyDeadline = deadline;
        request.predictorSignature = _signApproval(
            predictionHash,
            predictor,
            PREDICTOR_COLLATERAL,
            pNonce,
            deadline,
            predictorPk
        );
        request.counterpartySignature = _signApproval(
            predictionHash,
            counterparty,
            COUNTERPARTY_COLLATERAL,
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

    function _mintPrediction(IV2Types.Pick[] memory picks)
        internal
        returns (
            bytes32 predictionId,
            address predictorToken,
            address counterpartyToken
        )
    {
        IV2Types.MintRequest memory request = _createMintRequest(picks);
        return market.mint(request);
    }

    // ============ Constructor Tests ============

    function test_constructor_setsCollateralToken() public view {
        assertEq(address(market.collateralToken()), address(collateralToken));
    }

    // ============ Mint Tests ============

    function test_mint_singlePick() public {
        IV2Types.Pick[] memory picks = new IV2Types.Pick[](1);
        picks[0] = _createPick(conditionId1, IV2Types.OutcomeSide.YES);

        uint256 predictorBalanceBefore = collateralToken.balanceOf(predictor);
        uint256 counterpartyBalanceBefore =
            collateralToken.balanceOf(counterparty);

        (
            bytes32 predictionId,
            address predictorToken,
            address counterpartyToken
        ) = _mintPrediction(picks);

        // Check prediction was created
        assertTrue(predictionId != bytes32(0));
        assertTrue(predictorToken != address(0));
        assertTrue(counterpartyToken != address(0));

        // Check collateral was transferred
        assertEq(
            collateralToken.balanceOf(predictor),
            predictorBalanceBefore - PREDICTOR_COLLATERAL
        );
        assertEq(
            collateralToken.balanceOf(counterparty),
            counterpartyBalanceBefore - COUNTERPARTY_COLLATERAL
        );
        assertEq(
            collateralToken.balanceOf(address(market)),
            PREDICTOR_COLLATERAL + COUNTERPARTY_COLLATERAL
        );

        // Check position tokens were minted (amount = totalCollateral in proportional model)
        assertEq(
            IPredictionMarketToken(predictorToken).balanceOf(predictor),
            TOTAL_COLLATERAL
        );
        assertEq(
            IPredictionMarketToken(counterpartyToken).balanceOf(counterparty),
            TOTAL_COLLATERAL
        );

        // Check prediction data
        IV2Types.Prediction memory prediction =
            market.getPrediction(predictionId);
        assertEq(prediction.predictor, predictor);
        assertEq(prediction.counterparty, counterparty);
        assertEq(prediction.predictorCollateral, PREDICTOR_COLLATERAL);
        assertEq(prediction.counterpartyCollateral, COUNTERPARTY_COLLATERAL);
        assertFalse(prediction.settled);
    }

    function test_mint_multiplePicks() public {
        // Sort by keccak256 hash for canonical ordering
        (bytes memory first, bytes memory second) = keccak256(conditionId1)
            < keccak256(conditionId2)
            ? (conditionId1, conditionId2)
            : (conditionId2, conditionId1);

        IV2Types.Pick[] memory picks = new IV2Types.Pick[](2);
        picks[0] = _createPick(first, IV2Types.OutcomeSide.YES);
        picks[1] = _createPick(second, IV2Types.OutcomeSide.NO);

        (
            bytes32 predictionId,
            address predictorToken,
            address counterpartyToken
        ) = _mintPrediction(picks);

        assertTrue(predictionId != bytes32(0));
        assertTrue(predictorToken != address(0));
        assertTrue(counterpartyToken != address(0));

        // Verify picks were stored (getPicks uses pickConfigId)
        IV2Types.Prediction memory prediction =
            market.getPrediction(predictionId);
        IV2Types.Pick[] memory storedPicks =
            market.getPicks(prediction.pickConfigId);
        assertEq(storedPicks.length, 2);
        assertEq(storedPicks[0].conditionId, first);
        assertEq(storedPicks[1].conditionId, second);
    }

    function test_mint_revertIfNoPicks() public {
        IV2Types.Pick[] memory picks = new IV2Types.Pick[](0);
        IV2Types.MintRequest memory request = _createMintRequest(picks);

        vm.expectRevert(IPredictionMarketEscrow.InvalidPicks.selector);
        market.mint(request);
    }

    function test_mint_revertIfZeroAmount() public {
        IV2Types.Pick[] memory picks = new IV2Types.Pick[](1);
        picks[0] = _createPick(conditionId1, IV2Types.OutcomeSide.YES);

        IV2Types.MintRequest memory request = _createMintRequest(picks);
        request.predictorCollateral = 0;

        vm.expectRevert(IPredictionMarketEscrow.ZeroAmount.selector);
        market.mint(request);
    }

    function test_mint_marksNoncesUsed() public {
        IV2Types.Pick[] memory picks = new IV2Types.Pick[](1);
        picks[0] = _createPick(conditionId1, IV2Types.OutcomeSide.YES);

        // Pick nonces that will be used
        uint256 savedNext = _nextNonce;
        uint256 pNonce = savedNext;
        uint256 cNonce = savedNext + 1;

        assertFalse(market.isNonceUsed(predictor, pNonce));
        assertFalse(market.isNonceUsed(counterparty, cNonce));

        _mintPrediction(picks);

        assertTrue(market.isNonceUsed(predictor, pNonce));
        assertTrue(market.isNonceUsed(counterparty, cNonce));
    }

    // ============ Settle Tests ============

    function test_settle_predictorWins() public {
        // Create prediction with YES pick
        IV2Types.Pick[] memory picks = new IV2Types.Pick[](1);
        picks[0] = _createPick(conditionId1, IV2Types.OutcomeSide.YES);

        (bytes32 predictionId,,) = _mintPrediction(picks);

        // Settle condition to YES
        vm.prank(settler);
        resolver.settleCondition(rawConditionId1, IV2Types.OutcomeVector(1, 0));

        // Settle prediction
        market.settle(predictionId, REF_CODE);

        // Check prediction is settled (result is now on PickConfiguration)
        IV2Types.Prediction memory prediction =
            market.getPrediction(predictionId);
        assertTrue(prediction.settled);
        IV2Types.PickConfiguration memory config =
            market.getPickConfiguration(prediction.pickConfigId);
        assertEq(
            uint256(config.result),
            uint256(IV2Types.SettlementResult.PREDICTOR_WINS)
        );
    }

    function test_settle_counterpartyWins() public {
        // Create prediction with YES pick
        IV2Types.Pick[] memory picks = new IV2Types.Pick[](1);
        picks[0] = _createPick(conditionId1, IV2Types.OutcomeSide.YES);

        (bytes32 predictionId,,) = _mintPrediction(picks);

        // Settle condition to NO (predictor loses)
        vm.prank(settler);
        resolver.settleCondition(rawConditionId1, IV2Types.OutcomeVector(0, 1));

        // Settle prediction
        market.settle(predictionId, REF_CODE);

        // Check prediction is settled (result is now on PickConfiguration)
        IV2Types.Prediction memory prediction =
            market.getPrediction(predictionId);
        assertTrue(prediction.settled);
        IV2Types.PickConfiguration memory config =
            market.getPickConfiguration(prediction.pickConfigId);
        assertEq(
            uint256(config.result),
            uint256(IV2Types.SettlementResult.COUNTERPARTY_WINS)
        );
    }

    function test_settle_tie() public {
        // Create prediction with YES pick
        IV2Types.Pick[] memory picks = new IV2Types.Pick[](1);
        picks[0] = _createPick(conditionId1, IV2Types.OutcomeSide.YES);

        (bytes32 predictionId,,) = _mintPrediction(picks);

        // Settle condition to TIE
        vm.prank(settler);
        resolver.settleCondition(rawConditionId1, IV2Types.OutcomeVector(1, 1));

        // Settle prediction
        market.settle(predictionId, REF_CODE);

        // Check prediction is settled (result is now on PickConfiguration)
        IV2Types.Prediction memory prediction =
            market.getPrediction(predictionId);
        assertTrue(prediction.settled);
        IV2Types.PickConfiguration memory config =
            market.getPickConfiguration(prediction.pickConfigId);
        assertEq(
            uint256(config.result),
            uint256(IV2Types.SettlementResult.COUNTERPARTY_WINS)
        );
    }

    function test_settle_revertIfNotFound() public {
        bytes32 fakePredictionId = keccak256("fake");

        vm.expectRevert(IPredictionMarketEscrow.PredictionNotFound.selector);
        market.settle(fakePredictionId, REF_CODE);
    }

    function test_settle_revertIfAlreadySettled() public {
        IV2Types.Pick[] memory picks = new IV2Types.Pick[](1);
        picks[0] = _createPick(conditionId1, IV2Types.OutcomeSide.YES);

        (bytes32 predictionId,,) = _mintPrediction(picks);

        vm.prank(settler);
        resolver.settleCondition(rawConditionId1, IV2Types.OutcomeVector(1, 0));

        market.settle(predictionId, REF_CODE);

        vm.expectRevert(
            IPredictionMarketEscrow.PredictionAlreadySettled.selector
        );
        market.settle(predictionId, REF_CODE);
    }

    function test_settle_revertIfNotResolvable() public {
        IV2Types.Pick[] memory picks = new IV2Types.Pick[](1);
        picks[0] = _createPick(conditionId1, IV2Types.OutcomeSide.YES);

        (bytes32 predictionId,,) = _mintPrediction(picks);

        // Don't settle the condition - should fail
        vm.expectRevert(
            IPredictionMarketEscrow.PredictionNotResolvable.selector
        );
        market.settle(predictionId, REF_CODE);
    }

    // ============ Redeem Tests ============

    function test_redeem_predictorWins_fullAmount() public {
        IV2Types.Pick[] memory picks = new IV2Types.Pick[](1);
        picks[0] = _createPick(conditionId1, IV2Types.OutcomeSide.YES);

        (bytes32 predictionId, address predictorToken,) = _mintPrediction(picks);

        // Settle to predictor wins
        vm.prank(settler);
        resolver.settleCondition(rawConditionId1, IV2Types.OutcomeVector(1, 0));
        market.settle(predictionId, REF_CODE);

        // Predictor redeems (full token balance = TOTAL_COLLATERAL)
        uint256 predictorBalanceBefore = collateralToken.balanceOf(predictor);

        vm.prank(predictor);
        uint256 payout =
            market.redeem(predictorToken, TOTAL_COLLATERAL, REF_CODE);

        // Predictor should get all collateral
        assertEq(payout, TOTAL_COLLATERAL);
        assertEq(
            collateralToken.balanceOf(predictor),
            predictorBalanceBefore + payout
        );
    }

    function test_redeem_counterpartyWins_fullAmount() public {
        IV2Types.Pick[] memory picks = new IV2Types.Pick[](1);
        picks[0] = _createPick(conditionId1, IV2Types.OutcomeSide.YES);

        (bytes32 predictionId,, address counterpartyToken) =
            _mintPrediction(picks);

        // Settle to counterparty wins
        vm.prank(settler);
        resolver.settleCondition(rawConditionId1, IV2Types.OutcomeVector(0, 1));
        market.settle(predictionId, REF_CODE);

        // Counterparty redeems (full token balance = TOTAL_COLLATERAL)
        uint256 counterpartyBalanceBefore =
            collateralToken.balanceOf(counterparty);

        vm.prank(counterparty);
        uint256 payout =
            market.redeem(counterpartyToken, TOTAL_COLLATERAL, REF_CODE);

        // Counterparty should get all collateral
        assertEq(payout, TOTAL_COLLATERAL);
        assertEq(
            collateralToken.balanceOf(counterparty),
            counterpartyBalanceBefore + payout
        );
    }

    function test_redeem_tie_counterpartyWins() public {
        IV2Types.Pick[] memory picks = new IV2Types.Pick[](1);
        picks[0] = _createPick(conditionId1, IV2Types.OutcomeSide.YES);

        (
            bytes32 predictionId,
            address predictorToken,
            address counterpartyToken
        ) = _mintPrediction(picks);

        // Settle to tie — non-decisive treated as counterparty wins
        vm.prank(settler);
        resolver.settleCondition(rawConditionId1, IV2Types.OutcomeVector(1, 1));
        market.settle(predictionId, REF_CODE);

        // Predictor gets nothing
        vm.prank(predictor);
        uint256 predictorPayout =
            market.redeem(predictorToken, TOTAL_COLLATERAL, REF_CODE);

        // Counterparty gets all collateral
        vm.prank(counterparty);
        uint256 counterpartyPayout =
            market.redeem(counterpartyToken, TOTAL_COLLATERAL, REF_CODE);

        assertEq(predictorPayout, 0);
        assertEq(counterpartyPayout, TOTAL_COLLATERAL);
    }

    function test_redeem_partialAmount() public {
        IV2Types.Pick[] memory picks = new IV2Types.Pick[](1);
        picks[0] = _createPick(conditionId1, IV2Types.OutcomeSide.YES);

        (bytes32 predictionId, address predictorToken,) = _mintPrediction(picks);

        // Settle to predictor wins
        vm.prank(settler);
        resolver.settleCondition(rawConditionId1, IV2Types.OutcomeVector(1, 0));
        market.settle(predictionId, REF_CODE);

        // Predictor redeems half of their tokens
        uint256 redeemAmount = TOTAL_COLLATERAL / 2;
        vm.prank(predictor);
        uint256 payout = market.redeem(predictorToken, redeemAmount, REF_CODE);

        // Should get half of total (since they own all predictor tokens)
        assertEq(payout, TOTAL_COLLATERAL / 2);

        // Should still have half the tokens
        assertEq(
            IPredictionMarketToken(predictorToken).balanceOf(predictor),
            TOTAL_COLLATERAL / 2
        );
    }

    function test_redeem_revertIfNotSettled() public {
        IV2Types.Pick[] memory picks = new IV2Types.Pick[](1);
        picks[0] = _createPick(conditionId1, IV2Types.OutcomeSide.YES);

        (, address predictorToken,) = _mintPrediction(picks);

        vm.prank(predictor);
        vm.expectRevert(IPredictionMarketEscrow.PickConfigNotResolved.selector);
        market.redeem(predictorToken, PREDICTOR_COLLATERAL, REF_CODE);
    }

    function test_redeem_revertIfInvalidToken() public {
        vm.prank(predictor);
        vm.expectRevert(IPredictionMarketEscrow.InvalidToken.selector);
        market.redeem(address(collateralToken), 100e18, REF_CODE);
    }

    // ============ View Functions Tests ============

    function test_canSettle_true() public {
        IV2Types.Pick[] memory picks = new IV2Types.Pick[](1);
        picks[0] = _createPick(conditionId1, IV2Types.OutcomeSide.YES);

        (bytes32 predictionId,,) = _mintPrediction(picks);

        vm.prank(settler);
        resolver.settleCondition(rawConditionId1, IV2Types.OutcomeVector(1, 0));

        assertTrue(market.canSettle(predictionId));
    }

    function test_canSettle_false() public {
        IV2Types.Pick[] memory picks = new IV2Types.Pick[](1);
        picks[0] = _createPick(conditionId1, IV2Types.OutcomeSide.YES);

        (bytes32 predictionId,,) = _mintPrediction(picks);

        assertFalse(market.canSettle(predictionId));
    }

    function test_getTokenPair() public {
        IV2Types.Pick[] memory picks = new IV2Types.Pick[](1);
        picks[0] = _createPick(conditionId1, IV2Types.OutcomeSide.YES);

        (
            bytes32 predictionId,
            address predictorToken,
            address counterpartyToken
        ) = _mintPrediction(picks);

        // getTokenPair now takes pickConfigId
        IV2Types.Prediction memory prediction =
            market.getPrediction(predictionId);
        IV2Types.TokenPair memory pair =
            market.getTokenPair(prediction.pickConfigId);
        assertEq(pair.predictorToken, predictorToken);
        assertEq(pair.counterpartyToken, counterpartyToken);
    }
}
