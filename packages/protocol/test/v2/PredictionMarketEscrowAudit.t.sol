// SPDX-License-Identifier: MIT
pragma solidity ^0.8.19;

import "forge-std/Test.sol";
import "forge-std/console.sol";
import "../../src/v2/PredictionMarketEscrow.sol";
import "../../src/v2/interfaces/IV2Types.sol";
import "../../src/v2/interfaces/IPredictionMarketEscrow.sol";
import "./mocks/MockConditionResolver.sol";
import "./mocks/MockERC20.sol";

/**
 * @title PredictionMarketEscrowAudit
 * @notice Audit tests for C-1 (proportional minting) and C-2 (post-resolution mint block)
 *
 * C-1: Self-dealing dilution attack
 *   UNFIXED: Tokens minted = individual wager (1:1 to wager). An attacker placing
 *            a massive YES bet with 1 wei NO dilutes existing YES holders' share of the pool.
 *   FIXED:   Tokens minted = totalCollateral (predictorWager + counterpartyWager) for EACH side.
 *            Every token represents a proportional claim on the full collateral, preventing dilution.
 *
 * C-2: Post-resolution minting
 *   UNFIXED: After resolution, new mints can still be placed on the same pickConfig,
 *            allowing free extraction of resolved funds.
 *   FIXED:   `mint()` reverts with `PickConfigAlreadyResolved()` if the pickConfig is already resolved.
 */
contract PredictionMarketEscrowAudit is Test {
    PredictionMarketEscrow public escrow;
    MockERC20 public collateral;
    MockConditionResolver public resolver;

    // Test accounts (derived from private keys for signing)
    uint256 constant ALICE_PK = 0xA11CE;
    uint256 constant BOB_PK = 0xB0B;
    uint256 constant CHARLIE_PK = 0xC4A7;
    uint256 constant OWNER_PK = 0x0ACE;

    address alice;
    address bob;
    address charlie;
    address owner;

    bytes32 constant CONDITION_ID = keccak256("TEST_CONDITION_1");
    bytes32 constant REF_CODE = bytes32(0);

    function setUp() public {
        alice = vm.addr(ALICE_PK);
        bob = vm.addr(BOB_PK);
        charlie = vm.addr(CHARLIE_PK);
        owner = vm.addr(OWNER_PK);

        vm.startPrank(owner);
        collateral = new MockERC20("USD Collateral", "USDC", 6);
        escrow = new PredictionMarketEscrow(address(collateral), owner);
        vm.stopPrank();

        resolver = new MockConditionResolver();
        // Set up a valid, unresolved condition
        resolver.setCondition(CONDITION_ID, true, false, 0, 0, false);

        // Fund accounts generously
        collateral.mint(alice, 1_000_000e6);
        collateral.mint(bob, 1_000_000e6);
        collateral.mint(charlie, 1_000_000e6);

        // Approve escrow for all
        vm.prank(alice);
        collateral.approve(address(escrow), type(uint256).max);
        vm.prank(bob);
        collateral.approve(address(escrow), type(uint256).max);
        vm.prank(charlie);
        collateral.approve(address(escrow), type(uint256).max);
    }

    // ============ Helpers ============

    function _buildPicks() internal view returns (IV2Types.Pick[] memory) {
        IV2Types.Pick[] memory picks = new IV2Types.Pick[](1);
        picks[0] = IV2Types.Pick({
            conditionResolver: address(resolver),
            conditionId: CONDITION_ID,
            predictedOutcome: IV2Types.OutcomeSide.YES
        });
        return picks;
    }

    /// @dev Build a mint request with valid EIP-712 signatures from both parties
    function _buildMintRequest(
        address predictor,
        uint256 predictorPk,
        uint256 predictorWager,
        address counterparty,
        uint256 counterpartyPk,
        uint256 counterpartyWager
    ) internal view returns (IV2Types.MintRequest memory) {
        IV2Types.Pick[] memory picks = _buildPicks();

        // Compute pickConfigId the same way the contract does
        bytes32 pickConfigId = keccak256(abi.encode(picks));

        // Compute predictionHash
        bytes32 predictionHash = keccak256(
            abi.encode(pickConfigId, predictorWager, counterpartyWager, predictor, counterparty)
        );

        uint256 predictorNonce = escrow.getNonce(predictor);
        uint256 counterpartyNonce = escrow.getNonce(counterparty);
        uint256 deadline = block.timestamp + 1 hours;

        // Sign for predictor
        bytes32 predictorDigest = escrow.getMintApprovalHash(
            predictionHash, predictor, predictorWager, predictorNonce, deadline
        );
        (uint8 pv, bytes32 pr, bytes32 ps) = vm.sign(predictorPk, predictorDigest);
        bytes memory predictorSig = abi.encodePacked(pr, ps, pv);

        // Sign for counterparty
        bytes32 counterpartyDigest = escrow.getMintApprovalHash(
            predictionHash, counterparty, counterpartyWager, counterpartyNonce, deadline
        );
        (uint8 cv, bytes32 cr, bytes32 cs) = vm.sign(counterpartyPk, counterpartyDigest);
        bytes memory counterpartySig = abi.encodePacked(cr, cs, cv);

        return IV2Types.MintRequest({
            picks: picks,
            predictorWager: predictorWager,
            counterpartyWager: counterpartyWager,
            predictor: predictor,
            counterparty: counterparty,
            predictorNonce: predictorNonce,
            counterpartyNonce: counterpartyNonce,
            predictorDeadline: deadline,
            counterpartyDeadline: deadline,
            predictorSignature: predictorSig,
            counterpartySignature: counterpartySig,
            refCode: REF_CODE,
            predictorSessionKeyData: "",
            counterpartySessionKeyData: ""
        });
    }

    /// @dev Helper to mint and return predictionId + token addresses
    function _mint(
        address predictor,
        uint256 predictorPk,
        uint256 predictorWager,
        address counterparty,
        uint256 counterpartyPk,
        uint256 counterpartyWager
    ) internal returns (bytes32 predictionId, address predictorToken, address counterpartyToken) {
        IV2Types.MintRequest memory req = _buildMintRequest(
            predictor, predictorPk, predictorWager,
            counterparty, counterpartyPk, counterpartyWager
        );
        return escrow.mint(req);
    }

    /// @dev Resolve the condition as YES wins (predictor wins)
    function _resolveYesWins() internal {
        resolver.setCondition(CONDITION_ID, true, true, 1, 0, true);
    }

    /// @dev Resolve the condition as NO wins (counterparty wins)  
    function _resolveNoWins() internal {
        resolver.setCondition(CONDITION_ID, true, true, 0, 1, true);
    }

    // ============ C-1 Tests ============

    /**
     * @notice C-1: Self-dealing dilution attack
     *
     * Scenario:
     *   1. Alice bets 100 USDC (YES) vs Bob 50 USDC (NO) — pool = 150
     *   2. Charlie self-deals: 10000 YES vs 1 wei NO
     *   3. YES wins
     *   4. Alice should get back >= 150 (her fair share of Alice+Bob pool)
     *
     * UNFIXED CODE BEHAVIOR:
     *   Alice gets minted 100 tokens, Charlie gets 10000 tokens.
     *   Total YES tokens = 10100. Alice's share = 100/10100 * 10150.000001 ≈ 100.49
     *   Alice LOSES ~50 USDC to dilution. Charlie extracts it.
     *
     * FIXED CODE BEHAVIOR (proportional minting):
     *   Bet 1: Alice gets 150 tokens, Bob gets 150 tokens (total collateral = 150)
     *   Bet 2: Charlie gets 10000.000001 tokens on each side (total collateral = 10000.000001)
     *   Total YES tokens = 10150.000001. Total pool = 10150.000001.
     *   Alice's share = 150/10150.000001 * 10150.000001 = 150. Fair!
     */
    function test_C1_selfDealingDilutionAttack() public {
        // Step 1: Alice bets 100e6 YES vs Bob 50e6 NO
        (bytes32 pred1, address predToken, address ctrToken) = _mint(
            alice, ALICE_PK, 100e6,
            bob, BOB_PK, 50e6
        );

        // Step 2: Charlie self-deals 10000e6 YES vs 1 NO (1 wei)
        (bytes32 pred2,,) = _mint(
            charlie, CHARLIE_PK, 10000e6,
            charlie, CHARLIE_PK, 1
        );

        // Step 3: YES wins
        _resolveYesWins();

        // Settle both predictions
        escrow.settle(pred1, REF_CODE);
        escrow.settle(pred2, REF_CODE);

        // Step 4: Alice redeems
        uint256 aliceTokenBalance = IERC20(predToken).balanceOf(alice);
        uint256 aliceBalanceBefore = collateral.balanceOf(alice);

        vm.prank(alice);
        uint256 alicePayout = escrow.redeem(predToken, aliceTokenBalance, REF_CODE);

        uint256 aliceBalanceAfter = collateral.balanceOf(alice);

        console.log("Alice payout:", alicePayout);
        console.log("Alice wager was 100e6, expected payout >= 150e6 (her pool)");

        // FIXED: Alice should get at least 150e6 (her 100 + Bob's 50)
        // The exact amount depends on proportional minting math.
        // With proportional minting: each token represents equal claim on collateral.
        // Alice's 150 tokens / total predictor tokens * total pool = fair share
        assertGe(alicePayout, 150e6 - 1, "C-1 VULN: Alice was diluted by Charlie's self-deal");
    }

    /**
     * @notice C-1: Verify proportional token minting amounts
     *
     * FIXED: Each side gets minted tokens = predictorWager + counterpartyWager (totalCollateral).
     * Both predictor and counterparty receive the same number of tokens per bet.
     */
    function test_C1_proportionalMintingTokenAmounts() public {
        uint256 predictorWager = 100e6;
        uint256 counterpartyWager = 50e6;
        uint256 expectedTokensEachSide = predictorWager + counterpartyWager; // 150e6

        (, address predToken, address ctrToken) = _mint(
            alice, ALICE_PK, predictorWager,
            bob, BOB_PK, counterpartyWager
        );

        uint256 alicePredTokens = IERC20(predToken).balanceOf(alice);
        uint256 bobCtrTokens = IERC20(ctrToken).balanceOf(bob);

        console.log("Alice predictor tokens:", alicePredTokens);
        console.log("Bob counterparty tokens:", bobCtrTokens);
        console.log("Expected (totalCollateral):", expectedTokensEachSide);

        // FIXED: Both sides get totalCollateral tokens
        // UNFIXED: Alice would get 100e6, Bob would get 50e6
        assertEq(
            alicePredTokens,
            expectedTokensEachSide,
            "C-1: Predictor should receive totalCollateral tokens"
        );
        assertEq(
            bobCtrTokens,
            expectedTokensEachSide,
            "C-1: Counterparty should receive totalCollateral tokens"
        );
    }

    // ============ C-2 Tests ============

    /**
     * @notice C-2: Minting after resolution should revert
     *
     * FIXED: `mint()` reverts with `PickConfigAlreadyResolved()` when the pickConfig is resolved.
     * UNFIXED: The mint would succeed, allowing the attacker to add collateral to a resolved pool.
     */
    function test_C2_mintAfterResolutionReverts() public {
        // Place initial bet
        (bytes32 pred1,,) = _mint(
            alice, ALICE_PK, 100e6,
            bob, BOB_PK, 50e6
        );

        // Resolve: YES wins
        _resolveYesWins();
        escrow.settle(pred1, REF_CODE);

        // C-2 FIX: Attempt to mint on the same pickConfig should revert
        // On UNFIXED code, this would succeed (no revert).
        vm.expectRevert(IPredictionMarketEscrow.PickConfigAlreadyResolved.selector);
        _mint(charlie, CHARLIE_PK, 100e6, charlie, CHARLIE_PK, 100e6);
    }

    /**
     * @notice C-2: Post-resolution minting attack scenario
     *
     * Attack: Attacker mints on a resolved pool where they know the outcome,
     *         effectively getting a guaranteed winning position.
     *
     * FIXED: Reverts on the second mint.
     * UNFIXED: Attacker places bet knowing YES won, extracts counterparty's collateral.
     */
    function test_C2_mintAfterResolutionAttack() public {
        // Step 1: Legitimate bet
        (bytes32 pred1, address predToken,) = _mint(
            alice, ALICE_PK, 100e6,
            bob, BOB_PK, 100e6
        );

        // Step 2: Resolve YES wins
        _resolveYesWins();
        escrow.settle(pred1, REF_CODE);

        // Step 3: Attacker tries to mint knowing YES already won
        // ATTACK: On fixed code, this should revert
        vm.expectRevert(IPredictionMarketEscrow.PickConfigAlreadyResolved.selector);
        _mint(charlie, CHARLIE_PK, 1e6, charlie, CHARLIE_PK, 1000e6);
        // If unfixed, Charlie would mint 1e6 YES / 1000e6 NO, then redeem YES for 1001e6 total
    }
}
