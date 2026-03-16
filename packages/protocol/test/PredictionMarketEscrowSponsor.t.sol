// SPDX-License-Identifier: MIT
pragma solidity ^0.8.19;

import "forge-std/Test.sol";
import "../src/PredictionMarketEscrow.sol";
import "../src/PredictionMarketTokenFactory.sol";
import "../src/resolvers/mocks/ManualConditionResolver.sol";
import "../src/interfaces/IV2Types.sol";
import "../src/interfaces/IPredictionMarketEscrow.sol";
import "../src/interfaces/IPredictionMarketToken.sol";
import "../src/interfaces/IMintSponsor.sol";
import "./mocks/MockERC20.sol";

/// @notice Mock sponsor that transfers the exact collateral. NOT FOR PRODUCTION.
contract MockGoodSponsor is IMintSponsor {
    IERC20 public collateralToken;

    constructor(address collateralToken_) {
        collateralToken = IERC20(collateralToken_);
    }

    function fundMint(address escrow, IV2Types.MintRequest calldata request)
        external
        override
    {
        collateralToken.transfer(escrow, request.predictorCollateral);
    }
}

/// @notice Mock sponsor that intentionally transfers less than required. NOT FOR PRODUCTION.
contract MockUnderfundingSponsor is IMintSponsor {
    IERC20 public collateralToken;

    constructor(address collateralToken_) {
        collateralToken = IERC20(collateralToken_);
    }

    function fundMint(address escrow, IV2Types.MintRequest calldata request)
        external
        override
    {
        collateralToken.transfer(escrow, request.predictorCollateral / 2);
    }
}

contract PredictionMarketEscrowSponsorTest is Test {
    PredictionMarketEscrow public market;
    ManualConditionResolver public resolver;
    MockERC20 public collateralToken;

    MockGoodSponsor public goodSponsor;
    MockUnderfundingSponsor public underfundingSponsor;

    address public owner;
    address public predictor;
    address public counterparty;
    address public settler;

    uint256 public predictorPk;
    uint256 public counterpartyPk;

    uint256 public constant PREDICTOR_COLLATERAL = 100e18;
    uint256 public constant COUNTERPARTY_COLLATERAL = 150e18;
    bytes32 public constant REF_CODE = keccak256("test-ref-code");

    bytes32 public rawConditionId1;
    bytes public conditionId1;

    uint256 private _nextNonce = 1;

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

        // Deploy mock sponsors
        goodSponsor = new MockGoodSponsor(address(collateralToken));
        underfundingSponsor =
            new MockUnderfundingSponsor(address(collateralToken));

        // Fund sponsors
        collateralToken.mint(address(goodSponsor), 100_000e18);
        collateralToken.mint(address(underfundingSponsor), 100_000e18);

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

    function _createSponsoredMintRequest(
        IV2Types.Pick[] memory picks,
        address sponsor,
        bytes memory sponsorData
    ) internal returns (IV2Types.MintRequest memory request) {
        bytes32 pickConfigId = keccak256(abi.encode(picks));
        bytes32 predictionHash = keccak256(
            abi.encode(
                pickConfigId,
                PREDICTOR_COLLATERAL,
                COUNTERPARTY_COLLATERAL,
                predictor,
                counterparty,
                sponsor,
                sponsorData
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
        request.predictorSponsor = sponsor;
        request.predictorSponsorData = sponsorData;
    }

    function _createUnsponsoredMintRequest(IV2Types.Pick[] memory picks)
        internal
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
            sponsorBalBefore - PREDICTOR_COLLATERAL,
            "Sponsor should pay predictor collateral"
        );

        // Both sides receive tokens equal to total collateral
        uint256 totalCollateral = PREDICTOR_COLLATERAL + COUNTERPARTY_COLLATERAL;

        assertEq(
            IPredictionMarketToken(predictorToken).balanceOf(predictor),
            totalCollateral,
            "Predictor should receive tokens"
        );
        assertEq(
            IPredictionMarketToken(counterpartyToken).balanceOf(counterparty),
            totalCollateral,
            "Counterparty should receive tokens"
        );

        // Prediction should be recorded
        IV2Types.Prediction memory prediction =
            market.getPrediction(predictionId);
        assertEq(prediction.predictor, predictor);
        assertEq(prediction.predictorCollateral, PREDICTOR_COLLATERAL);
    }

    function test_sponsoredMint_revertsWhenUnderfunded() public {
        IV2Types.Pick[] memory picks = new IV2Types.Pick[](1);
        picks[0] = _createPick(conditionId1, IV2Types.OutcomeSide.YES);

        IV2Types.MintRequest memory request = _createSponsoredMintRequest(
            picks, address(underfundingSponsor), ""
        );

        vm.expectRevert(IPredictionMarketEscrow.SponsorUnderfunded.selector);
        market.mint(request);
    }

    function test_sponsoredMint_revertsWhenSponsorHasNoFunds() public {
        // Deploy a good sponsor with no funds
        MockGoodSponsor emptySponsor =
            new MockGoodSponsor(address(collateralToken));

        IV2Types.Pick[] memory picks = new IV2Types.Pick[](1);
        picks[0] = _createPick(conditionId1, IV2Types.OutcomeSide.YES);

        IV2Types.MintRequest memory request =
            _createSponsoredMintRequest(picks, address(emptySponsor), "");

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

        // Predictor self-funds
        assertEq(
            collateralToken.balanceOf(predictor),
            predictorBalBefore - PREDICTOR_COLLATERAL,
            "Predictor should self-fund"
        );

        uint256 totalCollateral = PREDICTOR_COLLATERAL + COUNTERPARTY_COLLATERAL;
        assertEq(
            IPredictionMarketToken(predictorToken).balanceOf(predictor),
            totalCollateral
        );
        assertEq(
            IPredictionMarketToken(counterpartyToken).balanceOf(counterparty),
            totalCollateral
        );

        IV2Types.Prediction memory prediction =
            market.getPrediction(predictionId);
        assertEq(prediction.predictor, predictor);
    }
}
