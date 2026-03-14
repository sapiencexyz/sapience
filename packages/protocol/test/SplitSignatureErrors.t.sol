// SPDX-License-Identifier: MIT
pragma solidity ^0.8.19;

import "forge-std/Test.sol";
import "../src/PredictionMarketEscrow.sol";
import "../src/PredictionMarketTokenFactory.sol";
import "../src/resolvers/mocks/ManualConditionResolver.sol";
import "../src/interfaces/IV2Types.sol";
import "../src/interfaces/IPredictionMarketEscrow.sol";
import "./mocks/MockERC20.sol";

/// @title SplitSignatureErrorsTest
/// @notice Tests that predictor and counterparty get distinct signature errors
contract SplitSignatureErrorsTest is Test {
    PredictionMarketEscrow public market;
    ManualConditionResolver public resolver;
    MockERC20 public collateralToken;

    address public owner;
    uint256 public predictorPk;
    uint256 public counterpartyPk;
    address public predictor;
    address public counterparty;
    address public settler;

    bytes32 public rawConditionId;
    bytes public conditionId;
    bytes32 public constant REF_CODE = keccak256("test-ref");

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

        rawConditionId = keccak256("sig-error-test");
        conditionId = abi.encode(rawConditionId);

        collateralToken.mint(predictor, 10_000e18);
        collateralToken.mint(counterparty, 10_000e18);
        vm.prank(predictor);
        collateralToken.approve(address(market), type(uint256).max);
        vm.prank(counterparty);
        collateralToken.approve(address(market), type(uint256).max);
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

    function _buildRequest()
        internal
        view
        returns (IV2Types.MintRequest memory request)
    {
        IV2Types.Pick[] memory picks = new IV2Types.Pick[](1);
        picks[0] = IV2Types.Pick({
            conditionResolver: address(resolver),
            conditionId: conditionId,
            predictedOutcome: IV2Types.OutcomeSide.YES
        });

        bytes32 pickConfigId = keccak256(abi.encode(picks));
        bytes32 predictionHash = keccak256(
            abi.encode(
                pickConfigId,
                100e18,
                100e18,
                predictor,
                counterparty,
                address(0),
                ""
            )
        );

        uint256 deadline = block.timestamp + 1 hours;

        request.picks = picks;
        request.predictorCollateral = 100e18;
        request.counterpartyCollateral = 100e18;
        request.predictor = predictor;
        request.counterparty = counterparty;
        request.predictorNonce = 1;
        request.counterpartyNonce = 2;
        request.predictorDeadline = deadline;
        request.counterpartyDeadline = deadline;
        request.predictorSignature = _signApproval(
            predictionHash, predictor, 100e18, 1, deadline, predictorPk
        );
        request.counterpartySignature = _signApproval(
            predictionHash, counterparty, 100e18, 2, deadline, counterpartyPk
        );
        request.refCode = REF_CODE;
        request.predictorSessionKeyData = "";
        request.counterpartySessionKeyData = "";
        request.predictorSponsor = address(0);
        request.predictorSponsorData = "";
    }

    // ============ Mint Signature Error Tests ============

    function test_mint_invalidPredictorSignature_reverts() public {
        IV2Types.MintRequest memory request = _buildRequest();
        // Corrupt predictor signature
        request.predictorSignature = abi.encodePacked(
            bytes32(uint256(1)), bytes32(uint256(2)), uint8(27)
        );

        vm.expectRevert(
            IPredictionMarketEscrow.InvalidPredictorSignature.selector
        );
        market.mint(request);
    }

    function test_mint_invalidCounterpartySignature_reverts() public {
        IV2Types.MintRequest memory request = _buildRequest();
        // Corrupt counterparty signature
        request.counterpartySignature = abi.encodePacked(
            bytes32(uint256(1)), bytes32(uint256(2)), uint8(27)
        );

        vm.expectRevert(
            IPredictionMarketEscrow.InvalidCounterpartSignature.selector
        );
        market.mint(request);
    }

    function test_mint_swappedSignatures_predictorErrorFirst() public {
        IV2Types.MintRequest memory request = _buildRequest();
        // Swap: predictor gets counterparty's sig
        bytes memory temp = request.predictorSignature;
        request.predictorSignature = request.counterpartySignature;
        request.counterpartySignature = temp;

        // Predictor sig is checked first, so we get InvalidPredictorSignature
        vm.expectRevert(
            IPredictionMarketEscrow.InvalidPredictorSignature.selector
        );
        market.mint(request);
    }

    // ============ Signature Validation Views ============

    function test_verifyMintPartySignature_validSignature() public view {
        IV2Types.MintRequest memory request = _buildRequest();

        IV2Types.Pick[] memory picks = new IV2Types.Pick[](1);
        picks[0] = IV2Types.Pick({
            conditionResolver: address(resolver),
            conditionId: conditionId,
            predictedOutcome: IV2Types.OutcomeSide.YES
        });
        bytes32 pickConfigId = keccak256(abi.encode(picks));
        bytes32 predictionHash = keccak256(
            abi.encode(
                pickConfigId,
                100e18,
                100e18,
                predictor,
                counterparty,
                address(0),
                ""
            )
        );

        bool isValid = market.verifyMintPartySignature(
            predictionHash,
            predictor,
            100e18,
            1,
            request.predictorDeadline,
            request.predictorSignature,
            ""
        );
        assertTrue(isValid);
    }

    function test_verifyMintPartySignature_invalidSignature() public view {
        IV2Types.Pick[] memory picks = new IV2Types.Pick[](1);
        picks[0] = IV2Types.Pick({
            conditionResolver: address(resolver),
            conditionId: conditionId,
            predictedOutcome: IV2Types.OutcomeSide.YES
        });
        bytes32 pickConfigId = keccak256(abi.encode(picks));
        bytes32 predictionHash = keccak256(
            abi.encode(
                pickConfigId,
                100e18,
                100e18,
                predictor,
                counterparty,
                address(0),
                ""
            )
        );

        bytes memory badSig = abi.encodePacked(
            bytes32(uint256(1)), bytes32(uint256(2)), uint8(27)
        );

        bool isValid = market.verifyMintPartySignature(
            predictionHash,
            predictor,
            100e18,
            1,
            block.timestamp + 1 hours,
            badSig,
            ""
        );
        assertFalse(isValid);
    }
}
