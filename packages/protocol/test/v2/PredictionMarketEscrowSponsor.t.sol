// SPDX-License-Identifier: MIT
pragma solidity ^0.8.19;

import "forge-std/Test.sol";
import "../../src/v2/PredictionMarketEscrow.sol";
import "../../src/v2/resolvers/mocks/ManualConditionResolver.sol";
import "../../src/v2/interfaces/IV2Types.sol";
import "../../src/v2/interfaces/IPredictionMarketEscrow.sol";
import "../../src/v2/interfaces/IPredictionMarketToken.sol";
import "../../src/v2/interfaces/IMintSponsor.sol";
import "../../src/v2/sponsors/MatchedBetSponsor.sol";
import "./mocks/MockERC20.sol";

/// @notice Minimal sponsor that always transfers the exact collateral
contract GoodSponsor is IMintSponsor {
    IERC20 public collateralToken;

    constructor(address collateralToken_) {
        collateralToken = IERC20(collateralToken_);
    }

    function fundMint(
        address escrow,
        address, /* predictor */
        uint256 collateral,
        IV2Types.Pick[] calldata, /* picks */
        bytes calldata /* sponsorData */
    ) external override {
        collateralToken.transfer(escrow, collateral);
    }
}

/// @notice Sponsor that intentionally transfers less than required
contract UnderfundingSponsor is IMintSponsor {
    IERC20 public collateralToken;

    constructor(address collateralToken_) {
        collateralToken = IERC20(collateralToken_);
    }

    function fundMint(
        address escrow,
        address, /* predictor */
        uint256 collateral,
        IV2Types.Pick[] calldata, /* picks */
        bytes calldata /* sponsorData */
    ) external override {
        // Transfer only half of the collateral
        collateralToken.transfer(escrow, collateral / 2);
    }
}

contract PredictionMarketEscrowSponsorTest is Test {
    PredictionMarketEscrow public market;
    ManualConditionResolver public resolver;
    MockERC20 public collateralToken;

    GoodSponsor public goodSponsor;
    UnderfundingSponsor public underfundingSponsor;
    MatchedBetSponsor public matchedBetSponsor;

    address public owner;
    address public predictor;
    address public counterparty;
    address public settler;

    uint256 public predictorPk;
    uint256 public counterpartyPk;

    uint256 public constant PREDICTOR_WAGER = 100e18;
    uint256 public constant COUNTERPARTY_WAGER = 150e18;
    uint256 public constant MATCH_LIMIT = 200e18;
    bytes32 public constant REF_CODE = keccak256("test-ref-code");

    bytes32 public conditionId1;

    function setUp() public {
        owner = vm.addr(1);
        predictorPk = 2;
        predictor = vm.addr(predictorPk);
        counterpartyPk = 3;
        counterparty = vm.addr(counterpartyPk);
        settler = vm.addr(4);

        collateralToken = new MockERC20("Test USDE", "USDE", 18);
        market = new PredictionMarketEscrow(address(collateralToken), owner);

        vm.prank(owner);
        resolver = new ManualConditionResolver(owner);
        vm.prank(owner);
        resolver.approveSettler(settler);

        conditionId1 = keccak256(abi.encode("condition-1"));

        // Deploy sponsors
        goodSponsor = new GoodSponsor(address(collateralToken));
        underfundingSponsor = new UnderfundingSponsor(address(collateralToken));
        matchedBetSponsor = new MatchedBetSponsor(
            address(market), address(collateralToken), MATCH_LIMIT, owner
        );

        // Fund sponsors
        collateralToken.mint(address(goodSponsor), 100_000e18);
        collateralToken.mint(address(underfundingSponsor), 100_000e18);
        collateralToken.mint(address(matchedBetSponsor), 100_000e18);

        // Approve market for sponsors
        vm.prank(address(goodSponsor));
        collateralToken.approve(address(market), type(uint256).max);

        // Fund counterparty and predictor
        collateralToken.mint(counterparty, 100_000e18);
        collateralToken.mint(predictor, 100_000e18);

        vm.prank(counterparty);
        collateralToken.approve(address(market), type(uint256).max);
        vm.prank(predictor);
        collateralToken.approve(address(market), type(uint256).max);

        // Whitelist predictor in matchedBetSponsor
        vm.prank(owner);
        matchedBetSponsor.setWhitelisted(predictor, true);

        // Set required condition
        vm.prank(owner);
        matchedBetSponsor.setRequiredCondition(address(resolver), conditionId1);
    }

    // ============ Helpers ============

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

    function _signApproval(
        bytes32 predictionHash,
        address signer,
        uint256 wager,
        uint256 nonce,
        uint256 deadline,
        uint256 pk
    ) internal view returns (bytes memory) {
        bytes32 approvalHash = market.getMintApprovalHash(
            predictionHash, signer, wager, nonce, deadline
        );
        (uint8 v, bytes32 r, bytes32 s) = vm.sign(pk, approvalHash);
        return abi.encodePacked(r, s, v);
    }

    function _createSponsoredMintRequest(
        IV2Types.Pick[] memory picks,
        address sponsor,
        bytes memory sponsorData
    ) internal view returns (IV2Types.MintRequest memory request) {
        bytes32 pickConfigId = keccak256(abi.encode(picks));
        bytes32 predictionHash = keccak256(
            abi.encode(
                pickConfigId,
                PREDICTOR_WAGER,
                COUNTERPARTY_WAGER,
                predictor,
                counterparty
            )
        );

        uint256 pNonce = market.getNonce(predictor);
        uint256 cNonce = market.getNonce(counterparty);
        uint256 deadline = block.timestamp + 1 hours;

        request.picks = picks;
        request.predictorWager = PREDICTOR_WAGER;
        request.counterpartyWager = COUNTERPARTY_WAGER;
        request.predictor = predictor;
        request.counterparty = counterparty;
        request.predictorNonce = pNonce;
        request.counterpartyNonce = cNonce;
        request.predictorDeadline = deadline;
        request.counterpartyDeadline = deadline;
        request.predictorSignature = _signApproval(
            predictionHash,
            predictor,
            PREDICTOR_WAGER,
            pNonce,
            deadline,
            predictorPk
        );
        request.counterpartySignature = _signApproval(
            predictionHash,
            counterparty,
            COUNTERPARTY_WAGER,
            cNonce,
            deadline,
            counterpartyPk
        );
        request.refCode = REF_CODE;
        request.predictorSessionKeyData = "";
        request.counterpartySessionKeyData = "";
        request.predictorSponsor = sponsor;
        request.predictorSponsorData = sponsorData;
    }

    function _createUnsponsoredMintRequest(IV2Types.Pick[] memory picks)
        internal
        view
        returns (IV2Types.MintRequest memory request)
    {
        return _createSponsoredMintRequest(picks, address(0), "");
    }

    // ============ Sponsored Mint Tests ============

    function test_sponsoredMint_succeeds() public {
        IV2Types.Pick[] memory picks = new IV2Types.Pick[](1);
        picks[0] = _createPick(conditionId1, IV2Types.OutcomeSide.YES);

        uint256 predictorBalBefore = collateralToken.balanceOf(predictor);
        uint256 sponsorBalBefore =
            collateralToken.balanceOf(address(goodSponsor));

        IV2Types.MintRequest memory request =
            _createSponsoredMintRequest(picks, address(goodSponsor), "");
        (
            bytes32 predictionId,
            address predictorToken,
            address counterpartyToken
        ) = market.mint(request);

        // Predictor's balance should be unchanged (sponsor paid)
        assertEq(
            collateralToken.balanceOf(predictor),
            predictorBalBefore,
            "Predictor balance should not change"
        );

        // Sponsor should have paid the predictor's collateral
        assertEq(
            collateralToken.balanceOf(address(goodSponsor)),
            sponsorBalBefore - PREDICTOR_WAGER,
            "Sponsor should pay predictor collateral"
        );

        // Counterparty still pays their own collateral
        uint256 totalCollateral = PREDICTOR_WAGER + COUNTERPARTY_WAGER;

        // Predictor should receive tokens
        assertEq(
            IPredictionMarketToken(predictorToken).balanceOf(predictor),
            totalCollateral,
            "Predictor should receive tokens"
        );

        // Counterparty should receive tokens
        assertEq(
            IPredictionMarketToken(counterpartyToken).balanceOf(counterparty),
            totalCollateral,
            "Counterparty should receive tokens"
        );

        // Prediction should be recorded
        IV2Types.Prediction memory prediction =
            market.getPrediction(predictionId);
        assertEq(prediction.predictor, predictor);
        assertEq(prediction.predictorWager, PREDICTOR_WAGER);
    }

    function test_sponsoredMint_revertsWhenUnderfunded() public {
        IV2Types.Pick[] memory picks = new IV2Types.Pick[](1);
        picks[0] = _createPick(conditionId1, IV2Types.OutcomeSide.YES);

        IV2Types.MintRequest memory request =
            _createSponsoredMintRequest(picks, address(underfundingSponsor), "");

        vm.expectRevert(IPredictionMarketEscrow.SponsorUnderfunded.selector);
        market.mint(request);
    }

    function test_sponsoredMint_revertsWhenSponsorHasNoFunds() public {
        // Deploy a good sponsor with no funds
        GoodSponsor emptyGoodSponsor = new GoodSponsor(address(collateralToken));

        IV2Types.Pick[] memory picks = new IV2Types.Pick[](1);
        picks[0] = _createPick(conditionId1, IV2Types.OutcomeSide.YES);

        IV2Types.MintRequest memory request =
            _createSponsoredMintRequest(picks, address(emptyGoodSponsor), "");

        // Will revert because the sponsor has no tokens to transfer
        vm.expectRevert();
        market.mint(request);
    }

    function test_unsponsoredMint_stillWorks() public {
        IV2Types.Pick[] memory picks = new IV2Types.Pick[](1);
        picks[0] = _createPick(conditionId1, IV2Types.OutcomeSide.YES);

        uint256 predictorBalBefore = collateralToken.balanceOf(predictor);

        IV2Types.MintRequest memory request =
            _createUnsponsoredMintRequest(picks);
        (
            bytes32 predictionId,
            address predictorToken,
            address counterpartyToken
        ) = market.mint(request);

        // Predictor's balance should decrease by their collateral (self-funded)
        assertEq(
            collateralToken.balanceOf(predictor),
            predictorBalBefore - PREDICTOR_WAGER,
            "Predictor should self-fund"
        );

        uint256 totalCollateral = PREDICTOR_WAGER + COUNTERPARTY_WAGER;
        assertEq(
            IPredictionMarketToken(predictorToken).balanceOf(predictor),
            totalCollateral
        );
        assertEq(
            IPredictionMarketToken(counterpartyToken).balanceOf(counterparty),
            totalCollateral
        );

        // Prediction should be recorded
        IV2Types.Prediction memory prediction =
            market.getPrediction(predictionId);
        assertEq(prediction.predictor, predictor);
    }

    // ============ MatchedBetSponsor Tests ============

    function test_matchedBetSponsor_whitelistEnforcement() public {
        // Remove predictor from whitelist
        vm.prank(owner);
        matchedBetSponsor.setWhitelisted(predictor, false);

        IV2Types.Pick[] memory picks = new IV2Types.Pick[](1);
        picks[0] = _createPick(conditionId1, IV2Types.OutcomeSide.YES);

        IV2Types.MintRequest memory request =
            _createSponsoredMintRequest(picks, address(matchedBetSponsor), "");

        vm.expectRevert(MatchedBetSponsor.NotWhitelisted.selector);
        market.mint(request);
    }

    function test_matchedBetSponsor_matchLimitEnforcement() public {
        // Set a very low match limit
        vm.prank(owner);
        matchedBetSponsor.setMatchLimit(10e18);

        IV2Types.Pick[] memory picks = new IV2Types.Pick[](1);
        picks[0] = _createPick(conditionId1, IV2Types.OutcomeSide.YES);

        // PREDICTOR_WAGER (100e18) > matchLimit (10e18)
        IV2Types.MintRequest memory request =
            _createSponsoredMintRequest(picks, address(matchedBetSponsor), "");

        vm.expectRevert(MatchedBetSponsor.CollateralExceedsMatchLimit.selector);
        market.mint(request);
    }

    function test_matchedBetSponsor_requiredConditionEnforcement() public {
        // Create a pick with a different condition
        bytes32 wrongConditionId = keccak256(abi.encode("wrong-condition"));

        IV2Types.Pick[] memory picks = new IV2Types.Pick[](1);
        picks[0] = _createPick(wrongConditionId, IV2Types.OutcomeSide.YES);

        IV2Types.MintRequest memory request =
            _createSponsoredMintRequest(picks, address(matchedBetSponsor), "");

        vm.expectRevert(MatchedBetSponsor.RequiredConditionNotFound.selector);
        market.mint(request);
    }

    function test_matchedBetSponsor_successfulSponsorship() public {
        IV2Types.Pick[] memory picks = new IV2Types.Pick[](1);
        picks[0] = _createPick(conditionId1, IV2Types.OutcomeSide.YES);

        uint256 sponsorBalBefore =
            collateralToken.balanceOf(address(matchedBetSponsor));

        IV2Types.MintRequest memory request =
            _createSponsoredMintRequest(picks, address(matchedBetSponsor), "");
        market.mint(request);

        assertEq(
            collateralToken.balanceOf(address(matchedBetSponsor)),
            sponsorBalBefore - PREDICTOR_WAGER,
            "Sponsor should pay predictor collateral"
        );
    }

    function test_matchedBetSponsor_ownerCanWithdrawERC20() public {
        address recipient = vm.addr(10);
        uint256 amount = 500e18;

        uint256 sponsorBalBefore =
            collateralToken.balanceOf(address(matchedBetSponsor));

        vm.prank(owner);
        matchedBetSponsor.withdrawERC20(
            IERC20(address(collateralToken)), recipient, amount
        );

        assertEq(collateralToken.balanceOf(recipient), amount);
        assertEq(
            collateralToken.balanceOf(address(matchedBetSponsor)),
            sponsorBalBefore - amount
        );
    }

    function test_matchedBetSponsor_ownerCanWithdrawNative() public {
        address payable recipient = payable(vm.addr(10));
        uint256 amount = 1 ether;

        // Send native tokens to sponsor
        vm.deal(address(matchedBetSponsor), amount);

        vm.prank(owner);
        matchedBetSponsor.withdrawNative(recipient, amount);

        assertEq(recipient.balance, amount);
        assertEq(address(matchedBetSponsor).balance, 0);
    }

    function test_matchedBetSponsor_nonEscrowCallerReverts() public {
        IV2Types.Pick[] memory picks = new IV2Types.Pick[](1);
        picks[0] = _createPick(conditionId1, IV2Types.OutcomeSide.YES);

        // Try to call fundMint directly from a non-escrow address
        vm.prank(vm.addr(99));
        vm.expectRevert(MatchedBetSponsor.UnauthorizedEscrow.selector);
        matchedBetSponsor.fundMint(
            address(market), predictor, PREDICTOR_WAGER, picks, ""
        );
    }
}
