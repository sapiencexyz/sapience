// SPDX-License-Identifier: MIT
pragma solidity ^0.8.19;

import "forge-std/Test.sol";
import "../src/PredictionMarketEscrow.sol";
import "../src/PredictionMarketTokenFactory.sol";
import "../src/resolvers/mocks/ManualConditionResolver.sol";
import "../src/sponsors/OnboardingSponsor.sol";
import "../src/interfaces/IV2Types.sol";
import "../src/interfaces/IPredictionMarketEscrow.sol";
import "../src/interfaces/IPredictionMarketToken.sol";
import "./mocks/MockERC20.sol";

contract OnboardingSponsorTest is Test {
    PredictionMarketEscrow public market;
    ManualConditionResolver public resolver;
    OnboardingSponsor public sponsor;
    MockERC20 public collateralToken;

    address public owner;
    address public manager;
    address public predictor;
    address public counterparty;
    address public settler;
    address public eve;

    uint256 public predictorPk;
    uint256 public counterpartyPk;

    uint256 private _nextNonce = 1;

    uint256 public constant PREDICTOR_COLLATERAL = 1e18;
    uint256 public constant COUNTERPARTY_COLLATERAL = 1e18;
    uint256 public constant MATCH_LIMIT = 1e18;
    uint256 public constant BUDGET = 5e18;
    uint256 public constant MAX_ENTRY_PRICE_BPS = 7000; // 0.70
    bytes32 public constant REF_CODE = keccak256("invite-code");

    bytes32 public rawConditionId;
    bytes public conditionId;

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
        manager = vm.addr(5);
        eve = vm.addr(6);

        // Deploy core infra
        collateralToken = new MockERC20("WUSDe", "WUSDe", 18);
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

        rawConditionId = keccak256(abi.encode("will-eth-hit-10k"));
        conditionId = abi.encode(rawConditionId);

        // Deploy sponsor, pointing at real escrow with vault-bot as required counterparty
        sponsor = new OnboardingSponsor(
            address(market),
            address(collateralToken),
            counterparty, // required counterparty (vault-bot)
            MAX_ENTRY_PRICE_BPS, // 0.70 max entry price
            MATCH_LIMIT,
            owner
        );

        // Owner sets the API signer as budget manager
        vm.prank(owner);
        sponsor.setBudgetManager(manager);

        // Fund sponsor contract with collateral (anyone can do this)
        collateralToken.mint(address(sponsor), 100e18);

        // Fund counterparty (predictor doesn't need funds — sponsor pays)
        collateralToken.mint(counterparty, 100e18);
        vm.prank(counterparty);
        collateralToken.approve(address(market), type(uint256).max);

        // Predictor still needs approval for non-sponsored mints
        collateralToken.mint(predictor, 100e18);
        vm.prank(predictor);
        collateralToken.approve(address(market), type(uint256).max);
    }

    // ============ Helpers ============

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

    function _buildMintRequest(
        IV2Types.Pick[] memory picks,
        address sponsorAddr
    ) internal returns (IV2Types.MintRequest memory request) {
        bytes32 pickConfigId = keccak256(abi.encode(picks));
        bytes32 predictionHash = keccak256(
            abi.encode(
                pickConfigId,
                PREDICTOR_COLLATERAL,
                COUNTERPARTY_COLLATERAL,
                predictor,
                counterparty,
                sponsorAddr,
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
        request.predictorSponsor = sponsorAddr;
        request.predictorSponsorData = "";
    }

    // ============ Integration: Full onboarding flow ============

    function test_fullFlow_sponsoredMint_settle_redeem() public {
        // 1. API signer grants budget after invite code validation
        vm.prank(manager);
        sponsor.setBudget(predictor, BUDGET);
        assertEq(sponsor.remainingBudget(predictor), BUDGET);

        // 2. Sponsored mint — predictor pays nothing
        IV2Types.Pick[] memory picks = new IV2Types.Pick[](1);
        picks[0] = _createPick(conditionId, IV2Types.OutcomeSide.YES);

        uint256 predictorBalBefore = collateralToken.balanceOf(predictor);
        uint256 sponsorBalBefore = collateralToken.balanceOf(address(sponsor));

        IV2Types.MintRequest memory request =
            _buildMintRequest(picks, address(sponsor));
        (
            bytes32 predictionId,
            address predictorToken,
            address counterpartyToken
        ) = market.mint(request);

        // Predictor balance unchanged — sponsor paid
        assertEq(collateralToken.balanceOf(predictor), predictorBalBefore);
        assertEq(
            collateralToken.balanceOf(address(sponsor)),
            sponsorBalBefore - PREDICTOR_COLLATERAL
        );

        // Budget decremented
        assertEq(
            sponsor.remainingBudget(predictor), BUDGET - PREDICTOR_COLLATERAL
        );

        // Both sides got tokens
        uint256 totalCollateral = PREDICTOR_COLLATERAL + COUNTERPARTY_COLLATERAL;
        assertEq(
            IPredictionMarketToken(predictorToken).balanceOf(predictor),
            totalCollateral
        );
        assertEq(
            IPredictionMarketToken(counterpartyToken).balanceOf(counterparty),
            totalCollateral
        );

        // 3. Resolve condition — predictor wins
        vm.prank(settler);
        resolver.settleCondition(rawConditionId, IV2Types.OutcomeVector(1, 0));
        market.settle(predictionId, REF_CODE);

        // 4. Redeem — predictor gets all collateral
        vm.prank(predictor);
        IPredictionMarketToken(predictorToken)
            .approve(address(market), totalCollateral);

        vm.prank(predictor);
        market.redeem(predictorToken, totalCollateral, REF_CODE);

        // Predictor received all collateral (their sponsored 1e18 + counterparty's 1e18)
        assertEq(
            collateralToken.balanceOf(predictor),
            predictorBalBefore + totalCollateral,
            "Winner should receive all collateral"
        );
    }

    function test_fullFlow_sponsoredMint_predictorLoses() public {
        vm.prank(manager);
        sponsor.setBudget(predictor, BUDGET);

        IV2Types.Pick[] memory picks = new IV2Types.Pick[](1);
        picks[0] = _createPick(conditionId, IV2Types.OutcomeSide.YES);

        uint256 counterpartyBalBefore = collateralToken.balanceOf(counterparty);

        IV2Types.MintRequest memory request =
            _buildMintRequest(picks, address(sponsor));
        (
            bytes32 predictionId,
            address predictorToken,
            address counterpartyToken
        ) = market.mint(request);

        uint256 totalCollateral = PREDICTOR_COLLATERAL + COUNTERPARTY_COLLATERAL;

        // Resolve NO — counterparty wins
        vm.prank(settler);
        resolver.settleCondition(rawConditionId, IV2Types.OutcomeVector(0, 1));
        market.settle(predictionId, REF_CODE);

        // Counterparty redeems
        vm.prank(counterparty);
        IPredictionMarketToken(counterpartyToken)
            .approve(address(market), totalCollateral);

        vm.prank(counterparty);
        market.redeem(counterpartyToken, totalCollateral, REF_CODE);

        // Counterparty net gain = predictor's sponsored collateral
        assertEq(
            collateralToken.balanceOf(counterparty),
            counterpartyBalBefore - COUNTERPARTY_COLLATERAL + totalCollateral,
            "Counterparty should profit from sponsored collateral"
        );
    }

    function test_multipleSponsoredMints_drainsBudget() public {
        vm.prank(manager);
        sponsor.setBudget(predictor, 3e18); // 3 mints worth

        IV2Types.Pick[] memory picks = new IV2Types.Pick[](1);
        picks[0] = _createPick(conditionId, IV2Types.OutcomeSide.YES);

        // Mint 3 times
        for (uint256 i = 0; i < 3; i++) {
            IV2Types.MintRequest memory request =
                _buildMintRequest(picks, address(sponsor));
            market.mint(request);
        }

        assertEq(sponsor.remainingBudget(predictor), 0);

        // 4th mint should fail
        IV2Types.MintRequest memory request4 =
            _buildMintRequest(picks, address(sponsor));
        vm.expectRevert(OnboardingSponsor.BudgetExceeded.selector);
        market.mint(request4);
    }

    // ============ Integration: Match limit ============

    function test_revert_exceedsMatchLimit() public {
        // Set budget high but match limit is 1e18
        vm.prank(manager);
        sponsor.setBudget(predictor, 100e18);

        // Try to mint with 2e18 predictor collateral (> match limit)
        IV2Types.Pick[] memory picks = new IV2Types.Pick[](1);
        picks[0] = _createPick(conditionId, IV2Types.OutcomeSide.YES);

        bytes32 pickConfigId = keccak256(abi.encode(picks));
        uint256 bigCollateral = 2e18;
        bytes32 predictionHash = keccak256(
            abi.encode(
                pickConfigId,
                bigCollateral,
                COUNTERPARTY_COLLATERAL,
                predictor,
                counterparty,
                address(sponsor),
                ""
            )
        );

        uint256 pNonce = _freshNonce();
        uint256 cNonce = _freshNonce();
        uint256 deadline = block.timestamp + 1 hours;

        IV2Types.MintRequest memory request;
        request.picks = picks;
        request.predictorCollateral = bigCollateral;
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
            bigCollateral,
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
        request.predictorSponsor = address(sponsor);
        request.predictorSponsorData = "";

        vm.expectRevert(OnboardingSponsor.CollateralExceedsMatchLimit.selector);
        market.mint(request);
    }

    // ============ Integration: No budget ============

    function test_revert_noBudget() public {
        // No budget set for predictor
        IV2Types.Pick[] memory picks = new IV2Types.Pick[](1);
        picks[0] = _createPick(conditionId, IV2Types.OutcomeSide.YES);

        IV2Types.MintRequest memory request =
            _buildMintRequest(picks, address(sponsor));

        vm.expectRevert(OnboardingSponsor.NoBudget.selector);
        market.mint(request);
    }

    // ============ Integration: Unsponsored still works ============

    function test_unsponsoredMint_stillWorks() public {
        IV2Types.Pick[] memory picks = new IV2Types.Pick[](1);
        picks[0] = _createPick(conditionId, IV2Types.OutcomeSide.YES);

        uint256 predictorBalBefore = collateralToken.balanceOf(predictor);

        IV2Types.MintRequest memory request =
            _buildMintRequest(picks, address(0));
        market.mint(request);

        // Predictor self-funded
        assertEq(
            collateralToken.balanceOf(predictor),
            predictorBalBefore - PREDICTOR_COLLATERAL
        );
    }

    // ============ Unit: Budget manager ============

    function test_setBudget_asManager() public {
        vm.prank(manager);
        sponsor.setBudget(predictor, BUDGET);

        (uint256 allocated, uint256 used) = sponsor.budgets(predictor);
        assertEq(allocated, BUDGET);
        assertEq(used, 0);
    }

    function test_setBudget_asOwner() public {
        vm.prank(owner);
        sponsor.setBudget(predictor, BUDGET);

        (uint256 allocated,) = sponsor.budgets(predictor);
        assertEq(allocated, BUDGET);
    }

    function test_setBudget_revert_unauthorized() public {
        vm.prank(eve);
        vm.expectRevert(OnboardingSponsor.UnauthorizedBudgetManager.selector);
        sponsor.setBudget(predictor, BUDGET);
    }

    function test_setBudgets_batch() public {
        address[] memory users = new address[](2);
        users[0] = predictor;
        users[1] = counterparty;

        uint256[] memory amounts = new uint256[](2);
        amounts[0] = 1e18;
        amounts[1] = 2e18;

        vm.prank(manager);
        sponsor.setBudgets(users, amounts);

        assertEq(sponsor.remainingBudget(predictor), 1e18);
        assertEq(sponsor.remainingBudget(counterparty), 2e18);
    }

    function test_setBudgets_revert_lengthMismatch() public {
        address[] memory users = new address[](2);
        users[0] = predictor;
        users[1] = counterparty;

        uint256[] memory amounts = new uint256[](1);
        amounts[0] = 1e18;

        vm.prank(manager);
        vm.expectRevert(OnboardingSponsor.ArrayLengthMismatch.selector);
        sponsor.setBudgets(users, amounts);
    }

    // ============ Unit: Owner admin ============

    function test_setBudgetManager() public {
        vm.prank(owner);
        sponsor.setBudgetManager(eve);
        assertEq(sponsor.budgetManager(), eve);
    }

    function test_setMatchLimit() public {
        vm.prank(owner);
        sponsor.setMatchLimit(10e18);
        assertEq(sponsor.matchLimit(), 10e18);
    }

    // ============ Unit: Sweep ============

    function test_sweepToken() public {
        uint256 bal = collateralToken.balanceOf(address(sponsor));
        vm.prank(owner);
        sponsor.sweepToken(IERC20(address(collateralToken)), owner, bal);
        assertEq(collateralToken.balanceOf(address(sponsor)), 0);
        assertEq(collateralToken.balanceOf(owner), bal);
    }

    function test_sweepNative() public {
        vm.deal(address(sponsor), 1 ether);
        vm.prank(owner);
        sponsor.sweepNative(payable(owner), 1 ether);
        assertEq(address(sponsor).balance, 0);
    }

    function test_receiveNative() public {
        vm.deal(eve, 1 ether);
        vm.prank(eve);
        (bool success,) = address(sponsor).call{ value: 1 ether }("");
        assertTrue(success);
        assertEq(address(sponsor).balance, 1 ether);
    }

    // ============ Counterparty restriction ============

    function test_revert_unauthorizedCounterparty() public {
        vm.prank(manager);
        sponsor.setBudget(predictor, BUDGET);

        IV2Types.Pick[] memory picks = new IV2Types.Pick[](1);
        picks[0] = _createPick(conditionId, IV2Types.OutcomeSide.YES);

        // Build request with eve as counterparty (not the required vault-bot)
        bytes32 pickConfigId = keccak256(abi.encode(picks));
        bytes32 predictionHash = keccak256(
            abi.encode(
                pickConfigId,
                PREDICTOR_COLLATERAL,
                COUNTERPARTY_COLLATERAL,
                predictor,
                eve,
                address(sponsor),
                ""
            )
        );

        uint256 evePk = 6;
        collateralToken.mint(eve, 100e18);
        vm.prank(eve);
        collateralToken.approve(address(market), type(uint256).max);

        uint256 pNonce = _freshNonce();
        uint256 eNonce = _freshNonce();
        uint256 deadline = block.timestamp + 1 hours;

        IV2Types.MintRequest memory request;
        request.picks = picks;
        request.predictorCollateral = PREDICTOR_COLLATERAL;
        request.counterpartyCollateral = COUNTERPARTY_COLLATERAL;
        request.predictor = predictor;
        request.counterparty = eve;
        request.predictorNonce = pNonce;
        request.counterpartyNonce = eNonce;
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
            eve,
            COUNTERPARTY_COLLATERAL,
            eNonce,
            deadline,
            evePk
        );
        request.refCode = REF_CODE;
        request.predictorSponsor = address(sponsor);
        request.predictorSponsorData = "";

        vm.expectRevert(OnboardingSponsor.UnauthorizedCounterparty.selector);
        market.mint(request);
    }

    // ============ Entry price cap ============

    function test_revert_entryPriceTooHigh() public {
        vm.prank(manager);
        sponsor.setBudget(predictor, BUDGET);

        // 0.80 entry price: predictor=4e18, counterparty=1e18 → 4/(4+1) = 0.80 > 0.70
        uint256 highPredictorCollateral = 4e18;
        uint256 lowCounterpartyCollateral = 1e18;

        // Need higher match limit for this test
        vm.prank(owner);
        sponsor.setMatchLimit(10e18);

        IV2Types.Pick[] memory picks = new IV2Types.Pick[](1);
        picks[0] = _createPick(conditionId, IV2Types.OutcomeSide.YES);

        bytes32 pickConfigId = keccak256(abi.encode(picks));
        bytes32 predictionHash = keccak256(
            abi.encode(
                pickConfigId,
                highPredictorCollateral,
                lowCounterpartyCollateral,
                predictor,
                counterparty,
                address(sponsor),
                ""
            )
        );

        uint256 pNonce = _freshNonce();
        uint256 cNonce = _freshNonce();
        uint256 deadline = block.timestamp + 1 hours;

        IV2Types.MintRequest memory request;
        request.picks = picks;
        request.predictorCollateral = highPredictorCollateral;
        request.counterpartyCollateral = lowCounterpartyCollateral;
        request.predictor = predictor;
        request.counterparty = counterparty;
        request.predictorNonce = pNonce;
        request.counterpartyNonce = cNonce;
        request.predictorDeadline = deadline;
        request.counterpartyDeadline = deadline;
        request.predictorSignature = _signApproval(
            predictionHash,
            predictor,
            highPredictorCollateral,
            pNonce,
            deadline,
            predictorPk
        );
        request.counterpartySignature = _signApproval(
            predictionHash,
            counterparty,
            lowCounterpartyCollateral,
            cNonce,
            deadline,
            counterpartyPk
        );
        request.refCode = REF_CODE;
        request.predictorSponsor = address(sponsor);
        request.predictorSponsorData = "";

        vm.expectRevert(OnboardingSponsor.EntryPriceTooHigh.selector);
        market.mint(request);
    }

    function test_entryPrice_atExactCap_succeeds() public {
        vm.prank(manager);
        sponsor.setBudget(predictor, BUDGET);

        // 0.70 entry price: predictor=7e17, counterparty=3e17 → 7/(7+3) = 0.70 = cap
        uint256 predCol = 7e17;
        uint256 ctrCol = 3e17;

        IV2Types.Pick[] memory picks = new IV2Types.Pick[](1);
        picks[0] = _createPick(conditionId, IV2Types.OutcomeSide.YES);

        bytes32 pickConfigId = keccak256(abi.encode(picks));
        bytes32 predictionHash = keccak256(
            abi.encode(
                pickConfigId,
                predCol,
                ctrCol,
                predictor,
                counterparty,
                address(sponsor),
                ""
            )
        );

        uint256 pNonce = _freshNonce();
        uint256 cNonce = _freshNonce();
        uint256 deadline = block.timestamp + 1 hours;

        IV2Types.MintRequest memory request;
        request.picks = picks;
        request.predictorCollateral = predCol;
        request.counterpartyCollateral = ctrCol;
        request.predictor = predictor;
        request.counterparty = counterparty;
        request.predictorNonce = pNonce;
        request.counterpartyNonce = cNonce;
        request.predictorDeadline = deadline;
        request.counterpartyDeadline = deadline;
        request.predictorSignature = _signApproval(
            predictionHash, predictor, predCol, pNonce, deadline, predictorPk
        );
        request.counterpartySignature = _signApproval(
            predictionHash,
            counterparty,
            ctrCol,
            cNonce,
            deadline,
            counterpartyPk
        );
        request.refCode = REF_CODE;
        request.predictorSponsor = address(sponsor);
        request.predictorSponsorData = "";

        // Should succeed — exactly at the cap
        market.mint(request);
    }
}
