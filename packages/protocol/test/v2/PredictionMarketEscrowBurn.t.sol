// SPDX-License-Identifier: MIT
pragma solidity ^0.8.19;

import "forge-std/Test.sol";
import "../../src/v2/PredictionMarketEscrow.sol";
import "../../src/v2/resolvers/mocks/ManualConditionResolver.sol";
import "../../src/v2/interfaces/IV2Types.sol";
import "../../src/v2/interfaces/IV2Events.sol";
import "../../src/v2/interfaces/IPredictionMarketEscrow.sol";
import "../../src/v2/interfaces/IPredictionMarketToken.sol";
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

    bytes32 public conditionId1;

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
        market = new PredictionMarketEscrow(address(collateralToken), owner);

        vm.prank(owner);
        resolver = new ManualConditionResolver(owner);

        vm.prank(owner);
        resolver.approveSettler(settler);

        conditionId1 = keccak256(abi.encode("condition-1"));

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

    function _createPick(bytes32 _conditionId, IV2Types.OutcomeSide _outcome)
        internal
        view
        returns (IV2Types.Pick memory)
    {
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
        view
        returns (IV2Types.MintRequest memory request)
    {
        bytes32 pickConfigId = keccak256(abi.encode(picks));
        bytes32 predictionHash = keccak256(
            abi.encode(
                pickConfigId,
                PREDICTOR_COLLATERAL,
                COUNTERPARTY_COLLATERAL,
                predictor,
                counterparty
            )
        );

        uint256 pNonce = market.getNonce(predictor);
        uint256 cNonce = market.getNonce(counterparty);
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
    ) internal view returns (IV2Types.BurnRequest memory request) {
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

        uint256 pNonce = market.getNonce(_predictorHolder);
        uint256 cNonce = market.getNonce(_counterpartyHolder);
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

    function test_burn_noncesIncrementCorrectly() public {
        (bytes32 pickConfigId,,) = _mintDefault();

        uint256 pNonceBefore = market.getNonce(predictor);
        uint256 cNonceBefore = market.getNonce(counterparty);

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

        assertEq(market.getNonce(predictor), pNonceBefore + 1);
        assertEq(market.getNonce(counterparty), cNonceBefore + 1);
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

        vm.expectRevert(IPredictionMarketEscrow.InvalidSignature.selector);
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

        vm.expectRevert(IPredictionMarketEscrow.InvalidSignature.selector);
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

        vm.expectRevert(IPredictionMarketEscrow.InvalidSignature.selector);
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

        vm.expectRevert(IPredictionMarketEscrow.InvalidSignature.selector);
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

        vm.expectRevert(IPredictionMarketEscrow.InvalidSignature.selector);
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

        vm.expectRevert(IPredictionMarketEscrow.ZeroCollateral.selector);
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

        vm.expectRevert(IPredictionMarketEscrow.ZeroCollateral.selector);
        market.burn(req);
    }

    function test_burn_revertIfPayoutSumNotEqualTokenSum() public {
        (bytes32 pickConfigId,,) = _mintDefault();

        // Payout sum (200) != token sum (250)
        bytes32 burnHash = keccak256(
            abi.encode(
                pickConfigId,
                PREDICTOR_COLLATERAL,
                COUNTERPARTY_COLLATERAL,
                predictor,
                counterparty,
                uint256(100e18),
                uint256(100e18)
            )
        );

        uint256 pNonce = market.getNonce(predictor);
        uint256 cNonce = market.getNonce(counterparty);
        uint256 deadline = block.timestamp + 1 hours;

        IV2Types.BurnRequest memory req;
        req.pickConfigId = pickConfigId;
        req.predictorTokenAmount = PREDICTOR_COLLATERAL;
        req.counterpartyTokenAmount = COUNTERPARTY_COLLATERAL;
        req.predictorHolder = predictor;
        req.counterpartyHolder = counterparty;
        req.predictorPayout = 100e18;
        req.counterpartyPayout = 100e18;
        req.predictorNonce = pNonce;
        req.counterpartyNonce = cNonce;
        req.predictorDeadline = deadline;
        req.counterpartyDeadline = deadline;
        req.predictorSignature = _signBurnApproval(
            burnHash,
            predictor,
            PREDICTOR_COLLATERAL,
            100e18,
            pNonce,
            deadline,
            predictorPk
        );
        req.counterpartySignature = _signBurnApproval(
            burnHash,
            counterparty,
            COUNTERPARTY_COLLATERAL,
            100e18,
            cNonce,
            deadline,
            counterpartyPk
        );
        req.refCode = REF_CODE;
        req.predictorSessionKeyData = "";
        req.counterpartySessionKeyData = "";

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
        resolver.settleCondition(conditionId1, IV2Types.OutcomeVector(1, 0));
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
            IPredictionMarketToken(tp.counterpartyToken).balanceOf(counterparty),
            remainingTokens
        );

        // Resolve: predictor wins
        vm.prank(settler);
        resolver.settleCondition(conditionId1, IV2Types.OutcomeVector(1, 0));
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
        IPredictionMarketToken(counterpartyToken).transfer(
            predictor, TOTAL_COLLATERAL
        );

        // Same address burns both sides
        // Both nonce checks happen before increment, so both use same current nonce
        uint256 currentNonce = market.getNonce(predictor);

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
        req.predictorNonce = currentNonce;
        req.counterpartyNonce = currentNonce; // same nonce since checks happen before increment
        req.predictorDeadline = deadline;
        req.counterpartyDeadline = deadline;
        req.predictorSignature = _signBurnApproval(
            burnHash,
            predictor,
            TOTAL_COLLATERAL,
            PREDICTOR_COLLATERAL,
            currentNonce,
            deadline,
            predictorPk
        );
        req.counterpartySignature = _signBurnApproval(
            burnHash,
            predictor,
            TOTAL_COLLATERAL,
            COUNTERPARTY_COLLATERAL,
            currentNonce,
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

        // Verify nonce incremented twice (once for each side)
        assertEq(market.getNonce(predictor), currentNonce + 2);
    }

    function test_burn_thirdPartyAfterTokenTransfer() public {
        (
            bytes32 pickConfigId,
            address predictorToken,
            address counterpartyToken
        ) = _mintDefault();

        // Transfer all predictor tokens to thirdParty
        vm.prank(predictor);
        IPredictionMarketToken(predictorToken).transfer(
            thirdParty, TOTAL_COLLATERAL
        );

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
}
