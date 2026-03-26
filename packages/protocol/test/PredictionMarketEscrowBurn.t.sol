// SPDX-License-Identifier: MIT
pragma solidity ^0.8.19;

import "forge-std/Test.sol";
import "../src/PredictionMarketEscrow.sol";
import "../src/PredictionMarketTokenFactory.sol";
import "../src/resolvers/mocks/ManualConditionResolver.sol";
import "../src/interfaces/IV2Types.sol";
import "../src/interfaces/IV2Events.sol";
import "../src/interfaces/IPredictionMarketEscrow.sol";
import "../src/interfaces/IPredictionMarketToken.sol";
import "./mocks/MockERC20.sol";

contract PredictionMarketEscrowBurnTest is Test {
    // ============ State Variables ============

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
    uint256 public thirdPartyPk;

    uint256 public constant PREDICTOR_COLLATERAL = 100e18;
    uint256 public constant COUNTERPARTY_COLLATERAL = 150e18;
    uint256 public constant TOTAL_COLLATERAL =
        PREDICTOR_COLLATERAL + COUNTERPARTY_COLLATERAL;
    bytes32 public constant REF_CODE = keccak256("test-ref-code");

    bytes32 public rawConditionId1;
    bytes public conditionId1;

    uint256 private _nextNonce = 1;

    function _freshNonce() internal returns (uint256) {
        return _nextNonce++;
    }

    // ============ setUp ============

    function setUp() public {
        owner = vm.addr(1);
        predictorPk = 2;
        predictor = vm.addr(predictorPk);
        counterpartyPk = 3;
        counterparty = vm.addr(counterpartyPk);
        settler = vm.addr(4);
        thirdPartyPk = 5;
        thirdParty = vm.addr(thirdPartyPk);

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
        resolver.approveSettler(settler);

        rawConditionId1 = keccak256(abi.encode("condition-1"));
        conditionId1 = abi.encode(rawConditionId1);

        collateralToken.mint(predictor, 10_000e18);
        collateralToken.mint(counterparty, 10_000e18);
        collateralToken.mint(thirdParty, 10_000e18);

        vm.prank(predictor);
        collateralToken.approve(address(market), type(uint256).max);
        vm.prank(counterparty);
        collateralToken.approve(address(market), type(uint256).max);
        vm.prank(thirdParty);
        collateralToken.approve(address(market), type(uint256).max);
    }

    // ============ Helpers: Mint ============

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

    function _signMintApproval(
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
        request.predictorSignature = _signMintApproval(
            predictionHash,
            predictor,
            PREDICTOR_COLLATERAL,
            pNonce,
            deadline,
            predictorPk
        );
        request.counterpartySignature = _signMintApproval(
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

    function _mintDefault()
        internal
        returns (
            bytes32 pickConfigId,
            address predictorToken,
            address counterpartyToken
        )
    {
        IV2Types.Pick[] memory picks = new IV2Types.Pick[](1);
        picks[0] = _createPick(conditionId1, IV2Types.OutcomeSide.YES);

        (bytes32 predictionId,,) = _mintPrediction(picks);

        IV2Types.Prediction memory pred = market.getPrediction(predictionId);
        pickConfigId = pred.pickConfigId;

        IV2Types.TokenPair memory tp = market.getTokenPair(pickConfigId);
        predictorToken = tp.predictorToken;
        counterpartyToken = tp.counterpartyToken;
    }

    // ============ Helpers: Burn ============

    function _signBurnApproval(
        bytes32 burnHash,
        address signer,
        uint256 tokenAmount,
        uint256 payout,
        uint256 nonce,
        uint256 deadline,
        uint256 pk
    ) internal view returns (bytes memory) {
        bytes32 approvalHash = market.getBurnApprovalHash(
            burnHash, signer, tokenAmount, payout, nonce, deadline
        );
        (uint8 v, bytes32 r, bytes32 s) = vm.sign(pk, approvalHash);
        return abi.encodePacked(r, s, v);
    }

    function _createBurnRequest(
        bytes32 pickConfigId,
        uint256 predictorTokenAmount,
        uint256 counterpartyTokenAmount,
        address _predictorHolder,
        address _counterpartyHolder,
        uint256 predictorPayout,
        uint256 counterpartyPayout,
        uint256 _predictorPk,
        uint256 _counterpartyPk
    ) internal returns (IV2Types.BurnRequest memory request) {
        bytes32 burnHash = keccak256(
            abi.encode(
                pickConfigId,
                predictorTokenAmount,
                counterpartyTokenAmount,
                _predictorHolder,
                _counterpartyHolder,
                predictorPayout,
                counterpartyPayout
            )
        );

        uint256 pNonce = _freshNonce();
        uint256 cNonce = _freshNonce();
        uint256 deadline = block.timestamp + 1 hours;

        request.pickConfigId = pickConfigId;
        request.predictorTokenAmount = predictorTokenAmount;
        request.counterpartyTokenAmount = counterpartyTokenAmount;
        request.predictorHolder = _predictorHolder;
        request.counterpartyHolder = _counterpartyHolder;
        request.predictorPayout = predictorPayout;
        request.counterpartyPayout = counterpartyPayout;
        request.predictorNonce = pNonce;
        request.counterpartyNonce = cNonce;
        request.predictorDeadline = deadline;
        request.counterpartyDeadline = deadline;
        request.predictorSignature = _signBurnApproval(
            burnHash,
            _predictorHolder,
            predictorTokenAmount,
            predictorPayout,
            pNonce,
            deadline,
            _predictorPk
        );
        request.counterpartySignature = _signBurnApproval(
            burnHash,
            _counterpartyHolder,
            counterpartyTokenAmount,
            counterpartyPayout,
            cNonce,
            deadline,
            _counterpartyPk
        );
        request.refCode = REF_CODE;
        request.predictorSessionKeyData = "";
        request.counterpartySessionKeyData = "";
    }

    // ============ Happy Path Tests ============

    function test_burn_basicBilateral() public {
        (
            bytes32 pickConfigId,
            address predictorToken,
            address counterpartyToken
        ) = _mintDefault();

        uint256 predictorBalBefore = collateralToken.balanceOf(predictor);
        uint256 counterpartyBalBefore = collateralToken.balanceOf(counterparty);
        uint256 marketBalBefore = collateralToken.balanceOf(address(market));

        // Burn all tokens: each side has TOTAL_COLLATERAL tokens
        IV2Types.BurnRequest memory req = _createBurnRequest(
            pickConfigId,
            TOTAL_COLLATERAL, // burn all predictor tokens
            TOTAL_COLLATERAL, // burn all counterparty tokens
            predictor,
            counterparty,
            PREDICTOR_COLLATERAL, // predictor gets back their collateral
            COUNTERPARTY_COLLATERAL, // counterparty gets back their collateral
            predictorPk,
            counterpartyPk
        );

        market.burn(req);

        // Verify tokens burned
        assertEq(IPredictionMarketToken(predictorToken).balanceOf(predictor), 0);
        assertEq(
            IPredictionMarketToken(counterpartyToken).balanceOf(counterparty), 0
        );
        assertEq(IPredictionMarketToken(predictorToken).totalSupply(), 0);
        assertEq(IPredictionMarketToken(counterpartyToken).totalSupply(), 0);

        // Verify collateral returned
        assertEq(
            collateralToken.balanceOf(predictor),
            predictorBalBefore + PREDICTOR_COLLATERAL
        );
        assertEq(
            collateralToken.balanceOf(counterparty),
            counterpartyBalBefore + COUNTERPARTY_COLLATERAL
        );
        assertEq(
            collateralToken.balanceOf(address(market)),
            marketBalBefore - PREDICTOR_COLLATERAL - COUNTERPARTY_COLLATERAL
        );

        // Verify accounting updated
        IV2Types.PickConfiguration memory config =
            market.getPickConfiguration(pickConfigId);
        assertEq(config.totalPredictorCollateral, 0);
        assertEq(config.totalCounterpartyCollateral, 0);
    }

    function test_burn_unequalPayouts() public {
        (bytes32 pickConfigId,,) = _mintDefault();

        // Predictor negotiates a premium for early exit
        uint256 predictorPayout = 120e18;
        uint256 counterpartyPayout = TOTAL_COLLATERAL - predictorPayout;

        IV2Types.BurnRequest memory req = _createBurnRequest(
            pickConfigId,
            TOTAL_COLLATERAL,
            TOTAL_COLLATERAL,
            predictor,
            counterparty,
            predictorPayout,
            counterpartyPayout,
            predictorPk,
            counterpartyPk
        );

        uint256 predictorBalBefore = collateralToken.balanceOf(predictor);
        uint256 counterpartyBalBefore = collateralToken.balanceOf(counterparty);

        market.burn(req);

        assertEq(
            collateralToken.balanceOf(predictor),
            predictorBalBefore + predictorPayout
        );
        assertEq(
            collateralToken.balanceOf(counterparty),
            counterpartyBalBefore + counterpartyPayout
        );
    }

    function test_burn_partialBurn() public {
        (
            bytes32 pickConfigId,
            address predictorToken,
            address counterpartyToken
        ) = _mintDefault();

        // Burn half of each side's tokens
        uint256 partialPredictor = TOTAL_COLLATERAL / 2; // 125e18
        uint256 partialCounterparty = TOTAL_COLLATERAL / 2; // 125e18

        // Proportional collateral backing:
        // predictorBacking = (125e18 * 100e18) / 250e18 = 50e18
        // counterpartyBacking = (125e18 * 150e18) / 250e18 = 75e18
        uint256 predictorPayout = 50e18;
        uint256 counterpartyPayout = 75e18;
        uint256 totalPayout = predictorPayout + counterpartyPayout;

        IV2Types.BurnRequest memory req = _createBurnRequest(
            pickConfigId,
            partialPredictor,
            partialCounterparty,
            predictor,
            counterparty,
            predictorPayout,
            counterpartyPayout,
            predictorPk,
            counterpartyPk
        );

        market.burn(req);

        // Verify remaining tokens
        assertEq(
            IPredictionMarketToken(predictorToken).balanceOf(predictor),
            TOTAL_COLLATERAL - partialPredictor
        );
        assertEq(
            IPredictionMarketToken(counterpartyToken).balanceOf(counterparty),
            TOTAL_COLLATERAL - partialCounterparty
        );

        // Verify accounting (collateral reduced proportionally)
        IV2Types.PickConfiguration memory config =
            market.getPickConfiguration(pickConfigId);
        assertEq(
            config.totalPredictorCollateral,
            PREDICTOR_COLLATERAL - predictorPayout
        );
        assertEq(
            config.totalCounterpartyCollateral,
            COUNTERPARTY_COLLATERAL - counterpartyPayout
        );

        // Verify market still holds remaining collateral
        assertEq(
            collateralToken.balanceOf(address(market)),
            TOTAL_COLLATERAL - totalPayout
        );
    }

    function test_burn_multipleSequentialBurns() public {
        (
            bytes32 pickConfigId,
            address predictorToken,
            address counterpartyToken
        ) = _mintDefault();

        // First burn: 50 tokens from each side
        // predictorBacking = (50 * 100) / 250 = 20
        // counterpartyBacking = (50 * 150) / 250 = 30
        uint256 burn1Tokens = 50e18;
        uint256 burn1PredPayout = 20e18;
        uint256 burn1CtrPayout = 30e18;

        IV2Types.BurnRequest memory req1 = _createBurnRequest(
            pickConfigId,
            burn1Tokens,
            burn1Tokens,
            predictor,
            counterparty,
            burn1PredPayout,
            burn1CtrPayout,
            predictorPk,
            counterpartyPk
        );

        market.burn(req1);

        // After burn1: predCollateral=80, ctrCollateral=120, predTokens=200, ctrTokens=200
        // Second burn: 50 tokens from each side
        // predictorBacking = (50 * 80) / 200 = 20
        // counterpartyBacking = (50 * 120) / 200 = 30
        uint256 burn2Tokens = 50e18;
        uint256 burn2PredPayout = 20e18;
        uint256 burn2CtrPayout = 30e18;

        IV2Types.BurnRequest memory req2 = _createBurnRequest(
            pickConfigId,
            burn2Tokens,
            burn2Tokens,
            predictor,
            counterparty,
            burn2PredPayout,
            burn2CtrPayout,
            predictorPk,
            counterpartyPk
        );

        market.burn(req2);

        // Verify remaining tokens
        assertEq(
            IPredictionMarketToken(predictorToken).balanceOf(predictor),
            TOTAL_COLLATERAL - burn1Tokens - burn2Tokens
        );
        assertEq(
            IPredictionMarketToken(counterpartyToken).balanceOf(counterparty),
            TOTAL_COLLATERAL - burn1Tokens - burn2Tokens
        );

        // Verify accounting
        IV2Types.PickConfiguration memory config =
            market.getPickConfiguration(pickConfigId);
        assertEq(
            config.totalPredictorCollateral,
            PREDICTOR_COLLATERAL - burn1PredPayout - burn2PredPayout
        );
        assertEq(
            config.totalCounterpartyCollateral,
            COUNTERPARTY_COLLATERAL - burn1CtrPayout - burn2CtrPayout
        );
    }

    function test_burn_noncesMarkedUsed() public {
        (bytes32 pickConfigId,,) = _mintDefault();

        // Track which nonces will be used
        uint256 savedNext = _nextNonce;

        // Burn 50 tokens from each side
        // predictorBacking = (50 * 100) / 250 = 20
        // counterpartyBacking = (50 * 150) / 250 = 30
        IV2Types.BurnRequest memory req = _createBurnRequest(
            pickConfigId,
            50e18,
            50e18,
            predictor,
            counterparty,
            20e18,
            30e18,
            predictorPk,
            counterpartyPk
        );

        market.burn(req);

        assertTrue(market.isNonceUsed(predictor, savedNext));
        assertTrue(market.isNonceUsed(counterparty, savedNext + 1));
    }

    function test_burn_zeroPayoutOneSide() public {
        (bytes32 pickConfigId,,) = _mintDefault();

        // Counterparty forfeits, predictor gets everything
        // Burn all tokens from both sides
        IV2Types.BurnRequest memory req = _createBurnRequest(
            pickConfigId,
            TOTAL_COLLATERAL,
            TOTAL_COLLATERAL,
            predictor,
            counterparty,
            TOTAL_COLLATERAL, // predictor gets all
            0, // counterparty gets nothing
            predictorPk,
            counterpartyPk
        );

        uint256 predictorBalBefore = collateralToken.balanceOf(predictor);
        uint256 counterpartyBalBefore = collateralToken.balanceOf(counterparty);

        market.burn(req);

        assertEq(
            collateralToken.balanceOf(predictor),
            predictorBalBefore + TOTAL_COLLATERAL
        );
        assertEq(collateralToken.balanceOf(counterparty), counterpartyBalBefore);
    }

    function test_burn_emitsEvent() public {
        (bytes32 pickConfigId,,) = _mintDefault();

        IV2Types.BurnRequest memory req = _createBurnRequest(
            pickConfigId,
            TOTAL_COLLATERAL,
            TOTAL_COLLATERAL,
            predictor,
            counterparty,
            PREDICTOR_COLLATERAL,
            COUNTERPARTY_COLLATERAL,
            predictorPk,
            counterpartyPk
        );

        vm.expectEmit(true, true, true, true);
        emit IV2Events.PositionsBurned(
            pickConfigId,
            predictor,
            counterparty,
            TOTAL_COLLATERAL,
            TOTAL_COLLATERAL,
            PREDICTOR_COLLATERAL,
            COUNTERPARTY_COLLATERAL,
            REF_CODE
        );

        market.burn(req);
    }

    // ============ Revert Tests ============

    function test_burn_revertIfInvalidPredictorSignature() public {
        (bytes32 pickConfigId,,) = _mintDefault();

        IV2Types.BurnRequest memory req = _createBurnRequest(
            pickConfigId,
            TOTAL_COLLATERAL,
            TOTAL_COLLATERAL,
            predictor,
            counterparty,
            PREDICTOR_COLLATERAL,
            COUNTERPARTY_COLLATERAL,
            predictorPk,
            counterpartyPk
        );

        // Corrupt predictor signature
        req.predictorSignature = abi.encodePacked(
            bytes32(uint256(1)), bytes32(uint256(2)), uint8(27)
        );

        vm.expectRevert(
            IPredictionMarketEscrow.InvalidPredictorSignature.selector
        );
        market.burn(req);
    }

    function test_burn_revertIfInvalidCounterpartySignature() public {
        (bytes32 pickConfigId,,) = _mintDefault();

        IV2Types.BurnRequest memory req = _createBurnRequest(
            pickConfigId,
            TOTAL_COLLATERAL,
            TOTAL_COLLATERAL,
            predictor,
            counterparty,
            PREDICTOR_COLLATERAL,
            COUNTERPARTY_COLLATERAL,
            predictorPk,
            counterpartyPk
        );

        // Corrupt counterparty signature
        req.counterpartySignature = abi.encodePacked(
            bytes32(uint256(1)), bytes32(uint256(2)), uint8(27)
        );

        vm.expectRevert(
            IPredictionMarketEscrow.InvalidCounterpartSignature.selector
        );
        market.burn(req);
    }

    function test_burn_revertIfExpiredPredictorDeadline() public {
        (bytes32 pickConfigId,,) = _mintDefault();

        IV2Types.BurnRequest memory req = _createBurnRequest(
            pickConfigId,
            TOTAL_COLLATERAL,
            TOTAL_COLLATERAL,
            predictor,
            counterparty,
            PREDICTOR_COLLATERAL,
            COUNTERPARTY_COLLATERAL,
            predictorPk,
            counterpartyPk
        );

        // Warp past deadline
        vm.warp(block.timestamp + 2 hours);

        vm.expectRevert(
            IPredictionMarketEscrow.InvalidPredictorSignature.selector
        );
        market.burn(req);
    }

    function test_burn_revertIfWrongPredictorNonce() public {
        (bytes32 pickConfigId,,) = _mintDefault();

        IV2Types.BurnRequest memory req = _createBurnRequest(
            pickConfigId,
            TOTAL_COLLATERAL,
            TOTAL_COLLATERAL,
            predictor,
            counterparty,
            PREDICTOR_COLLATERAL,
            COUNTERPARTY_COLLATERAL,
            predictorPk,
            counterpartyPk
        );

        // Set wrong nonce
        req.predictorNonce = 999;

        vm.expectRevert(
            IPredictionMarketEscrow.InvalidPredictorSignature.selector
        );
        market.burn(req);
    }

    function test_burn_revertIfWrongCounterpartyNonce() public {
        (bytes32 pickConfigId,,) = _mintDefault();

        IV2Types.BurnRequest memory req = _createBurnRequest(
            pickConfigId,
            TOTAL_COLLATERAL,
            TOTAL_COLLATERAL,
            predictor,
            counterparty,
            PREDICTOR_COLLATERAL,
            COUNTERPARTY_COLLATERAL,
            predictorPk,
            counterpartyPk
        );

        // Set wrong counterparty nonce
        req.counterpartyNonce = 999;

        vm.expectRevert(
            IPredictionMarketEscrow.InvalidCounterpartSignature.selector
        );
        market.burn(req);
    }

    function test_burn_revertIfZeroPredictorTokenAmount() public {
        (bytes32 pickConfigId,,) = _mintDefault();

        IV2Types.BurnRequest memory req = _createBurnRequest(
            pickConfigId,
            0, // zero predictor amount
            COUNTERPARTY_COLLATERAL,
            predictor,
            counterparty,
            0,
            COUNTERPARTY_COLLATERAL,
            predictorPk,
            counterpartyPk
        );

        vm.expectRevert(IPredictionMarketEscrow.ZeroAmount.selector);
        market.burn(req);
    }

    function test_burn_revertIfZeroCounterpartyTokenAmount() public {
        (bytes32 pickConfigId,,) = _mintDefault();

        IV2Types.BurnRequest memory req = _createBurnRequest(
            pickConfigId,
            PREDICTOR_COLLATERAL,
            0, // zero counterparty amount
            predictor,
            counterparty,
            PREDICTOR_COLLATERAL,
            0,
            predictorPk,
            counterpartyPk
        );

        vm.expectRevert(IPredictionMarketEscrow.ZeroAmount.selector);
        market.burn(req);
    }

    function test_burn_revertIfPayoutSumNotEqualTokenSum() public {
        (bytes32 pickConfigId,,) = _mintDefault();

        // Use equal token amounts (symmetric) but excessive payouts
        // Total collateral is 250e18, requesting 300e18 back
        uint256 equalTokens = TOTAL_COLLATERAL;

        IV2Types.BurnRequest memory req = _createBurnRequest(
            pickConfigId,
            equalTokens,
            equalTokens,
            predictor,
            counterparty,
            200e18, // predictor wants 200
            100e18, // counterparty wants 100 — total 300 > 250 backing
            predictorPk,
            counterpartyPk
        );

        vm.expectRevert(IPredictionMarketEscrow.InvalidBurnAmounts.selector);
        market.burn(req);
    }

    function test_burn_revertIfPickConfigAlreadyResolved() public {
        IV2Types.Pick[] memory picks = new IV2Types.Pick[](1);
        picks[0] = _createPick(conditionId1, IV2Types.OutcomeSide.YES);

        (bytes32 predictionId,,) = _mintPrediction(picks);
        IV2Types.Prediction memory pred = market.getPrediction(predictionId);
        bytes32 pickConfigId = pred.pickConfigId;

        // Resolve the condition and settle
        vm.prank(settler);
        resolver.settleCondition(rawConditionId1, IV2Types.OutcomeVector(1, 0));
        market.settle(predictionId, REF_CODE);

        // Attempt burn after resolution
        IV2Types.BurnRequest memory req = _createBurnRequest(
            pickConfigId,
            TOTAL_COLLATERAL,
            TOTAL_COLLATERAL,
            predictor,
            counterparty,
            PREDICTOR_COLLATERAL,
            COUNTERPARTY_COLLATERAL,
            predictorPk,
            counterpartyPk
        );

        vm.expectRevert(
            IPredictionMarketEscrow.PickConfigAlreadyResolved.selector
        );
        market.burn(req);
    }

    function test_burn_revertIfPickConfigNotFound() public {
        bytes32 fakePickConfigId = keccak256("fake");

        // For a non-existent pickConfig, backing is 0 so payouts must be 0
        IV2Types.BurnRequest memory req = _createBurnRequest(
            fakePickConfigId,
            TOTAL_COLLATERAL,
            TOTAL_COLLATERAL,
            predictor,
            counterparty,
            0,
            0,
            predictorPk,
            counterpartyPk
        );

        vm.expectRevert(IPredictionMarketEscrow.InvalidToken.selector);
        market.burn(req);
    }

    function test_burn_revertIfInsufficientTokenBalance() public {
        (bytes32 pickConfigId,,) = _mintDefault();

        // Try to burn more tokens than holder has
        IV2Types.BurnRequest memory req = _createBurnRequest(
            pickConfigId,
            PREDICTOR_COLLATERAL + 1, // more than available
            COUNTERPARTY_COLLATERAL,
            predictor,
            counterparty,
            PREDICTOR_COLLATERAL + 1,
            COUNTERPARTY_COLLATERAL,
            predictorPk,
            counterpartyPk
        );

        vm.expectRevert(); // ERC20 burn will revert
        market.burn(req);
    }

    // ============ Integration Tests ============

    function test_burn_thenMintMore() public {
        (
            bytes32 pickConfigId,
            address predictorToken,
            address counterpartyToken
        ) = _mintDefault();

        // Burn all
        IV2Types.BurnRequest memory req = _createBurnRequest(
            pickConfigId,
            TOTAL_COLLATERAL,
            TOTAL_COLLATERAL,
            predictor,
            counterparty,
            PREDICTOR_COLLATERAL,
            COUNTERPARTY_COLLATERAL,
            predictorPk,
            counterpartyPk
        );

        market.burn(req);

        // Verify accounting is zero
        IV2Types.PickConfiguration memory config =
            market.getPickConfiguration(pickConfigId);
        assertEq(config.totalPredictorCollateral, 0);
        assertEq(config.totalCounterpartyCollateral, 0);

        // Mint again on same pickConfig
        IV2Types.Pick[] memory picks = new IV2Types.Pick[](1);
        picks[0] = _createPick(conditionId1, IV2Types.OutcomeSide.YES);

        _mintPrediction(picks);

        // Verify tokens minted again (proportional: TOTAL_COLLATERAL each)
        assertEq(
            IPredictionMarketToken(predictorToken).balanceOf(predictor),
            TOTAL_COLLATERAL
        );
        assertEq(
            IPredictionMarketToken(counterpartyToken).balanceOf(counterparty),
            TOTAL_COLLATERAL
        );

        // Verify accounting restored
        config = market.getPickConfiguration(pickConfigId);
        assertEq(config.totalPredictorCollateral, PREDICTOR_COLLATERAL);
        assertEq(config.totalCounterpartyCollateral, COUNTERPARTY_COLLATERAL);
    }

    function test_burn_partialThenSettleAndRedeem() public {
        IV2Types.Pick[] memory picks = new IV2Types.Pick[](1);
        picks[0] = _createPick(conditionId1, IV2Types.OutcomeSide.YES);

        (bytes32 predictionId,,) = _mintPrediction(picks);
        IV2Types.Prediction memory pred = market.getPrediction(predictionId);
        bytes32 pickConfigId = pred.pickConfigId;
        IV2Types.TokenPair memory tp = market.getTokenPair(pickConfigId);

        // Burn half of tokens from each side
        uint256 halfTokens = TOTAL_COLLATERAL / 2; // 125e18

        // Proportional backing:
        // predictorBacking = (125 * 100) / 250 = 50
        // counterpartyBacking = (125 * 150) / 250 = 75
        uint256 predPayout = 50e18;
        uint256 ctrPayout = 75e18;

        IV2Types.BurnRequest memory req = _createBurnRequest(
            pickConfigId,
            halfTokens,
            halfTokens,
            predictor,
            counterparty,
            predPayout,
            ctrPayout,
            predictorPk,
            counterpartyPk
        );

        market.burn(req);

        // Verify remaining tokens
        uint256 remainingTokens = TOTAL_COLLATERAL - halfTokens; // 125e18

        assertEq(
            IPredictionMarketToken(tp.predictorToken).balanceOf(predictor),
            remainingTokens
        );
        assertEq(
            IPredictionMarketToken(tp.counterpartyToken)
                .balanceOf(counterparty),
            remainingTokens
        );

        // Resolve: predictor wins
        vm.prank(settler);
        resolver.settleCondition(rawConditionId1, IV2Types.OutcomeVector(1, 0));
        market.settle(predictionId, REF_CODE);

        // Predictor redeems remaining tokens
        uint256 predictorBalBefore = collateralToken.balanceOf(predictor);
        vm.prank(predictor);
        uint256 payout =
            market.redeem(tp.predictorToken, remainingTokens, REF_CODE);

        // Payout should be total remaining collateral (predictor wins all)
        // remainingPredCollateral = 50, remainingCtrCollateral = 75
        uint256 expectedPayout = (PREDICTOR_COLLATERAL - predPayout)
            + (COUNTERPARTY_COLLATERAL - ctrPayout);
        assertEq(payout, expectedPayout);
        assertEq(
            collateralToken.balanceOf(predictor),
            predictorBalBefore + expectedPayout
        );
    }

    function test_burn_sameHolderBothSides() public {
        (
            bytes32 pickConfigId,
            address predictorToken,
            address counterpartyToken
        ) = _mintDefault();

        // Transfer counterparty tokens to predictor so same address holds both
        vm.prank(counterparty);
        IPredictionMarketToken(counterpartyToken)
            .transfer(predictor, TOTAL_COLLATERAL);

        // Same address burns both sides — needs two DIFFERENT nonces with bitmap
        uint256 predictorNonce = _freshNonce();
        uint256 counterpartyNonce = _freshNonce();

        bytes32 burnHash = keccak256(
            abi.encode(
                pickConfigId,
                TOTAL_COLLATERAL,
                TOTAL_COLLATERAL,
                predictor,
                predictor, // same address both sides
                PREDICTOR_COLLATERAL,
                COUNTERPARTY_COLLATERAL
            )
        );

        uint256 deadline = block.timestamp + 1 hours;

        IV2Types.BurnRequest memory req;
        req.pickConfigId = pickConfigId;
        req.predictorTokenAmount = TOTAL_COLLATERAL;
        req.counterpartyTokenAmount = TOTAL_COLLATERAL;
        req.predictorHolder = predictor;
        req.counterpartyHolder = predictor; // same address
        req.predictorPayout = PREDICTOR_COLLATERAL;
        req.counterpartyPayout = COUNTERPARTY_COLLATERAL;
        req.predictorNonce = predictorNonce;
        req.counterpartyNonce = counterpartyNonce; // different nonce
        req.predictorDeadline = deadline;
        req.counterpartyDeadline = deadline;
        req.predictorSignature = _signBurnApproval(
            burnHash,
            predictor,
            TOTAL_COLLATERAL,
            PREDICTOR_COLLATERAL,
            predictorNonce,
            deadline,
            predictorPk
        );
        req.counterpartySignature = _signBurnApproval(
            burnHash,
            predictor,
            TOTAL_COLLATERAL,
            COUNTERPARTY_COLLATERAL,
            counterpartyNonce,
            deadline,
            predictorPk
        );
        req.refCode = REF_CODE;
        req.predictorSessionKeyData = "";
        req.counterpartySessionKeyData = "";

        uint256 balBefore = collateralToken.balanceOf(predictor);
        market.burn(req);

        // Verify tokens burned
        assertEq(IPredictionMarketToken(predictorToken).balanceOf(predictor), 0);
        assertEq(
            IPredictionMarketToken(counterpartyToken).balanceOf(predictor), 0
        );

        // Verify collateral returned
        assertEq(
            collateralToken.balanceOf(predictor), balBefore + TOTAL_COLLATERAL
        );

        // Verify both nonces marked used
        assertTrue(market.isNonceUsed(predictor, predictorNonce));
        assertTrue(market.isNonceUsed(predictor, counterpartyNonce));
    }

    function test_burn_thirdPartyAfterTokenTransfer() public {
        (
            bytes32 pickConfigId,
            address predictorToken,
            address counterpartyToken
        ) = _mintDefault();

        // Transfer all predictor tokens to thirdParty
        vm.prank(predictor);
        IPredictionMarketToken(predictorToken)
            .transfer(thirdParty, TOTAL_COLLATERAL);

        // ThirdParty (now holding predictor tokens) burns with counterparty
        IV2Types.BurnRequest memory req = _createBurnRequest(
            pickConfigId,
            TOTAL_COLLATERAL,
            TOTAL_COLLATERAL,
            thirdParty, // new predictor holder
            counterparty,
            PREDICTOR_COLLATERAL,
            COUNTERPARTY_COLLATERAL,
            thirdPartyPk,
            counterpartyPk
        );

        uint256 thirdPartyBalBefore = collateralToken.balanceOf(thirdParty);
        uint256 counterpartyBalBefore = collateralToken.balanceOf(counterparty);

        market.burn(req);

        // Verify tokens burned from new holders
        assertEq(
            IPredictionMarketToken(predictorToken).balanceOf(thirdParty), 0
        );
        assertEq(
            IPredictionMarketToken(counterpartyToken).balanceOf(counterparty), 0
        );

        // Verify collateral sent to correct addresses
        assertEq(
            collateralToken.balanceOf(thirdParty),
            thirdPartyBalBefore + PREDICTOR_COLLATERAL
        );
        assertEq(
            collateralToken.balanceOf(counterparty),
            counterpartyBalBefore + COUNTERPARTY_COLLATERAL
        );
    }

    // ============ Asymmetric Burn Attack Tests ============

    /// @notice Demonstrates the attack vector: asymmetric burn drains the
    ///         eventual winner pool. This test should REVERT with AsymmetricBurn
    ///         after the fix is applied.
    function test_burn_asymmetricDustWinnerTokenReverts() public {
        IV2Types.Pick[] memory picks = new IV2Types.Pick[](1);
        picks[0] = _createPick(conditionId1, IV2Types.OutcomeSide.YES);

        (bytes32 predictionId,,) = _mintPrediction(picks);
        IV2Types.Prediction memory pred = market.getPrediction(predictionId);
        bytes32 pickConfigId = pred.pickConfigId;
        IV2Types.TokenPair memory tokenPair = market.getTokenPair(pickConfigId);
        address predictorToken = tokenPair.predictorToken;
        address counterpartyToken = tokenPair.counterpartyToken;

        uint256 dustWinnerTokens = 1;

        // Attacker acquires dust of predictor tokens + all counterparty tokens
        vm.prank(predictor);
        IPredictionMarketToken(predictorToken)
            .transfer(thirdParty, dustWinnerTokens);
        vm.prank(counterparty);
        IPredictionMarketToken(counterpartyToken)
            .transfer(thirdParty, TOTAL_COLLATERAL);

        // Attempt asymmetric burn — should revert
        IV2Types.BurnRequest memory req = _createBurnRequest(
            pickConfigId,
            dustWinnerTokens,
            TOTAL_COLLATERAL,
            thirdParty,
            thirdParty,
            0,
            COUNTERPARTY_COLLATERAL,
            thirdPartyPk,
            thirdPartyPk
        );

        vm.expectRevert(IPredictionMarketEscrow.AsymmetricBurn.selector);
        market.burn(req);
    }

    /// @notice Symmetric burn still works: equal fractions from both sides
    function test_burn_symmetricBurnStillWorks() public {
        IV2Types.Pick[] memory picks = new IV2Types.Pick[](1);
        picks[0] = _createPick(conditionId1, IV2Types.OutcomeSide.YES);

        (bytes32 predictionId,,) = _mintPrediction(picks);
        IV2Types.Prediction memory pred = market.getPrediction(predictionId);
        bytes32 pickConfigId = pred.pickConfigId;
        IV2Types.TokenPair memory tokenPair = market.getTokenPair(pickConfigId);
        address predictorToken = tokenPair.predictorToken;
        address counterpartyToken = tokenPair.counterpartyToken;

        // Third party acquires equal amounts of both sides (50% each)
        uint256 halfSupply = TOTAL_COLLATERAL / 2;
        vm.prank(predictor);
        IPredictionMarketToken(predictorToken).transfer(thirdParty, halfSupply);
        vm.prank(counterparty);
        IPredictionMarketToken(counterpartyToken)
            .transfer(thirdParty, halfSupply);

        // Proportional payout: 50% of each side's collateral
        uint256 predictorPayout = PREDICTOR_COLLATERAL / 2;
        uint256 counterpartyPayout = COUNTERPARTY_COLLATERAL / 2;

        IV2Types.BurnRequest memory req = _createBurnRequest(
            pickConfigId,
            halfSupply,
            halfSupply,
            thirdParty,
            thirdParty,
            predictorPayout,
            counterpartyPayout,
            thirdPartyPk,
            thirdPartyPk
        );

        uint256 balBefore = collateralToken.balanceOf(thirdParty);
        market.burn(req);
        uint256 balAfter = collateralToken.balanceOf(thirdParty);

        assertEq(balAfter - balBefore, predictorPayout + counterpartyPayout);

        // Verify pool is still proportionally correct for remaining holders
        IV2Types.PickConfiguration memory postConfig =
            market.getPickConfiguration(pickConfigId);
        assertEq(
            postConfig.totalPredictorTokensMinted, TOTAL_COLLATERAL - halfSupply
        );
        assertEq(
            postConfig.totalCounterpartyTokensMinted,
            TOTAL_COLLATERAL - halfSupply
        );
    }

    /// @notice View helper returns correct symmetric amount
    function test_getSymmetricBurnAmount() public {
        IV2Types.Pick[] memory picks = new IV2Types.Pick[](1);
        picks[0] = _createPick(conditionId1, IV2Types.OutcomeSide.YES);

        (bytes32 predictionId,,) = _mintPrediction(picks);
        IV2Types.Prediction memory pred = market.getPrediction(predictionId);
        bytes32 pickConfigId = pred.pickConfigId;

        // Both sides have TOTAL_COLLATERAL tokens, so ratio is 1:1
        uint256 counterpartAmount =
            market.getSymmetricBurnAmount(pickConfigId, 100e18, true);
        assertEq(counterpartAmount, 100e18);

        // Reverse direction
        uint256 predictorAmount =
            market.getSymmetricBurnAmount(pickConfigId, 50e18, false);
        assertEq(predictorAmount, 50e18);
    }

    /// @notice View helper works after partial burn changes supply ratio
    function test_getSymmetricBurnAmount_afterPartialBurn() public {
        IV2Types.Pick[] memory picks = new IV2Types.Pick[](1);
        picks[0] = _createPick(conditionId1, IV2Types.OutcomeSide.YES);

        (bytes32 predictionId,,) = _mintPrediction(picks);
        IV2Types.Prediction memory pred = market.getPrediction(predictionId);
        bytes32 pickConfigId = pred.pickConfigId;

        // Burn half of each side symmetrically first
        uint256 halfSupply = TOTAL_COLLATERAL / 2;
        IV2Types.BurnRequest memory req = _createBurnRequest(
            pickConfigId,
            halfSupply,
            halfSupply,
            predictor,
            counterparty,
            PREDICTOR_COLLATERAL / 2,
            COUNTERPARTY_COLLATERAL / 2,
            predictorPk,
            counterpartyPk
        );
        market.burn(req);

        // Remaining supply is still 1:1, helper should reflect that
        uint256 counterpartAmount =
            market.getSymmetricBurnAmount(pickConfigId, 50e18, true);
        assertEq(counterpartAmount, 50e18);
    }

    /// @notice Multiple mints with different collateral ratios on the same
    ///         pickConfig, then partial symmetric burn — verify collateral
    ///         accounting is conserved and remaining holders get fair payouts.
    ///         This is a regression guard: if anything changes in the burn or
    ///         redeem math, this test will catch it.
    function test_burn_multiMintDifferentRatios_partialBurn_conserved() public {
        IV2Types.Pick[] memory picks = new IV2Types.Pick[](1);
        picks[0] = _createPick(conditionId1, IV2Types.OutcomeSide.YES);

        // Mint 1: 100 predictor + 150 counterparty = 250 tokens each side
        (bytes32 predictionId1,,) = _mintPrediction(picks);
        IV2Types.Prediction memory pred1 = market.getPrediction(predictionId1);
        bytes32 pickConfigId = pred1.pickConfigId;

        // Mint 2: different ratio — 200 predictor + 50 counterparty = 250 tokens each
        uint256 mint2PredictorColl = 200e18;
        uint256 mint2CounterpartyColl = 50e18;
        {
            IV2Types.Pick[] memory picks2 = new IV2Types.Pick[](1);
            picks2[0] = _createPick(conditionId1, IV2Types.OutcomeSide.YES);

            bytes32 pickConfigId2 = keccak256(abi.encode(picks2));
            bytes32 predictionHash2 = keccak256(
                abi.encode(
                    pickConfigId2,
                    mint2PredictorColl,
                    mint2CounterpartyColl,
                    predictor,
                    counterparty,
                    address(0),
                    ""
                )
            );

            uint256 pNonce = _freshNonce();
            uint256 cNonce = _freshNonce();
            uint256 deadline = block.timestamp + 1 hours;

            IV2Types.MintRequest memory mintReq;
            mintReq.picks = picks2;
            mintReq.predictorCollateral = mint2PredictorColl;
            mintReq.counterpartyCollateral = mint2CounterpartyColl;
            mintReq.predictor = predictor;
            mintReq.counterparty = counterparty;
            mintReq.predictorNonce = pNonce;
            mintReq.counterpartyNonce = cNonce;
            mintReq.predictorDeadline = deadline;
            mintReq.counterpartyDeadline = deadline;
            mintReq.predictorSignature = _signMintApproval(
                predictionHash2,
                predictor,
                mint2PredictorColl,
                pNonce,
                deadline,
                predictorPk
            );
            mintReq.counterpartySignature = _signMintApproval(
                predictionHash2,
                counterparty,
                mint2CounterpartyColl,
                cNonce,
                deadline,
                counterpartyPk
            );
            mintReq.refCode = REF_CODE;

            market.mint(mintReq);
        }

        // Post-state: 500 tokens each side
        // totalPredictorCollateral = 100 + 200 = 300
        // totalCounterpartyCollateral = 150 + 50 = 200
        IV2Types.PickConfiguration memory configBefore =
            market.getPickConfiguration(pickConfigId);
        assertEq(
            configBefore.totalPredictorTokensMinted,
            500e18,
            "pre-burn predictor tokens"
        );
        assertEq(
            configBefore.totalCounterpartyTokensMinted,
            500e18,
            "pre-burn cp tokens"
        );
        assertEq(
            configBefore.totalPredictorCollateral,
            300e18,
            "pre-burn predictor coll"
        );
        assertEq(
            configBefore.totalCounterpartyCollateral, 200e18, "pre-burn cp coll"
        );

        // Partial symmetric burn: burn 250 tokens from each side (50%)
        uint256 burnAmount = 250e18;
        // Expected collateral returned: 50% of each pool
        uint256 expectedPredictorCollReturned = 150e18; // 50% of 300
        uint256 expectedCounterpartyCollReturned = 100e18; // 50% of 200

        IV2Types.BurnRequest memory req = _createBurnRequest(
            pickConfigId,
            burnAmount,
            burnAmount,
            predictor,
            counterparty,
            expectedPredictorCollReturned,
            expectedCounterpartyCollReturned,
            predictorPk,
            counterpartyPk
        );

        uint256 predictorBalBefore = collateralToken.balanceOf(predictor);
        uint256 counterpartyBalBefore = collateralToken.balanceOf(counterparty);

        market.burn(req);

        // Verify payouts
        assertEq(
            collateralToken.balanceOf(predictor),
            predictorBalBefore + expectedPredictorCollReturned,
            "predictor payout"
        );
        assertEq(
            collateralToken.balanceOf(counterparty),
            counterpartyBalBefore + expectedCounterpartyCollReturned,
            "counterparty payout"
        );

        // Verify remaining pool is exactly 50% of original
        IV2Types.PickConfiguration memory configAfter =
            market.getPickConfiguration(pickConfigId);
        assertEq(
            configAfter.totalPredictorTokensMinted,
            250e18,
            "post-burn predictor tokens"
        );
        assertEq(
            configAfter.totalCounterpartyTokensMinted,
            250e18,
            "post-burn cp tokens"
        );
        assertEq(
            configAfter.totalPredictorCollateral,
            150e18,
            "post-burn predictor coll"
        );
        assertEq(
            configAfter.totalCounterpartyCollateral, 100e18, "post-burn cp coll"
        );

        // Settle and verify remaining holders get correct payouts
        vm.prank(settler);
        resolver.settleCondition(rawConditionId1, IV2Types.OutcomeVector(1, 0));
        market.settle(predictionId1, REF_CODE);

        IV2Types.TokenPair memory tp = market.getTokenPair(pickConfigId);

        // Predictor wins — claimable pool = 150 + 100 = 250 (both sides remaining)
        uint256 remainingPredictorTokens =
            IPredictionMarketToken(tp.predictorToken).balanceOf(predictor);
        assertEq(remainingPredictorTokens, 250e18, "remaining predictor tokens");

        uint256 predictorRedeemBefore = collateralToken.balanceOf(predictor);
        vm.prank(predictor);
        uint256 payout = market.redeem(
            tp.predictorToken, remainingPredictorTokens, REF_CODE
        );

        // Winner gets ALL remaining collateral (150 + 100 = 250)
        assertEq(payout, 250e18, "winner total payout");
        assertEq(
            collateralToken.balanceOf(predictor),
            predictorRedeemBefore + 250e18,
            "winner final balance"
        );
    }

    /// @notice Even a small asymmetry should revert
    function test_burn_slightAsymmetryReverts() public {
        IV2Types.Pick[] memory picks = new IV2Types.Pick[](1);
        picks[0] = _createPick(conditionId1, IV2Types.OutcomeSide.YES);

        (bytes32 predictionId,,) = _mintPrediction(picks);
        IV2Types.Prediction memory pred = market.getPrediction(predictionId);
        bytes32 pickConfigId = pred.pickConfigId;
        IV2Types.TokenPair memory tokenPair = market.getTokenPair(pickConfigId);
        address predictorToken = tokenPair.predictorToken;
        address counterpartyToken = tokenPair.counterpartyToken;

        // Acquire slightly different amounts
        uint256 predictorAmount = 100e18;
        uint256 counterpartyAmount = 100e18 + 1; // off by 1 wei

        vm.prank(predictor);
        IPredictionMarketToken(predictorToken)
            .transfer(thirdParty, predictorAmount);
        vm.prank(counterparty);
        IPredictionMarketToken(counterpartyToken)
            .transfer(thirdParty, counterpartyAmount);

        IV2Types.BurnRequest memory req = _createBurnRequest(
            pickConfigId,
            predictorAmount,
            counterpartyAmount,
            thirdParty,
            thirdParty,
            0,
            0,
            thirdPartyPk,
            thirdPartyPk
        );

        vm.expectRevert(IPredictionMarketEscrow.AsymmetricBurn.selector);
        market.burn(req);
    }
}
