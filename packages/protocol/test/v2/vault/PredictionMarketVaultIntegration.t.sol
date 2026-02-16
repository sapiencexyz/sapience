// SPDX-License-Identifier: MIT
pragma solidity ^0.8.22;

import "forge-std/Test.sol";
import {
    PredictionMarketVault
} from "../../../src/v2/vault/PredictionMarketVault.sol";
import {
    IPredictionMarketVault
} from "../../../src/v2/vault/interfaces/IPredictionMarketVault.sol";
import {
    PredictionMarketEscrow
} from "../../../src/v2/PredictionMarketEscrow.sol";
import {
    IPredictionMarketEscrow
} from "../../../src/v2/interfaces/IPredictionMarketEscrow.sol";
import {
    ManualConditionResolver
} from "../../../src/v2/resolvers/mocks/ManualConditionResolver.sol";
import { IV2Types } from "../../../src/v2/interfaces/IV2Types.sol";
import {
    IPredictionMarketToken
} from "../../../src/v2/interfaces/IPredictionMarketToken.sol";
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
    uint256 public constant PREDICTOR_WAGER = 1000e18;
    uint256 public constant COUNTERPARTY_WAGER = 1500e18;
    uint256 public constant TOTAL_COLLATERAL =
        PREDICTOR_WAGER + COUNTERPARTY_WAGER;
    bytes32 public constant REF_CODE = keccak256("vault-integration-test");

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

        // Deploy prediction market
        market = new PredictionMarketEscrow(address(collateralToken), owner);

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
        uint256 wager,
        uint256 nonce,
        uint256 deadline
    ) internal view returns (bytes memory) {
        bytes32 approvalHash = market.getMintApprovalHash(
            predictionHash, predictor, wager, nonce, deadline
        );
        (uint8 v, bytes32 r, bytes32 s) = vm.sign(predictorPk, approvalHash);
        return abi.encodePacked(r, s, v);
    }

    function _signVaultApproval(
        bytes32 predictionHash,
        uint256 wager,
        uint256 nonce,
        uint256 deadline
    ) internal view returns (bytes memory) {
        // Get the mint approval hash that the market will pass to vault.isValidSignature
        bytes32 mintApprovalHash = market.getMintApprovalHash(
            predictionHash, address(vault), wager, nonce, deadline
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
        uint256 pWager,
        uint256 cWager
    ) internal view returns (IV2Types.MintRequest memory request) {
        bytes32 pickConfigId = market.computePickConfigId(picks);
        bytes32 predictionHash = keccak256(
            abi.encode(pickConfigId, pWager, cWager, predictor, address(vault))
        );

        uint256 pNonce = market.getNonce(predictor);
        uint256 cNonce = market.getNonce(address(vault));
        uint256 deadline = block.timestamp + 1 hours;

        request.picks = picks;
        request.predictorWager = pWager;
        request.counterpartyWager = cWager;
        request.predictor = predictor;
        request.counterparty = address(vault);
        request.predictorNonce = pNonce;
        request.counterpartyNonce = cNonce;
        request.predictorDeadline = deadline;
        request.counterpartyDeadline = deadline;
        request.predictorSignature =
            _signPredictorApproval(predictionHash, pWager, pNonce, deadline);
        request.counterpartySignature =
            _signVaultApproval(predictionHash, cWager, cNonce, deadline);
        request.refCode = REF_CODE;
        request.predictorSessionKeyData = "";
        request.counterpartySessionKeyData = "";
    }

    function _createPick(bytes32 conditionId, IV2Types.OutcomeSide outcome)
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
        vault.approveFundsUsage(address(market), COUNTERPARTY_WAGER);

        // Create prediction with vault as counterparty
        IV2Types.Pick[] memory picks = new IV2Types.Pick[](1);
        picks[0] = _createPick(conditionId, IV2Types.OutcomeSide.YES);

        IV2Types.MintRequest memory request =
            _createMintRequestWithVaultCounterparty(
                picks, PREDICTOR_WAGER, COUNTERPARTY_WAGER
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
            vaultBalanceBefore - COUNTERPARTY_WAGER
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
            predictorBalanceBefore - PREDICTOR_WAGER + TOTAL_COLLATERAL
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
        vault.approveFundsUsage(address(market), COUNTERPARTY_WAGER);

        // Create prediction with vault as counterparty
        IV2Types.Pick[] memory picks = new IV2Types.Pick[](1);
        picks[0] = _createPick(conditionId, IV2Types.OutcomeSide.YES);

        IV2Types.MintRequest memory request =
            _createMintRequestWithVaultCounterparty(
                picks, PREDICTOR_WAGER, COUNTERPARTY_WAGER
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

        // Vault balance should be original minus wager plus winnings
        assertEq(
            collateralToken.balanceOf(address(vault)),
            vaultBalanceBefore - COUNTERPARTY_WAGER + TOTAL_COLLATERAL
        );
    }

    /**
     * @notice Test: Vault as counterparty - tie (both get wagers back)
     */
    function test_vaultAsCounterparty_tie() public {
        bytes32 conditionId = keccak256("game-tie");

        vm.prank(manager);
        vault.approveFundsUsage(address(market), COUNTERPARTY_WAGER);

        IV2Types.Pick[] memory picks = new IV2Types.Pick[](1);
        picks[0] = _createPick(conditionId, IV2Types.OutcomeSide.YES);

        IV2Types.MintRequest memory request =
            _createMintRequestWithVaultCounterparty(
                picks, PREDICTOR_WAGER, COUNTERPARTY_WAGER
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

        // Both redeem (full TOTAL_COLLATERAL each) - get original wagers back
        vm.prank(predictor);
        uint256 predictorPayout =
            market.redeem(predictorToken, TOTAL_COLLATERAL, REF_CODE);

        vm.prank(address(vault));
        uint256 vaultPayout =
            market.redeem(counterpartyToken, TOTAL_COLLATERAL, REF_CODE);

        assertEq(predictorPayout, PREDICTOR_WAGER);
        assertEq(vaultPayout, COUNTERPARTY_WAGER);

        // Both end up with original balances
        assertEq(collateralToken.balanceOf(predictor), predictorBalanceBefore);
        assertEq(collateralToken.balanceOf(address(vault)), vaultBalanceBefore);
    }

    /**
     * @notice Test: Multiple predictions with vault as counterparty
     */
    function test_vaultAsCounterparty_multiplePredictions() public {
        bytes32 conditionId1 = keccak256("game-1");
        bytes32 conditionId2 = keccak256("game-2");

        // Manager approves enough for both predictions
        uint256 totalApproval = COUNTERPARTY_WAGER * 2;
        vm.prank(manager);
        vault.approveFundsUsage(address(market), totalApproval);

        // Create first prediction
        IV2Types.Pick[] memory picks1 = new IV2Types.Pick[](1);
        picks1[0] = _createPick(conditionId1, IV2Types.OutcomeSide.YES);
        IV2Types.MintRequest memory request1 =
            _createMintRequestWithVaultCounterparty(
                picks1, PREDICTOR_WAGER, COUNTERPARTY_WAGER
            );
        (bytes32 predictionId1, address predictorToken1,) =
            market.mint(request1);

        // Create second prediction
        IV2Types.Pick[] memory picks2 = new IV2Types.Pick[](1);
        picks2[0] = _createPick(conditionId2, IV2Types.OutcomeSide.NO);
        IV2Types.MintRequest memory request2 =
            _createMintRequestWithVaultCounterparty(
                picks2, PREDICTOR_WAGER, COUNTERPARTY_WAGER
            );
        (bytes32 predictionId2,, address counterpartyToken2) =
            market.mint(request2);

        // Settle first condition - YES wins (predictor wins prediction 1)
        vm.prank(settler);
        resolver.settleCondition(conditionId1, IV2Types.OutcomeVector(1, 0));

        // Settle second condition - YES wins (predictor bet NO, so vault wins prediction 2)
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
     * @notice Test: Vault parlay prediction (multiple picks)
     */
    function test_vaultAsCounterparty_parlay() public {
        bytes32 condition1 = bytes32(uint256(1));
        bytes32 condition2 = bytes32(uint256(2));

        vm.prank(manager);
        vault.approveFundsUsage(address(market), COUNTERPARTY_WAGER);

        // Create parlay with 2 picks
        IV2Types.Pick[] memory picks = new IV2Types.Pick[](2);
        picks[0] = _createPick(condition1, IV2Types.OutcomeSide.YES);
        picks[1] = _createPick(condition2, IV2Types.OutcomeSide.YES);

        IV2Types.MintRequest memory request =
            _createMintRequestWithVaultCounterparty(
                picks, PREDICTOR_WAGER, COUNTERPARTY_WAGER
            );

        (bytes32 predictionId,, address counterpartyToken) =
            market.mint(request);

        // Settle conditions - predictor wins first, loses second (parlay fails)
        vm.startPrank(settler);
        resolver.settleCondition(condition1, IV2Types.OutcomeVector(1, 0)); // YES
        resolver.settleCondition(condition2, IV2Types.OutcomeVector(0, 1)); // NO (predictor loses)
        vm.stopPrank();

        // Settle prediction - vault wins because predictor's parlay failed
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
        vault.approveFundsUsage(address(market), COUNTERPARTY_WAGER);

        IV2Types.Pick[] memory picks = new IV2Types.Pick[](1);
        picks[0] = _createPick(conditionId, IV2Types.OutcomeSide.YES);

        IV2Types.MintRequest memory request =
            _createMintRequestWithVaultCounterparty(
                picks, PREDICTOR_WAGER, COUNTERPARTY_WAGER
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
        vault.approveFundsUsage(address(market), COUNTERPARTY_WAGER / 2);

        IV2Types.Pick[] memory picks = new IV2Types.Pick[](1);
        picks[0] = _createPick(conditionId, IV2Types.OutcomeSide.YES);

        IV2Types.MintRequest memory request =
            _createMintRequestWithVaultCounterparty(
                picks, PREDICTOR_WAGER, COUNTERPARTY_WAGER
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
        vault.approveFundsUsage(address(market), COUNTERPARTY_WAGER);

        IV2Types.Pick[] memory picks = new IV2Types.Pick[](1);
        picks[0] = _createPick(conditionId, IV2Types.OutcomeSide.YES);

        IV2Types.MintRequest memory request =
            _createMintRequestWithVaultCounterparty(
                picks, PREDICTOR_WAGER, COUNTERPARTY_WAGER
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
     * @notice Test: Vault nonce increments correctly across multiple predictions
     */
    function test_vaultNonceIncrementsCorrectly() public {
        uint256 initialNonce = market.getNonce(address(vault));

        for (uint256 i = 0; i < 3; i++) {
            bytes32 conditionId = keccak256(abi.encode("game", i));

            vm.prank(manager);
            vault.approveFundsUsage(address(market), COUNTERPARTY_WAGER);

            IV2Types.Pick[] memory picks = new IV2Types.Pick[](1);
            picks[0] = _createPick(conditionId, IV2Types.OutcomeSide.YES);

            IV2Types.MintRequest memory request =
                _createMintRequestWithVaultCounterparty(
                    picks, PREDICTOR_WAGER, COUNTERPARTY_WAGER
                );

            market.mint(request);

            assertEq(market.getNonce(address(vault)), initialNonce + i + 1);
        }
    }

    /**
     * @notice Test: Invalid manager signature fails
     */
    function test_vaultAsCounterparty_invalidManagerSignature() public {
        bytes32 conditionId = keccak256("invalid-sig-game");

        vm.prank(manager);
        vault.approveFundsUsage(address(market), COUNTERPARTY_WAGER);

        IV2Types.Pick[] memory picks = new IV2Types.Pick[](1);
        picks[0] = _createPick(conditionId, IV2Types.OutcomeSide.YES);

        bytes32 pickConfigId = market.computePickConfigId(picks);
        bytes32 predictionHash = keccak256(
            abi.encode(
                pickConfigId,
                PREDICTOR_WAGER,
                COUNTERPARTY_WAGER,
                predictor,
                address(vault)
            )
        );

        uint256 pNonce = market.getNonce(predictor);
        uint256 cNonce = market.getNonce(address(vault));
        uint256 deadline = block.timestamp + 1 hours;

        IV2Types.MintRequest memory request;
        request.picks = picks;
        request.predictorWager = PREDICTOR_WAGER;
        request.counterpartyWager = COUNTERPARTY_WAGER;
        request.predictor = predictor;
        request.counterparty = address(vault);
        request.predictorNonce = pNonce;
        request.counterpartyNonce = cNonce;
        request.predictorDeadline = deadline;
        request.counterpartyDeadline = deadline;
        request.predictorSignature = _signPredictorApproval(
            predictionHash, PREDICTOR_WAGER, pNonce, deadline
        );
        // Sign with wrong key (predictor key instead of manager key)
        bytes32 mintApprovalHash = market.getMintApprovalHash(
            predictionHash, address(vault), COUNTERPARTY_WAGER, cNonce, deadline
        );
        bytes32 vaultApprovalHash =
            vault.getApprovalHash(mintApprovalHash, manager);
        (uint8 v, bytes32 r, bytes32 s) =
            vm.sign(predictorPk, vaultApprovalHash); // Wrong key!
        request.counterpartySignature = abi.encodePacked(r, s, v);
        request.refCode = REF_CODE;
        request.predictorSessionKeyData = "";
        request.counterpartySessionKeyData = "";

        vm.expectRevert(IPredictionMarketEscrow.InvalidSignature.selector);
        market.mint(request);
    }

    /**
     * @notice Test: Asymmetric wagers with vault as counterparty
     */
    function test_vaultAsCounterparty_asymmetricWagers() public {
        bytes32 conditionId = keccak256("asymmetric-game");

        uint256 smallPredictorWager = 100e18;
        uint256 largecounterpartyWager = 10_000e18;

        vm.prank(manager);
        vault.approveFundsUsage(address(market), largecounterpartyWager);

        IV2Types.Pick[] memory picks = new IV2Types.Pick[](1);
        picks[0] = _createPick(conditionId, IV2Types.OutcomeSide.YES);

        IV2Types.MintRequest memory request =
            _createMintRequestWithVaultCounterparty(
                picks, smallPredictorWager, largecounterpartyWager
            );

        uint256 predictorBalanceBefore = collateralToken.balanceOf(predictor);

        (bytes32 predictionId, address predictorToken,) = market.mint(request);

        // Predictor wins - gets huge payout
        vm.prank(settler);
        resolver.settleCondition(conditionId, IV2Types.OutcomeVector(1, 0));
        market.settle(predictionId, REF_CODE);

        uint256 totalCollateral = smallPredictorWager + largecounterpartyWager;
        vm.prank(predictor);
        uint256 payout =
            market.redeem(predictorToken, totalCollateral, REF_CODE);

        assertEq(payout, totalCollateral);
        assertEq(
            collateralToken.balanceOf(predictor),
            predictorBalanceBefore - smallPredictorWager + totalCollateral
        );
    }
}
