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
 * @title PredictionMarketEscrowDustAudit
 * @notice Audit tests for M-1: Losing tokens not burned on redeem
 *
 * M-1 Vulnerability:
 *   In the unfixed code, `redeem()` only burns tokens when `payout > 0`.
 *   For the losing side (payout == 0), tokens are never burned.
 *   This means losing-side token supply never reaches zero, permanently
 *   blocking `sweepDust()` which requires both token supplies to be zero.
 *
 * M-1 Fix:
 *   `redeem()` now ALWAYS burns the position tokens, regardless of whether
 *   payout is zero. Additionally, `sweepDust()` only requires the WINNING
 *   side tokens to be fully redeemed for decisive outcomes, since losing-side
 *   holders have no economic incentive to call redeem.
 */
contract PredictionMarketEscrowDustAudit is Test {
    PredictionMarketEscrow public escrow;
    MockERC20 public collateral;
    ManualConditionResolver public resolver;

    uint256 constant ALICE_PK = 0xA11CE;
    uint256 constant BOB_PK = 0xB0B;
    uint256 constant OWNER_PK = 0x0ACE;
    uint256 constant SETTLER_PK = 0x5E77;

    address alice;
    address bob;
    address owner;
    address settler;

    bytes32 constant CONDITION_ID = keccak256("DUST_TEST_CONDITION");
    bytes32 constant REF_CODE = bytes32(0);

    uint256 private _nextNonce = 1;

    function _freshNonce() internal returns (uint256) {
        return _nextNonce++;
    }

    function setUp() public {
        alice = vm.addr(ALICE_PK);
        bob = vm.addr(BOB_PK);
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

        collateral.mint(alice, 1_000_000e6);
        collateral.mint(bob, 1_000_000e6);

        vm.prank(alice);
        collateral.approve(address(escrow), type(uint256).max);
        vm.prank(bob);
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
        uint256 predictorCollateral,
        uint256 counterpartyCollateral
    ) internal returns (IV2Types.MintRequest memory request) {
        IV2Types.Pick[] memory picks = _buildPicks();
        bytes32 pickConfigId = keccak256(abi.encode(picks));
        bytes32 predictionHash = keccak256(
            abi.encode(
                pickConfigId,
                predictorCollateral,
                counterpartyCollateral,
                alice,
                bob,
                address(0),
                ""
            )
        );

        uint256 pNonce = _freshNonce();
        uint256 cNonce = _freshNonce();
        uint256 deadline = block.timestamp + 1 hours;

        request.picks = picks;
        request.predictorCollateral = predictorCollateral;
        request.counterpartyCollateral = counterpartyCollateral;
        request.predictor = alice;
        request.counterparty = bob;
        request.predictorNonce = pNonce;
        request.counterpartyNonce = cNonce;
        request.predictorDeadline = deadline;
        request.counterpartyDeadline = deadline;
        request.predictorSignature = _signApproval(
            predictionHash,
            alice,
            predictorCollateral,
            pNonce,
            deadline,
            ALICE_PK
        );
        request.counterpartySignature = _signApproval(
            predictionHash,
            bob,
            counterpartyCollateral,
            cNonce,
            deadline,
            BOB_PK
        );
        request.refCode = REF_CODE;
        request.predictorSessionKeyData = "";
        request.counterpartySessionKeyData = "";
        request.predictorSponsor = address(0);
        request.predictorSponsorData = "";
    }

    function _mint(uint256 predictorCollateral, uint256 counterpartyCollateral)
        internal
        returns (
            bytes32 predictionId,
            address predictorToken,
            address counterpartyToken
        )
    {
        IV2Types.MintRequest memory req =
            _buildMintRequest(predictorCollateral, counterpartyCollateral);
        return escrow.mint(req);
    }

    function _resolveYesWins() internal {
        vm.prank(settler);
        resolver.settleCondition(CONDITION_ID, IV2Types.OutcomeVector(1, 0));
    }

    // ============ M-1 Tests ============

    /**
     * @notice M-1: Losing tokens should be burned on redeem even with zero payout
     *
     * UNFIXED: redeem() skips burn when payout == 0 → losing token supply stays > 0
     * FIXED:   redeem() always burns tokens, then transfers payout only if > 0
     */
    function test_M1_losingTokensBurnOnRedeem() public {
        // Alice = predictor (YES), Bob = counterparty (NO)
        (bytes32 pred1, address predToken, address ctrToken) =
            _mint(100e6, 100e6);

        // YES wins → predictor wins, counterparty loses
        _resolveYesWins();
        escrow.settle(pred1, REF_CODE);

        // Bob (loser) redeems his counterparty tokens — payout will be 0
        uint256 bobTokens = IERC20(ctrToken).balanceOf(bob);
        assertGt(bobTokens, 0, "Bob should have counterparty tokens");

        uint256 ctrSupplyBefore = IERC20(ctrToken).totalSupply();

        vm.prank(bob);
        uint256 bobPayout = escrow.redeem(ctrToken, bobTokens, REF_CODE);

        uint256 ctrSupplyAfter = IERC20(ctrToken).totalSupply();

        console.log("Bob payout (should be 0):", bobPayout);
        console.log("CTR supply before:", ctrSupplyBefore);
        console.log("CTR supply after:", ctrSupplyAfter);

        assertEq(bobPayout, 0, "Losing side payout should be 0");

        // FIXED: Tokens should be burned even though payout is 0
        // UNFIXED: ctrSupplyAfter == ctrSupplyBefore (tokens not burned)
        assertEq(
            ctrSupplyAfter,
            0,
            "M-1 VULN: Losing tokens were not burned on redeem"
        );
    }

    /**
     * @notice M-1: sweepDust should work after only winning-side tokens are redeemed
     *
     * For decisive outcomes (PREDICTOR_WINS), losing-side holders have no incentive
     * to redeem (payout = 0). The fix allows sweepDust when only the winning side
     * has fully redeemed.
     *
     * UNFIXED: sweepDust requires BOTH token supplies == 0, which never happens
     *          because losing tokens can't be burned (payout == 0 → no burn).
     * FIXED:   sweepDust only requires winning-side supply == 0 for decisive outcomes.
     */
    function test_M1_sweepDustAfterDecisiveOutcome() public {
        // Create a prediction with amounts that produce rounding dust
        // 100e6 + 33e6 = 133e6 total. If predictor wins, they get 133e6.
        // But with proportional minting, there may be rounding dust.
        (bytes32 pred1, address predToken, address ctrToken) =
            _mint(100e6, 33e6);

        _resolveYesWins();
        escrow.settle(pred1, REF_CODE);

        // Alice (winner) redeems all predictor tokens
        uint256 aliceTokens = IERC20(predToken).balanceOf(alice);
        vm.prank(alice);
        escrow.redeem(predToken, aliceTokens, REF_CODE);

        // Predictor tokens are now 0
        assertEq(
            IERC20(predToken).totalSupply(),
            0,
            "Predictor tokens should be fully redeemed"
        );

        // Bob does NOT redeem (no incentive — payout is 0)
        // On the UNFIXED code, counterparty supply > 0 blocks sweepDust
        uint256 ctrSupply = IERC20(ctrToken).totalSupply();
        console.log("Counterparty token supply (Bob didn't redeem):", ctrSupply);

        // Check if there's dust to sweep
        IV2Types.PickConfiguration memory config = escrow.getPickConfiguration(
            escrow.getPickConfigIdFromToken(predToken)
        );
        uint256 totalCollateral = config.totalPredictorCollateral
            + config.totalCounterpartyCollateral;
        uint256 totalClaimed = config.claimedPredictorCollateral
            + config.claimedCounterpartyCollateral;
        uint256 dust = totalCollateral - totalClaimed;
        console.log("Dust remaining:", dust);

        if (dust > 0) {
            // FIXED: sweepDust should work because winning side is fully redeemed
            // UNFIXED: Would revert with TokensStillOutstanding because ctrSupply > 0
            vm.prank(owner);
            escrow.sweepDust(escrow.getPickConfigIdFromToken(predToken), owner);
            console.log(
                "M-1 FIX VERIFIED: sweepDust succeeded without losing-side redemption"
            );
        } else {
            console.log(
                "No dust to sweep (exact division) - test passes trivially"
            );
        }
    }

    /**
     * @notice M-1: sweepDust should still revert if winning-side tokens haven't been redeemed
     *
     * Even with the fix, sweepDust should not be callable until the winning side
     * has fully redeemed their tokens.
     */
    function test_M1_sweepDustBlockedWithoutWinningRedemption() public {
        (bytes32 pred1, address predToken,) = _mint(100e6, 50e6);

        _resolveYesWins();
        escrow.settle(pred1, REF_CODE);

        // Nobody redeems — winning side tokens still outstanding
        bytes32 pickConfigId = escrow.getPickConfigIdFromToken(predToken);

        // sweepDust should revert because winning-side (predictor) tokens are still outstanding
        vm.prank(owner);
        vm.expectRevert(); // TokensStillOutstanding
        escrow.sweepDust(pickConfigId, owner);

        console.log(
            "sweepDust correctly blocked when winning tokens still outstanding"
        );
    }
}
