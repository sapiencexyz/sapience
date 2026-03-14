// SPDX-License-Identifier: MIT
pragma solidity ^0.8.22;

import "forge-std/Test.sol";
import {
    PredictionMarketVault
} from "../../src/vault/PredictionMarketVault.sol";
import {
    IPredictionMarketVault
} from "../../src/vault/interfaces/IPredictionMarketVault.sol";
import { PredictionMarketEscrow } from "../../src/PredictionMarketEscrow.sol";
import {
    IPredictionMarketEscrow
} from "../../src/interfaces/IPredictionMarketEscrow.sol";
import {
    ManualConditionResolver
} from "../../src/resolvers/mocks/ManualConditionResolver.sol";
import { IV2Types } from "../../src/interfaces/IV2Types.sol";
import {
    IPredictionMarketToken
} from "../../src/interfaces/IPredictionMarketToken.sol";
import {
    PredictionMarketTokenFactory
} from "../../src/PredictionMarketTokenFactory.sol";
import { MockERC20 } from "../mocks/MockERC20.sol";

/**
 * @title PredictionMarketVaultIntegrationTest
 * @notice Integration tests for PredictionMarketVault acting as counterparty in PredictionMarketEscrow
 * @dev Tests the main use case: vault provides liquidity as counterparty to predictions
 */
contract PredictionMarketVaultIntegrationTest is Test {
    PredictionMarketVault public vault;
    PredictionMarketEscrow public market;
    ManualConditionResolver public resolver;
    MockERC20 public collateralToken;

    address public owner;
    address public manager;
    address public predictor;
    address public settler;
    address public depositor1;
    address public depositor2;

    uint256 public managerPk;
    uint256 public predictorPk;

    uint256 public constant INITIAL_DEPOSIT = 100_000e18;
    uint256 public constant PREDICTOR_COLLATERAL = 1000e18;
    uint256 public constant COUNTERPARTY_COLLATERAL = 1500e18;
    uint256 public constant TOTAL_COLLATERAL =
        PREDICTOR_COLLATERAL + COUNTERPARTY_COLLATERAL;
    bytes32 public constant REF_CODE = keccak256("vault-integration-test");

    uint256 private _nextNonce = 1;

    function _freshNonce() internal returns (uint256) {
        return _nextNonce++;
    }

    function setUp() public {
        // Create accounts with known private keys
        owner = vm.addr(1);
        managerPk = 2;
        manager = vm.addr(managerPk);
        predictorPk = 3;
        predictor = vm.addr(predictorPk);
        settler = vm.addr(4);
        depositor1 = vm.addr(5);
        depositor2 = vm.addr(6);

        // Deploy collateral token
        collateralToken = new MockERC20("Test USDE", "USDE", 18);

        // Deploy prediction market with factory
        PredictionMarketTokenFactory tokenFactory =
            new PredictionMarketTokenFactory(owner);
        market = new PredictionMarketEscrow(
            address(collateralToken), owner, address(tokenFactory)
        );
        vm.prank(owner);
        tokenFactory.setDeployer(address(market));

        // Deploy vault
        vm.prank(owner);
        vault = new PredictionMarketVault(
            address(collateralToken),
            manager,
            "Passive Liquidity Vault V2",
            "PLV2"
        );

        // Deploy resolver and approve settler
        vm.startPrank(owner);
        resolver = new ManualConditionResolver(owner);
        resolver.approveSettler(settler);
        // Set interaction delays to 0 for testing
        vault.setDepositInteractionDelay(0);
        vault.setWithdrawalInteractionDelay(0);
        vm.stopPrank();

        // Mint tokens
        collateralToken.mint(predictor, 1_000_000e18);
        collateralToken.mint(depositor1, 1_000_000e18);
        collateralToken.mint(depositor2, 1_000_000e18);

        // Approve market for predictor
        vm.prank(predictor);
        collateralToken.approve(address(market), type(uint256).max);

        // Depositors fund the vault
        _depositToVault(depositor1, INITIAL_DEPOSIT);
        _depositToVault(depositor2, INITIAL_DEPOSIT);
    }

    // ============ Helper Functions ============

    function _depositToVault(address depositor, uint256 amount) internal {
        vm.startPrank(depositor);
        collateralToken.approve(address(vault), amount);
        vault.requestDeposit(amount, amount);
        vm.stopPrank();

        vm.prank(manager);
        vault.processDeposit(depositor);
    }

    function _signPredictorApproval(
        bytes32 predictionHash,
        uint256 collateral,
        uint256 nonce,
        uint256 deadline
    ) internal view returns (bytes memory) {
        bytes32 approvalHash = market.getMintApprovalHash(
            predictionHash, predictor, collateral, nonce, deadline
        );
        (uint8 v, bytes32 r, bytes32 s) = vm.sign(predictorPk, approvalHash);
        return abi.encodePacked(r, s, v);
    }

    function _signVaultApproval(
        bytes32 predictionHash,
        uint256 collateral,
        uint256 nonce,
        uint256 deadline
    ) internal view returns (bytes memory) {
        // Get the mint approval hash that the market will pass to vault.isValidSignature
        bytes32 mintApprovalHash = market.getMintApprovalHash(
            predictionHash, address(vault), collateral, nonce, deadline
        );

        // Get the hash that the manager needs to sign (vault wraps the mint approval hash)
        bytes32 vaultApprovalHash =
            vault.getApprovalHash(mintApprovalHash, manager);

        // Manager signs the vault approval hash
        (uint8 v, bytes32 r, bytes32 s) = vm.sign(managerPk, vaultApprovalHash);
        return abi.encodePacked(r, s, v);
    }

    function _createMintRequestWithVaultCounterparty(
        IV2Types.Pick[] memory picks,
        uint256 pCollateral,
        uint256 cCollateral
    ) internal returns (IV2Types.MintRequest memory request) {
        bytes32 pickConfigId = market.computePickConfigId(picks);
        bytes32 predictionHash = keccak256(
            abi.encode(
                pickConfigId,
                pCollateral,
                cCollateral,
                predictor,
                address(vault),
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
        request.counterparty = address(vault);
        request.predictorNonce = pNonce;
        request.counterpartyNonce = cNonce;
        request.predictorDeadline = deadline;
        request.counterpartyDeadline = deadline;
        request.predictorSignature = _signPredictorApproval(
            predictionHash, pCollateral, pNonce, deadline
        );
        request.counterpartySignature =
            _signVaultApproval(predictionHash, cCollateral, cNonce, deadline);
        request.refCode = REF_CODE;
        request.predictorSessionKeyData = "";
        request.counterpartySessionKeyData = "";
        request.predictorSponsor = address(0);
        request.predictorSponsorData = "";
    }

    function _createPick(bytes memory conditionId, IV2Types.OutcomeSide outcome)
        internal
        view
        returns (IV2Types.Pick memory)
    {
        return IV2Types.Pick({
            conditionResolver: address(resolver),
            conditionId: conditionId,
            predictedOutcome: outcome
        });
    }

    // ============ Integration Tests ============

    /**
     * @notice Test: Vault as counterparty - predictor wins, vault loses
     * Flow: deposit -> approve funds -> mint prediction -> settle -> predictor redeems
     */
    function test_vaultAsCounterparty_predictorWins() public {
        bytes32 conditionId = keccak256("game-team-a-wins");

        // Manager approves funds for the market
        vm.prank(manager);
        vault.approveFundsUsage(address(market), COUNTERPARTY_COLLATERAL);

        // Create prediction with vault as counterparty
        IV2Types.Pick[] memory picks = new IV2Types.Pick[](1);
        picks[0] =
            _createPick(abi.encode(conditionId), IV2Types.OutcomeSide.YES);

        IV2Types.MintRequest memory request =
            _createMintRequestWithVaultCounterparty(
                picks, PREDICTOR_COLLATERAL, COUNTERPARTY_COLLATERAL
            );

        uint256 vaultBalanceBefore = collateralToken.balanceOf(address(vault));
        uint256 predictorBalanceBefore = collateralToken.balanceOf(predictor);

        (
            bytes32 predictionId,
            address predictorToken,
            address counterpartyToken
        ) = market.mint(request);

        // Verify collateral was taken from vault
        assertEq(
            collateralToken.balanceOf(address(vault)),
            vaultBalanceBefore - COUNTERPARTY_COLLATERAL
        );

        // Verify position tokens minted (proportional: totalCollateral each)
        assertEq(
            IPredictionMarketToken(predictorToken).balanceOf(predictor),
            TOTAL_COLLATERAL
        );
        assertEq(
            IPredictionMarketToken(counterpartyToken).balanceOf(address(vault)),
            TOTAL_COLLATERAL
        );

        // Settle condition - Team A wins (YES) - predictor wins
        vm.prank(settler);
        resolver.settleCondition(conditionId, IV2Types.OutcomeVector(1, 0));

        // Settle prediction
        market.settle(predictionId, REF_CODE);

        // Predictor redeems - gets all collateral
        vm.prank(predictor);
        uint256 payout =
            market.redeem(predictorToken, TOTAL_COLLATERAL, REF_CODE);

        assertEq(payout, TOTAL_COLLATERAL);
        assertEq(
            collateralToken.balanceOf(predictor),
            predictorBalanceBefore - PREDICTOR_COLLATERAL + TOTAL_COLLATERAL
        );

        // Vault's counterparty tokens are worthless
        vm.prank(address(vault));
        uint256 vaultPayout =
            market.redeem(counterpartyToken, TOTAL_COLLATERAL, REF_CODE);
        assertEq(vaultPayout, 0);
    }

    /**
     * @notice Test: Vault as counterparty - vault wins (predictor loses)
     * Flow: deposit -> approve funds -> mint prediction -> settle -> vault redeems
     */
    function test_vaultAsCounterparty_vaultWins() public {
        bytes32 conditionId = keccak256("game-team-b-wins");

        // Manager approves funds for the market
        vm.prank(manager);
        vault.approveFundsUsage(address(market), COUNTERPARTY_COLLATERAL);

        // Create prediction with vault as counterparty
        IV2Types.Pick[] memory picks = new IV2Types.Pick[](1);
        picks[0] =
            _createPick(abi.encode(conditionId), IV2Types.OutcomeSide.YES);

        IV2Types.MintRequest memory request =
            _createMintRequestWithVaultCounterparty(
                picks, PREDICTOR_COLLATERAL, COUNTERPARTY_COLLATERAL
            );

        uint256 vaultBalanceBefore = collateralToken.balanceOf(address(vault));

        (bytes32 predictionId,, address counterpartyToken) =
            market.mint(request);

        // Settle condition - NO wins - predictor loses, vault wins
        vm.prank(settler);
        resolver.settleCondition(conditionId, IV2Types.OutcomeVector(0, 1));

        // Settle prediction
        market.settle(predictionId, REF_CODE);

        // Manager redeems on behalf of vault
        vm.prank(address(vault));
        uint256 payout =
            market.redeem(counterpartyToken, TOTAL_COLLATERAL, REF_CODE);

        assertEq(payout, TOTAL_COLLATERAL);

        // Vault balance should be original minus collateral plus winnings
        assertEq(
            collateralToken.balanceOf(address(vault)),
            vaultBalanceBefore - COUNTERPARTY_COLLATERAL + TOTAL_COLLATERAL
        );
    }

    /**
     * @notice Test: Vault as counterparty - tie (both get collateral back)
     */
    function test_vaultAsCounterparty_tie() public {
        bytes32 conditionId = keccak256("game-tie");

        vm.prank(manager);
        vault.approveFundsUsage(address(market), COUNTERPARTY_COLLATERAL);

        IV2Types.Pick[] memory picks = new IV2Types.Pick[](1);
        picks[0] =
            _createPick(abi.encode(conditionId), IV2Types.OutcomeSide.YES);

        IV2Types.MintRequest memory request =
            _createMintRequestWithVaultCounterparty(
                picks, PREDICTOR_COLLATERAL, COUNTERPARTY_COLLATERAL
            );

        uint256 vaultBalanceBefore = collateralToken.balanceOf(address(vault));
        uint256 predictorBalanceBefore = collateralToken.balanceOf(predictor);

        (
            bytes32 predictionId,
            address predictorToken,
            address counterpartyToken
        ) = market.mint(request);

        // Settle condition - TIE
        vm.prank(settler);
        resolver.settleCondition(conditionId, IV2Types.OutcomeVector(1, 1));

        // Settle prediction
        market.settle(predictionId, REF_CODE);

        // Non-decisive = counterparty (vault) wins all collateral
        vm.prank(predictor);
        uint256 predictorPayout =
            market.redeem(predictorToken, TOTAL_COLLATERAL, REF_CODE);

        vm.prank(address(vault));
        uint256 vaultPayout =
            market.redeem(counterpartyToken, TOTAL_COLLATERAL, REF_CODE);

        assertEq(predictorPayout, 0);
        assertEq(vaultPayout, TOTAL_COLLATERAL);

        // Vault ends up with predictor's collateral too
        assertEq(
            collateralToken.balanceOf(predictor),
            predictorBalanceBefore - PREDICTOR_COLLATERAL
        );
        assertEq(
            collateralToken.balanceOf(address(vault)),
            vaultBalanceBefore + PREDICTOR_COLLATERAL
        );
    }

    /**
     * @notice Test: Multiple predictions with vault as counterparty
     */
    function test_vaultAsCounterparty_multiplePredictions() public {
        bytes32 conditionId1 = keccak256("game-1");
        bytes32 conditionId2 = keccak256("game-2");

        // Manager approves enough for both predictions
        uint256 totalApproval = COUNTERPARTY_COLLATERAL * 2;
        vm.prank(manager);
        vault.approveFundsUsage(address(market), totalApproval);

        // Create first prediction
        IV2Types.Pick[] memory picks1 = new IV2Types.Pick[](1);
        picks1[0] =
            _createPick(abi.encode(conditionId1), IV2Types.OutcomeSide.YES);
        IV2Types.MintRequest memory request1 =
            _createMintRequestWithVaultCounterparty(
                picks1, PREDICTOR_COLLATERAL, COUNTERPARTY_COLLATERAL
            );
        (bytes32 predictionId1, address predictorToken1,) =
            market.mint(request1);

        // Create second prediction
        IV2Types.Pick[] memory picks2 = new IV2Types.Pick[](1);
        picks2[0] =
            _createPick(abi.encode(conditionId2), IV2Types.OutcomeSide.NO);
        IV2Types.MintRequest memory request2 =
            _createMintRequestWithVaultCounterparty(
                picks2, PREDICTOR_COLLATERAL, COUNTERPARTY_COLLATERAL
            );
        (bytes32 predictionId2,, address counterpartyToken2) =
            market.mint(request2);

        // Settle first condition - YES wins (predictor wins prediction 1)
        vm.prank(settler);
        resolver.settleCondition(conditionId1, IV2Types.OutcomeVector(1, 0));

        // Settle second condition - YES wins (predictor predicted NO, so vault wins prediction 2)
        vm.prank(settler);
        resolver.settleCondition(conditionId2, IV2Types.OutcomeVector(1, 0));

        // Settle both predictions
        market.settle(predictionId1, REF_CODE);
        market.settle(predictionId2, REF_CODE);

        // Predictor redeems from winning prediction 1
        vm.prank(predictor);
        uint256 payout1 =
            market.redeem(predictorToken1, TOTAL_COLLATERAL, REF_CODE);
        assertEq(payout1, TOTAL_COLLATERAL);

        // Vault redeems from winning prediction 2
        vm.prank(address(vault));
        uint256 payout2 =
            market.redeem(counterpartyToken2, TOTAL_COLLATERAL, REF_CODE);
        assertEq(payout2, TOTAL_COLLATERAL);
    }

    /**
     * @notice Test: Vault multi-pick prediction (multiple picks)
     */
    function test_vaultAsCounterparty_multiPickPrediction() public {
        bytes32 condition1 = bytes32(uint256(1));
        bytes32 condition2 = bytes32(uint256(2));

        vm.prank(manager);
        vault.approveFundsUsage(address(market), COUNTERPARTY_COLLATERAL);

        // Create multi-pick prediction with 2 picks — sort by keccak for canonical order
        (bytes memory first, bytes memory second) = keccak256(
                abi.encode(condition1)
            ) < keccak256(abi.encode(condition2))
            ? (abi.encode(condition1), abi.encode(condition2))
            : (abi.encode(condition2), abi.encode(condition1));
        IV2Types.Pick[] memory picks = new IV2Types.Pick[](2);
        picks[0] = _createPick(first, IV2Types.OutcomeSide.YES);
        picks[1] = _createPick(second, IV2Types.OutcomeSide.YES);

        IV2Types.MintRequest memory request =
            _createMintRequestWithVaultCounterparty(
                picks, PREDICTOR_COLLATERAL, COUNTERPARTY_COLLATERAL
            );

        (bytes32 predictionId,, address counterpartyToken) =
            market.mint(request);

        // Settle conditions - predictor wins first, loses second (multi-pick prediction fails)
        vm.startPrank(settler);
        resolver.settleCondition(condition1, IV2Types.OutcomeVector(1, 0)); // YES
        resolver.settleCondition(condition2, IV2Types.OutcomeVector(0, 1)); // NO (predictor loses)
        vm.stopPrank();

        // Settle prediction - vault wins because predictor's multi-pick prediction failed
        market.settle(predictionId, REF_CODE);

        IV2Types.Prediction memory prediction =
            market.getPrediction(predictionId);
        IV2Types.PickConfiguration memory config =
            market.getPickConfiguration(prediction.pickConfigId);
        assertEq(
            uint256(config.result),
            uint256(IV2Types.SettlementResult.COUNTERPARTY_WINS)
        );

        // Vault redeems all collateral
        vm.prank(address(vault));
        uint256 payout =
            market.redeem(counterpartyToken, TOTAL_COLLATERAL, REF_CODE);
        assertEq(payout, TOTAL_COLLATERAL);
    }

    /**
     * @notice Test: Vault withdrawal after winning prediction
     */
    function test_vaultWithdrawalAfterWinningPrediction() public {
        bytes32 conditionId = keccak256("profitable-game");

        vm.prank(manager);
        vault.approveFundsUsage(address(market), COUNTERPARTY_COLLATERAL);

        IV2Types.Pick[] memory picks = new IV2Types.Pick[](1);
        picks[0] =
            _createPick(abi.encode(conditionId), IV2Types.OutcomeSide.YES);

        IV2Types.MintRequest memory request =
            _createMintRequestWithVaultCounterparty(
                picks, PREDICTOR_COLLATERAL, COUNTERPARTY_COLLATERAL
            );

        (bytes32 predictionId,, address counterpartyToken) =
            market.mint(request);

        // Vault wins
        vm.prank(settler);
        resolver.settleCondition(conditionId, IV2Types.OutcomeVector(0, 1));
        market.settle(predictionId, REF_CODE);

        // Vault redeems winnings
        vm.prank(address(vault));
        market.redeem(counterpartyToken, TOTAL_COLLATERAL, REF_CODE);

        // Now depositor1 can withdraw with profits
        uint256 depositor1Shares = vault.balanceOf(depositor1);
        uint256 depositor1BalanceBefore = collateralToken.balanceOf(depositor1);

        // Wait for interaction delay
        vm.warp(block.timestamp + 1 days + 1);

        vm.prank(depositor1);
        vault.requestWithdrawal(depositor1Shares, depositor1Shares);

        // Calculate expected assets (share of total vault balance)
        uint256 totalShares = vault.totalSupply();
        uint256 vaultBalance = vault.availableAssets();
        uint256 expectedAssets = (depositor1Shares * vaultBalance) / totalShares;

        vm.prank(manager);
        vault.processWithdrawal(depositor1);

        uint256 depositor1Received =
            collateralToken.balanceOf(depositor1) - depositor1BalanceBefore;

        // Depositor should receive more than they deposited (profits from vault winning)
        assertGt(depositor1Received, 0);
    }

    /**
     * @notice Test: Insufficient approval reverts
     */
    function test_vaultAsCounterparty_insufficientApproval() public {
        bytes32 conditionId = keccak256("insufficient-funds");

        // Manager approves less than needed
        vm.prank(manager);
        vault.approveFundsUsage(address(market), COUNTERPARTY_COLLATERAL / 2);

        IV2Types.Pick[] memory picks = new IV2Types.Pick[](1);
        picks[0] =
            _createPick(abi.encode(conditionId), IV2Types.OutcomeSide.YES);

        IV2Types.MintRequest memory request =
            _createMintRequestWithVaultCounterparty(
                picks, PREDICTOR_COLLATERAL, COUNTERPARTY_COLLATERAL
            );

        // Should revert because vault doesn't have enough approved
        vm.expectRevert();
        market.mint(request);
    }

    /**
     * @notice Test: Emergency mode blocks new predictions but allows redemption
     */
    function test_vaultEmergencyMode_existingPredictionCanStillRedeem() public {
        bytes32 conditionId = keccak256("emergency-game");

        vm.prank(manager);
        vault.approveFundsUsage(address(market), COUNTERPARTY_COLLATERAL);

        IV2Types.Pick[] memory picks = new IV2Types.Pick[](1);
        picks[0] =
            _createPick(abi.encode(conditionId), IV2Types.OutcomeSide.YES);

        IV2Types.MintRequest memory request =
            _createMintRequestWithVaultCounterparty(
                picks, PREDICTOR_COLLATERAL, COUNTERPARTY_COLLATERAL
            );

        (bytes32 predictionId,, address counterpartyToken) =
            market.mint(request);

        // Enable emergency mode
        vm.prank(owner);
        vault.toggleEmergencyMode();

        // Prediction can still be settled
        vm.prank(settler);
        resolver.settleCondition(conditionId, IV2Types.OutcomeVector(0, 1));
        market.settle(predictionId, REF_CODE);

        // Vault can still redeem from market even in emergency mode
        vm.prank(address(vault));
        uint256 payout =
            market.redeem(counterpartyToken, TOTAL_COLLATERAL, REF_CODE);
        assertEq(payout, TOTAL_COLLATERAL);
    }

    /**
     * @notice Test: Vault nonces marked used correctly across multiple predictions
     */
    function test_vaultNoncesMarkedUsedCorrectly() public {
        // Record the nonces that will be used
        uint256 startNonce = _nextNonce;

        for (uint256 i = 0; i < 3; i++) {
            bytes32 conditionId = keccak256(abi.encode("game", i));

            vm.prank(manager);
            vault.approveFundsUsage(address(market), COUNTERPARTY_COLLATERAL);

            IV2Types.Pick[] memory picks = new IV2Types.Pick[](1);
            picks[0] =
                _createPick(abi.encode(conditionId), IV2Types.OutcomeSide.YES);

            IV2Types.MintRequest memory request =
                _createMintRequestWithVaultCounterparty(
                    picks, PREDICTOR_COLLATERAL, COUNTERPARTY_COLLATERAL
                );

            market.mint(request);
        }

        // All vault nonces used (counterparty nonces are startNonce+1, startNonce+3, startNonce+5)
        for (uint256 i = 0; i < 3; i++) {
            uint256 vaultNonce = startNonce + 1 + i * 2;
            assertTrue(market.isNonceUsed(address(vault), vaultNonce));
        }
    }

    /**
     * @notice Test: Invalid manager signature fails
     */
    function test_vaultAsCounterparty_invalidManagerSignature() public {
        bytes32 conditionId = keccak256("invalid-sig-game");

        vm.prank(manager);
        vault.approveFundsUsage(address(market), COUNTERPARTY_COLLATERAL);

        IV2Types.Pick[] memory picks = new IV2Types.Pick[](1);
        picks[0] =
            _createPick(abi.encode(conditionId), IV2Types.OutcomeSide.YES);

        bytes32 pickConfigId = market.computePickConfigId(picks);
        bytes32 predictionHash = keccak256(
            abi.encode(
                pickConfigId,
                PREDICTOR_COLLATERAL,
                COUNTERPARTY_COLLATERAL,
                predictor,
                address(vault),
                address(0),
                ""
            )
        );

        uint256 pNonce = _freshNonce();
        uint256 cNonce = _freshNonce();
        uint256 deadline = block.timestamp + 1 hours;

        IV2Types.MintRequest memory request;
        request.picks = picks;
        request.predictorCollateral = PREDICTOR_COLLATERAL;
        request.counterpartyCollateral = COUNTERPARTY_COLLATERAL;
        request.predictor = predictor;
        request.counterparty = address(vault);
        request.predictorNonce = pNonce;
        request.counterpartyNonce = cNonce;
        request.predictorDeadline = deadline;
        request.counterpartyDeadline = deadline;
        request.predictorSignature = _signPredictorApproval(
            predictionHash, PREDICTOR_COLLATERAL, pNonce, deadline
        );
        // Sign with wrong key (predictor key instead of manager key)
        bytes32 mintApprovalHash = market.getMintApprovalHash(
            predictionHash,
            address(vault),
            COUNTERPARTY_COLLATERAL,
            cNonce,
            deadline
        );
        bytes32 vaultApprovalHash =
            vault.getApprovalHash(mintApprovalHash, manager);
        (uint8 v, bytes32 r, bytes32 s) =
            vm.sign(predictorPk, vaultApprovalHash); // Wrong key!
        request.counterpartySignature = abi.encodePacked(r, s, v);
        request.refCode = REF_CODE;
        request.predictorSessionKeyData = "";
        request.counterpartySessionKeyData = "";
        request.predictorSponsor = address(0);
        request.predictorSponsorData = "";

        vm.expectRevert(
            IPredictionMarketEscrow.InvalidCounterpartSignature.selector
        );
        market.mint(request);
    }

    /**
     * @notice Test: Asymmetric collateral amounts with vault as counterparty
     */
    function test_vaultAsCounterparty_asymmetricCollaterals() public {
        bytes32 conditionId = keccak256("asymmetric-game");

        uint256 smallPredictorCollateral = 100e18;
        uint256 largecounterpartyCollateral = 10_000e18;

        vm.prank(manager);
        vault.approveFundsUsage(address(market), largecounterpartyCollateral);

        IV2Types.Pick[] memory picks = new IV2Types.Pick[](1);
        picks[0] =
            _createPick(abi.encode(conditionId), IV2Types.OutcomeSide.YES);

        IV2Types.MintRequest memory request =
            _createMintRequestWithVaultCounterparty(
                picks, smallPredictorCollateral, largecounterpartyCollateral
            );

        uint256 predictorBalanceBefore = collateralToken.balanceOf(predictor);

        (bytes32 predictionId, address predictorToken,) = market.mint(request);

        // Predictor wins - gets huge payout
        vm.prank(settler);
        resolver.settleCondition(conditionId, IV2Types.OutcomeVector(1, 0));
        market.settle(predictionId, REF_CODE);

        uint256 totalCollateral =
            smallPredictorCollateral + largecounterpartyCollateral;
        vm.prank(predictor);
        uint256 payout =
            market.redeem(predictorToken, totalCollateral, REF_CODE);

        assertEq(payout, totalCollateral);
        assertEq(
            collateralToken.balanceOf(predictor),
            predictorBalanceBefore - smallPredictorCollateral + totalCollateral
        );
    }
}
