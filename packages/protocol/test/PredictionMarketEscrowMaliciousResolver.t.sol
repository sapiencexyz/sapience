// SPDX-License-Identifier: MIT
pragma solidity ^0.8.19;

import "forge-std/Test.sol";
import "../src/PredictionMarketEscrow.sol";
import "../src/PredictionMarketTokenFactory.sol";
import "../src/interfaces/IConditionResolver.sol";
import "../src/interfaces/IV2Types.sol";
import "../src/interfaces/IPredictionMarketEscrow.sol";
import "./mocks/MockERC20.sol";

/// @notice Malicious resolver that returns empty arrays from getResolutions()
/// @dev Exploits #70003: _resolveBatch panics on short resolver arrays
contract EmptyArrayResolver is IConditionResolver {
    function isValidCondition(bytes calldata) external pure returns (bool) {
        return true;
    }

    function getResolution(bytes calldata)
        external
        pure
        returns (bool, IV2Types.OutcomeVector memory)
    {
        return (true, IV2Types.OutcomeVector(1, 0));
    }

    function getResolutions(bytes[] calldata)
        external
        pure
        returns (bool[] memory, IV2Types.OutcomeVector[] memory)
    {
        // Return empty arrays — causes Panic(0x32) in _resolveBatch loop
        return (new bool[](0), new IV2Types.OutcomeVector[](0));
    }

    function isFinalized(bytes calldata) external pure returns (bool) {
        return true;
    }
}

/// @notice Malicious resolver that returns arrays shorter than expected
contract ShortArrayResolver is IConditionResolver {
    function isValidCondition(bytes calldata) external pure returns (bool) {
        return true;
    }

    function getResolution(bytes calldata)
        external
        pure
        returns (bool, IV2Types.OutcomeVector memory)
    {
        return (true, IV2Types.OutcomeVector(1, 0));
    }

    function getResolutions(bytes[] calldata)
        external
        pure
        returns (
            bool[] memory isResolved,
            IV2Types.OutcomeVector[] memory outcomes
        )
    {
        // Return arrays with 1 element when 2+ are expected
        isResolved = new bool[](1);
        outcomes = new IV2Types.OutcomeVector[](1);
        isResolved[0] = true;
        outcomes[0] = IV2Types.OutcomeVector(1, 0);
    }

    function isFinalized(bytes calldata) external pure returns (bool) {
        return true;
    }
}

/**
 * @title PredictionMarketEscrowMaliciousResolverTest
 * @notice Tests for #70003: _resolveBatch panics on short resolver arrays
 * @dev A malicious resolver returning empty/short arrays should be treated as
 *      unresolved, not cause a permanent panic that locks funds.
 */
contract PredictionMarketEscrowMaliciousResolverTest is Test {
    PredictionMarketEscrow public market;
    MockERC20 public collateralToken;

    address public owner;
    address public predictor;
    address public counterparty;

    uint256 public predictorPk;
    uint256 public counterpartyPk;

    uint256 public constant PREDICTOR_COLLATERAL = 100e18;
    uint256 public constant COUNTERPARTY_COLLATERAL = 150e18;
    bytes32 public constant REF_CODE = keccak256("malicious-resolver-test");

    uint256 private _nextNonce = 1;

    function setUp() public {
        owner = vm.addr(1);
        predictorPk = 2;
        predictor = vm.addr(predictorPk);
        counterpartyPk = 3;
        counterparty = vm.addr(counterpartyPk);

        collateralToken = new MockERC20("Test USDE", "USDE", 18);
        PredictionMarketTokenFactory tokenFactory =
            new PredictionMarketTokenFactory(owner);
        market = new PredictionMarketEscrow(
            address(collateralToken), owner, address(tokenFactory)
        );
        vm.prank(owner);
        tokenFactory.setDeployer(address(market));

        collateralToken.mint(predictor, 10_000e18);
        collateralToken.mint(counterparty, 10_000e18);

        vm.prank(predictor);
        collateralToken.approve(address(market), type(uint256).max);
        vm.prank(counterparty);
        collateralToken.approve(address(market), type(uint256).max);
    }

    function _freshNonce() internal returns (uint256) {
        return _nextNonce++;
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
        request.predictorSponsor = address(0);
        request.predictorSponsorData = "";
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

    /// @notice Empty arrays from resolver should be treated as unresolved, not panic
    function test_settle_emptyArrayResolver_treatsAsUnresolved() public {
        EmptyArrayResolver maliciousResolver = new EmptyArrayResolver();

        bytes memory conditionId = abi.encode(bytes32(uint256(1)));
        IV2Types.Pick[] memory picks = new IV2Types.Pick[](1);
        picks[0] = IV2Types.Pick({
            conditionResolver: address(maliciousResolver),
            conditionId: conditionId,
            predictedOutcome: IV2Types.OutcomeSide.YES
        });

        IV2Types.MintRequest memory request = _createMintRequest(picks);
        (bytes32 predictionId,,) = market.mint(request);

        // Should revert with PredictionNotResolvable, NOT Panic(0x32)
        vm.expectRevert(
            IPredictionMarketEscrow.PredictionNotResolvable.selector
        );
        market.settle(predictionId, REF_CODE);
    }

    /// @notice Short arrays from resolver should be treated as unresolved, not panic
    function test_settle_shortArrayResolver_treatsAsUnresolved() public {
        ShortArrayResolver maliciousResolver = new ShortArrayResolver();

        // Create 2 picks so the resolver returns 1 element but 2 are expected
        bytes memory cond1 = abi.encode(bytes32(uint256(1)));
        bytes memory cond2 = abi.encode(bytes32(uint256(2)));

        // Sort by keccak256 for canonical ordering
        if (keccak256(cond1) > keccak256(cond2)) {
            (cond1, cond2) = (cond2, cond1);
        }

        IV2Types.Pick[] memory picks = new IV2Types.Pick[](2);
        picks[0] = IV2Types.Pick({
            conditionResolver: address(maliciousResolver),
            conditionId: cond1,
            predictedOutcome: IV2Types.OutcomeSide.YES
        });
        picks[1] = IV2Types.Pick({
            conditionResolver: address(maliciousResolver),
            conditionId: cond2,
            predictedOutcome: IV2Types.OutcomeSide.YES
        });

        IV2Types.MintRequest memory request = _createMintRequest(picks);
        (bytes32 predictionId,,) = market.mint(request);

        // Should revert with PredictionNotResolvable, NOT Panic(0x32)
        vm.expectRevert(
            IPredictionMarketEscrow.PredictionNotResolvable.selector
        );
        market.settle(predictionId, REF_CODE);
    }

    /// @notice Funds should remain redeemable after malicious resolver is replaced
    function test_settle_afterResolverFix_fundsNotLocked() public {
        // This test verifies that after a malicious resolver causes UNRESOLVED,
        // the pick config is NOT marked as resolved, so a future attempt
        // (after the resolver is fixed or replaced) can still succeed.
        EmptyArrayResolver maliciousResolver = new EmptyArrayResolver();

        bytes memory conditionId = abi.encode(bytes32(uint256(42)));
        IV2Types.Pick[] memory picks = new IV2Types.Pick[](1);
        picks[0] = IV2Types.Pick({
            conditionResolver: address(maliciousResolver),
            conditionId: conditionId,
            predictedOutcome: IV2Types.OutcomeSide.YES
        });

        IV2Types.MintRequest memory request = _createMintRequest(picks);
        (bytes32 predictionId,,) = market.mint(request);

        // First settle attempt fails (unresolved)
        vm.expectRevert(
            IPredictionMarketEscrow.PredictionNotResolvable.selector
        );
        market.settle(predictionId, REF_CODE);

        // Verify prediction is NOT marked as settled
        IV2Types.Prediction memory prediction =
            market.getPrediction(predictionId);
        assertFalse(
            prediction.settled,
            "prediction should not be settled after malicious resolver"
        );

        // Verify pick config is NOT marked as resolved
        IV2Types.PickConfiguration memory config =
            market.getPickConfiguration(prediction.pickConfigId);
        assertFalse(
            config.resolved,
            "pick config should not be resolved after malicious resolver"
        );
    }
}
