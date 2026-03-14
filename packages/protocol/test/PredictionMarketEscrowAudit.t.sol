// SPDX-License-Identifier: MIT
pragma solidity ^0.8.19;

import "forge-std/Test.sol";
import "forge-std/console.sol";
import "../src/PredictionMarketEscrow.sol";
import "../src/PredictionMarketTokenFactory.sol";
import "../src/interfaces/IV2Types.sol";
import "../src/interfaces/IPredictionMarketEscrow.sol";
import "../src/resolvers/mocks/ManualConditionResolver.sol";
import "./mocks/MockERC20.sol";

/**
 * @title PredictionMarketEscrowAudit
 * @notice Audit tests for C-1 (proportional minting) and C-2 (post-resolution mint block)
 *
 * C-1: Self-dealing dilution attack
 *   UNFIXED: Tokens minted 1:1 to each side's collateral. Late outsized predictions dilute existing holders.
 *   FIXED:   Tokens minted = totalCollateral for EACH side. Every token = uniform collateral claim.
 *
 * C-2: Post-resolution minting
 *   UNFIXED: mint() succeeds on resolved pickConfigs — riskless extraction via flash loans.
 *   FIXED:   mint() reverts with PickConfigAlreadyResolved().
 */
contract PredictionMarketEscrowAudit is Test {
    PredictionMarketEscrow public escrow;
    MockERC20 public collateral;
    ManualConditionResolver public resolver;

    uint256 constant ALICE_PK = 0xA11CE;
    uint256 constant BOB_PK = 0xB0B;
    uint256 constant CHARLIE_PK = 0xC4A7;
    uint256 constant OWNER_PK = 0x0ACE;
    uint256 constant SETTLER_PK = 0x5E77;

    address alice;
    address bob;
    address charlie;
    address owner;
    address settler;

    bytes32 constant CONDITION_ID = keccak256("TEST_CONDITION_1");
    bytes32 constant REF_CODE = bytes32(0);

    uint256 private _nextNonce = 1;

    function _freshNonce() internal returns (uint256) {
        return _nextNonce++;
    }

    function setUp() public {
        alice = vm.addr(ALICE_PK);
        bob = vm.addr(BOB_PK);
        charlie = vm.addr(CHARLIE_PK);
        owner = vm.addr(OWNER_PK);
        settler = vm.addr(SETTLER_PK);

        vm.startPrank(owner);
        collateral = new MockERC20("USD Collateral", "USDC", 6);
        PredictionMarketTokenFactory tokenFactory =
            new PredictionMarketTokenFactory(owner);
        escrow = new PredictionMarketEscrow(
            address(collateral), owner, address(tokenFactory)
        );
        tokenFactory.setDeployer(address(escrow));
        resolver = new ManualConditionResolver(owner);
        resolver.approveSettler(settler);
        vm.stopPrank();

        // Fund accounts
        collateral.mint(alice, 1_000_000e6);
        collateral.mint(bob, 1_000_000e6);
        collateral.mint(charlie, 1_000_000e6);

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
            conditionId: abi.encode(CONDITION_ID),
            predictedOutcome: IV2Types.OutcomeSide.YES
        });
        return picks;
    }

    function _signApproval(
        bytes32 predictionHash,
        address signer,
        uint256 collateralAmount,
        uint256 nonce,
        uint256 deadline,
        uint256 pk
    ) internal view returns (bytes memory) {
        bytes32 digest = escrow.getMintApprovalHash(
            predictionHash, signer, collateralAmount, nonce, deadline
        );
        (uint8 v, bytes32 r, bytes32 s) = vm.sign(pk, digest);
        return abi.encodePacked(r, s, v);
    }

    function _buildMintRequest(
        address predictor,
        uint256 predictorPk,
        uint256 predictorCollateral,
        address counterparty,
        uint256 counterpartyPk,
        uint256 counterpartyCollateral
    ) internal returns (IV2Types.MintRequest memory request) {
        request.picks = _buildPicks();
        request.predictorCollateral = predictorCollateral;
        request.counterpartyCollateral = counterpartyCollateral;
        request.predictor = predictor;
        request.counterparty = counterparty;
        request.predictorNonce = _freshNonce();
        request.counterpartyNonce = _freshNonce();
        request.predictorDeadline = block.timestamp + 1 hours;
        request.counterpartyDeadline = block.timestamp + 1 hours;
        request.refCode = REF_CODE;
        request.predictorSessionKeyData = "";
        request.counterpartySessionKeyData = "";
        request.predictorSponsor = address(0);
        request.predictorSponsorData = "";

        bytes32 pickConfigId = keccak256(abi.encode(request.picks));
        bytes32 predictionHash = keccak256(
            abi.encode(
                pickConfigId,
                predictorCollateral,
                counterpartyCollateral,
                predictor,
                counterparty,
                address(0),
                ""
            )
        );

        request.predictorSignature = _signApproval(
            predictionHash,
            predictor,
            predictorCollateral,
            request.predictorNonce,
            request.predictorDeadline,
            predictorPk
        );
        request.counterpartySignature = _signApproval(
            predictionHash,
            counterparty,
            counterpartyCollateral,
            request.counterpartyNonce,
            request.counterpartyDeadline,
            counterpartyPk
        );
    }

    function _mint(
        address predictor,
        uint256 predictorPk,
        uint256 predictorCollateral,
        address counterparty,
        uint256 counterpartyPk,
        uint256 counterpartyCollateral
    )
        internal
        returns (
            bytes32 predictionId,
            address predictorToken,
            address counterpartyToken
        )
    {
        IV2Types.MintRequest memory req =
            _buildMintRequest(
                predictor,
                predictorPk,
                predictorCollateral,
                counterparty,
                counterpartyPk,
                counterpartyCollateral
            );
        return escrow.mint(req);
    }

    function _resolveYesWins() internal {
        vm.prank(settler);
        resolver.settleCondition(CONDITION_ID, IV2Types.OutcomeVector(1, 0));
    }

    // ============ C-1 Tests ============

    /**
     * @notice C-1: Self-dealing dilution attack
     *
     * Scenario:
     *   1. Alice predicts 100 YES vs Bob 50 NO
     *   2. Charlie self-deals: 10000 YES vs 1 wei NO
     *   3. YES wins
     *   4. Alice should get >= 150 (her fair share)
     *
     * UNFIXED: Alice gets ~100.49 (diluted by Charlie's 10000 YES tokens)
     * FIXED:   Alice gets 150 (proportional minting prevents dilution)
     */
    function test_C1_selfDealingDilutionAttack() public {
        // Prediction 1: Alice 100 YES vs Bob 50 NO
        (bytes32 pred1, address predToken,) =
            _mint(alice, ALICE_PK, 100e6, bob, BOB_PK, 50e6);

        // Prediction 2: Charlie self-deals 10000 YES vs 1 wei NO
        (bytes32 pred2,,) =
            _mint(charlie, CHARLIE_PK, 10_000e6, charlie, CHARLIE_PK, 1);

        // YES wins
        _resolveYesWins();
        escrow.settle(pred1, REF_CODE);
        escrow.settle(pred2, REF_CODE);

        // Alice redeems
        uint256 aliceTokens = IERC20(predToken).balanceOf(alice);
        vm.prank(alice);
        uint256 alicePayout = escrow.redeem(predToken, aliceTokens, REF_CODE);

        console.log("Alice payout:", alicePayout);
        console.log("Alice collateral: 100e6, expected payout >= 150e6");

        // FIXED: Alice gets her fair share (100 + Bob's 50)
        assertGe(
            alicePayout,
            150e6 - 1,
            "C-1 VULN: Alice was diluted by Charlie's self-deal"
        );
    }

    /**
     * @notice C-1: Verify proportional token minting amounts
     * FIXED: Each side gets totalCollateral tokens per prediction
     */
    function test_C1_proportionalMintingTokenAmounts() public {
        uint256 predictorCollateral = 100e6;
        uint256 counterpartyCollateral = 50e6;
        uint256 expectedTokens = predictorCollateral + counterpartyCollateral; // 150e6

        (, address predToken, address ctrToken) = _mint(
            alice,
            ALICE_PK,
            predictorCollateral,
            bob,
            BOB_PK,
            counterpartyCollateral
        );

        uint256 aliceTokens = IERC20(predToken).balanceOf(alice);
        uint256 bobTokens = IERC20(ctrToken).balanceOf(bob);

        console.log("Alice predictor tokens:", aliceTokens);
        console.log("Bob counterparty tokens:", bobTokens);
        console.log("Expected (totalCollateral):", expectedTokens);

        // FIXED: Both sides get totalCollateral tokens
        // UNFIXED: Alice=100e6, Bob=50e6
        assertEq(
            aliceTokens,
            expectedTokens,
            "C-1: Predictor should receive totalCollateral tokens"
        );
        assertEq(
            bobTokens,
            expectedTokens,
            "C-1: Counterparty should receive totalCollateral tokens"
        );
    }

    // ============ C-2 Tests ============

    /**
     * @notice C-2: Minting after resolution should revert
     * FIXED: Reverts with PickConfigAlreadyResolved()
     * UNFIXED: Succeeds, allowing riskless extraction
     */
    function test_C2_mintAfterResolutionReverts() public {
        (bytes32 pred1,,) = _mint(alice, ALICE_PK, 100e6, bob, BOB_PK, 50e6);

        _resolveYesWins();
        escrow.settle(pred1, REF_CODE);

        // Build request before expectRevert (getMintApprovalHash is a staticcall)
        IV2Types.MintRequest memory req = _buildMintRequest(
            charlie, CHARLIE_PK, 100e6, charlie, CHARLIE_PK, 100e6
        );

        // Should revert on fixed code
        vm.expectRevert(
            IPredictionMarketEscrow.PickConfigAlreadyResolved.selector
        );
        escrow.mint(req);
    }

    /**
     * @notice C-2: Post-resolution extraction attack
     * Attacker mints knowing outcome, gets guaranteed winning position
     * FIXED: Reverts on the second mint
     */
    function test_C2_mintAfterResolutionAttack() public {
        (bytes32 pred1,,) = _mint(alice, ALICE_PK, 100e6, bob, BOB_PK, 100e6);

        _resolveYesWins();
        escrow.settle(pred1, REF_CODE);

        // Build request before expectRevert (getMintApprovalHash is a staticcall)
        IV2Types.MintRequest memory req = _buildMintRequest(
            charlie, CHARLIE_PK, 1e6, charlie, CHARLIE_PK, 1000e6
        );

        // Attacker tries to mint knowing YES won: 1e6 YES / 1000e6 NO
        vm.expectRevert(
            IPredictionMarketEscrow.PickConfigAlreadyResolved.selector
        );
        escrow.mint(req);
    }
}
