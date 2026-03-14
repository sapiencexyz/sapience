// SPDX-License-Identifier: MIT
pragma solidity ^0.8.19;

import "forge-std/Test.sol";
import "../src/PredictionMarketEscrow.sol";
import "../src/PredictionMarketTokenFactory.sol";
import "../src/resolvers/mocks/ManualConditionResolver.sol";
import "../src/interfaces/IV2Types.sol";
import "../src/interfaces/IPredictionMarketToken.sol";
import "@openzeppelin/contracts/interfaces/IERC1271.sol";
import "./mocks/MockERC20.sol";

/// @notice Mock smart account implementing EIP-1271
contract MockSmartAccount is IERC1271 {
    address public owner;
    bytes4 private constant EIP1271_MAGIC_VALUE = 0x1626ba7e;

    constructor(address _owner) {
        owner = _owner;
    }

    function isValidSignature(bytes32 hash, bytes memory signature)
        external
        view
        override
        returns (bytes4)
    {
        (uint8 v, bytes32 r, bytes32 s) = _splitSignature(signature);
        address signer = ecrecover(hash, v, r, s);
        if (signer == owner) {
            return EIP1271_MAGIC_VALUE;
        }
        return 0xffffffff;
    }

    function _splitSignature(bytes memory sig)
        internal
        pure
        returns (uint8 v, bytes32 r, bytes32 s)
    {
        require(sig.length == 65, "Invalid signature length");
        assembly {
            r := mload(add(sig, 32))
            s := mload(add(sig, 64))
            v := byte(0, mload(add(sig, 96)))
        }
    }
}

/// @notice Non-EIP1271 contract (no isValidSignature function)
contract NonEIP1271Contract {
    // Intentionally empty - does not implement IERC1271

    }

/// @notice Contract that reverts on isValidSignature
contract RevertingEIP1271Contract is IERC1271 {
    function isValidSignature(bytes32, bytes memory)
        external
        pure
        override
        returns (bytes4)
    {
        revert("Always reverts");
    }
}

contract PredictionMarketEscrowERC1271Test is Test {
    PredictionMarketEscrow public market;
    ManualConditionResolver public resolver;
    MockERC20 public collateralToken;

    address public owner;
    address public predictor;
    address public counterparty;
    address public settler;

    uint256 public predictorPk;
    uint256 public counterpartyPk;

    MockSmartAccount public predictorSmartAccount;
    MockSmartAccount public counterpartySmartAccount;

    uint256 public constant PREDICTOR_COLLATERAL = 100e18;
    uint256 public constant COUNTERPARTY_COLLATERAL = 150e18;
    uint256 public constant TOTAL_COLLATERAL =
        PREDICTOR_COLLATERAL + COUNTERPARTY_COLLATERAL;
    bytes32 public constant REF_CODE = keccak256("test-ref-code");

    bytes32 public rawConditionId1;
    bytes public conditionId1;

    uint256 private _nextNonce = 1;

    function _freshNonce() internal returns (uint256) {
        return _nextNonce++;
    }

    function setUp() public {
        // Create accounts with known private keys
        owner = vm.addr(1);
        predictorPk = 2;
        predictor = vm.addr(predictorPk);
        counterpartyPk = 3;
        counterparty = vm.addr(counterpartyPk);
        settler = vm.addr(4);

        // Deploy contracts
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

        // Approve settler
        vm.prank(owner);
        resolver.approveSettler(settler);

        // Create condition ID
        rawConditionId1 = keccak256(abi.encode("condition-1"));
        conditionId1 = abi.encode(rawConditionId1);

        // Deploy smart accounts (owned by predictor/counterparty EOAs)
        predictorSmartAccount = new MockSmartAccount(predictor);
        counterpartySmartAccount = new MockSmartAccount(counterparty);

        // Mint tokens to smart accounts
        collateralToken.mint(address(predictorSmartAccount), 10_000e18);
        collateralToken.mint(address(counterpartySmartAccount), 10_000e18);
        // Also mint to EOAs for mixed tests
        collateralToken.mint(predictor, 10_000e18);
        collateralToken.mint(counterparty, 10_000e18);

        // Approve market to spend tokens from smart accounts
        vm.prank(address(predictorSmartAccount));
        collateralToken.approve(address(market), type(uint256).max);
        vm.prank(address(counterpartySmartAccount));
        collateralToken.approve(address(market), type(uint256).max);
        // EOA approvals
        vm.prank(predictor);
        collateralToken.approve(address(market), type(uint256).max);
        vm.prank(counterparty);
        collateralToken.approve(address(market), type(uint256).max);
    }

    // ============ Helper Functions ============

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

    function _createMintRequestWithSmartAccountPredictor(IV2Types
                .Pick[] memory picks)
        internal
        returns (IV2Types.MintRequest memory request)
    {
        bytes32 pickConfigId = keccak256(abi.encode(picks));
        bytes32 predictionHash = keccak256(
            abi.encode(
                pickConfigId,
                PREDICTOR_COLLATERAL,
                COUNTERPARTY_COLLATERAL,
                address(predictorSmartAccount), // Smart account as predictor
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
        request.predictor = address(predictorSmartAccount);
        request.counterparty = counterparty;
        request.predictorNonce = pNonce;
        request.counterpartyNonce = cNonce;
        request.predictorDeadline = deadline;
        request.counterpartyDeadline = deadline;
        // Smart account predictor - owner signs
        request.predictorSignature = _signApproval(
            predictionHash,
            address(predictorSmartAccount),
            PREDICTOR_COLLATERAL,
            pNonce,
            deadline,
            predictorPk // Owner's private key
        );
        // EOA counterparty
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

    function _createMintRequestWithSmartAccountCounterparty(IV2Types
                .Pick[] memory picks)
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
                address(counterpartySmartAccount), // Smart account as counterparty
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
        request.counterparty = address(counterpartySmartAccount);
        request.predictorNonce = pNonce;
        request.counterpartyNonce = cNonce;
        request.predictorDeadline = deadline;
        request.counterpartyDeadline = deadline;
        // EOA predictor
        request.predictorSignature = _signApproval(
            predictionHash,
            predictor,
            PREDICTOR_COLLATERAL,
            pNonce,
            deadline,
            predictorPk
        );
        // Smart account counterparty - owner signs
        request.counterpartySignature = _signApproval(
            predictionHash,
            address(counterpartySmartAccount),
            COUNTERPARTY_COLLATERAL,
            cNonce,
            deadline,
            counterpartyPk // Owner's private key
        );
        request.refCode = REF_CODE;
        request.predictorSessionKeyData = "";
        request.counterpartySessionKeyData = "";
        request.predictorSponsor = address(0);
        request.predictorSponsorData = "";
    }

    function _createMintRequestBothSmartAccounts(IV2Types.Pick[] memory picks)
        internal
        returns (IV2Types.MintRequest memory request)
    {
        bytes32 pickConfigId = keccak256(abi.encode(picks));
        bytes32 predictionHash = keccak256(
            abi.encode(
                pickConfigId,
                PREDICTOR_COLLATERAL,
                COUNTERPARTY_COLLATERAL,
                address(predictorSmartAccount),
                address(counterpartySmartAccount),
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
        request.predictor = address(predictorSmartAccount);
        request.counterparty = address(counterpartySmartAccount);
        request.predictorNonce = pNonce;
        request.counterpartyNonce = cNonce;
        request.predictorDeadline = deadline;
        request.counterpartyDeadline = deadline;
        request.predictorSignature = _signApproval(
            predictionHash,
            address(predictorSmartAccount),
            PREDICTOR_COLLATERAL,
            pNonce,
            deadline,
            predictorPk
        );
        request.counterpartySignature = _signApproval(
            predictionHash,
            address(counterpartySmartAccount),
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

    function _createMintRequestEOA(IV2Types.Pick[] memory picks)
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

    // ============ EIP-1271 Tests ============

    function test_mint_smartAccountAsPredictor() public {
        IV2Types.Pick[] memory picks = new IV2Types.Pick[](1);
        picks[0] = _createPick(conditionId1, IV2Types.OutcomeSide.YES);

        IV2Types.MintRequest memory request =
            _createMintRequestWithSmartAccountPredictor(picks);

        uint256 smartAccountBalanceBefore =
            collateralToken.balanceOf(address(predictorSmartAccount));

        (
            bytes32 predictionId,
            address predictorToken,
            address counterpartyToken
        ) = market.mint(request);

        // Check prediction was created
        assertTrue(predictionId != bytes32(0));
        assertTrue(predictorToken != address(0));
        assertTrue(counterpartyToken != address(0));

        // Check collateral was transferred from smart account
        assertEq(
            collateralToken.balanceOf(address(predictorSmartAccount)),
            smartAccountBalanceBefore - PREDICTOR_COLLATERAL
        );

        // Check position tokens were minted to smart account
        assertEq(
            IPredictionMarketToken(predictorToken)
                .balanceOf(address(predictorSmartAccount)),
            TOTAL_COLLATERAL
        );

        // Check prediction data
        IV2Types.Prediction memory prediction =
            market.getPrediction(predictionId);
        assertEq(prediction.predictor, address(predictorSmartAccount));
        assertEq(prediction.counterparty, counterparty);
    }

    function test_mint_smartAccountAsCounterparty() public {
        IV2Types.Pick[] memory picks = new IV2Types.Pick[](1);
        picks[0] = _createPick(conditionId1, IV2Types.OutcomeSide.YES);

        IV2Types.MintRequest memory request =
            _createMintRequestWithSmartAccountCounterparty(picks);

        uint256 smartAccountBalanceBefore =
            collateralToken.balanceOf(address(counterpartySmartAccount));

        (bytes32 predictionId,, address counterpartyToken) =
            market.mint(request);

        // Check prediction was created
        assertTrue(predictionId != bytes32(0));

        // Check collateral was transferred from smart account
        assertEq(
            collateralToken.balanceOf(address(counterpartySmartAccount)),
            smartAccountBalanceBefore - COUNTERPARTY_COLLATERAL
        );

        // Check position tokens were minted to smart account
        assertEq(
            IPredictionMarketToken(counterpartyToken)
                .balanceOf(address(counterpartySmartAccount)),
            TOTAL_COLLATERAL
        );

        // Check prediction data
        IV2Types.Prediction memory prediction =
            market.getPrediction(predictionId);
        assertEq(prediction.predictor, predictor);
        assertEq(prediction.counterparty, address(counterpartySmartAccount));
    }

    function test_mint_bothPartiesSmartAccounts() public {
        IV2Types.Pick[] memory picks = new IV2Types.Pick[](1);
        picks[0] = _createPick(conditionId1, IV2Types.OutcomeSide.YES);

        IV2Types.MintRequest memory request =
            _createMintRequestBothSmartAccounts(picks);

        (
            bytes32 predictionId,
            address predictorToken,
            address counterpartyToken
        ) = market.mint(request);

        // Check prediction was created with both smart accounts
        assertTrue(predictionId != bytes32(0));

        IV2Types.Prediction memory prediction =
            market.getPrediction(predictionId);
        assertEq(prediction.predictor, address(predictorSmartAccount));
        assertEq(prediction.counterparty, address(counterpartySmartAccount));

        // Check tokens minted to smart accounts
        assertEq(
            IPredictionMarketToken(predictorToken)
                .balanceOf(address(predictorSmartAccount)),
            TOTAL_COLLATERAL
        );
        assertEq(
            IPredictionMarketToken(counterpartyToken)
                .balanceOf(address(counterpartySmartAccount)),
            TOTAL_COLLATERAL
        );
    }

    function test_mint_smartAccount_invalidSignature() public {
        IV2Types.Pick[] memory picks = new IV2Types.Pick[](1);
        picks[0] = _createPick(conditionId1, IV2Types.OutcomeSide.YES);

        IV2Types.MintRequest memory request =
            _createMintRequestWithSmartAccountPredictor(picks);

        // Replace with invalid signature (wrong private key)
        bytes32 pickConfigId = keccak256(abi.encode(picks));
        bytes32 predictionHash = keccak256(
            abi.encode(
                pickConfigId,
                PREDICTOR_COLLATERAL,
                COUNTERPARTY_COLLATERAL,
                address(predictorSmartAccount),
                counterparty,
                address(0),
                ""
            )
        );

        // Sign with wrong key (counterpartyPk instead of predictorPk)
        request.predictorSignature = _signApproval(
            predictionHash,
            address(predictorSmartAccount),
            PREDICTOR_COLLATERAL,
            request.predictorNonce,
            request.predictorDeadline,
            counterpartyPk // Wrong key!
        );

        vm.expectRevert(
            IPredictionMarketEscrow.InvalidPredictorSignature.selector
        );
        market.mint(request);
    }

    function test_mint_nonEIP1271Contract_fails() public {
        // Deploy a contract that doesn't implement IERC1271
        NonEIP1271Contract nonEIP1271 = new NonEIP1271Contract();

        // Fund and approve
        collateralToken.mint(address(nonEIP1271), 10_000e18);
        vm.prank(address(nonEIP1271));
        collateralToken.approve(address(market), type(uint256).max);

        IV2Types.Pick[] memory picks = new IV2Types.Pick[](1);
        picks[0] = _createPick(conditionId1, IV2Types.OutcomeSide.YES);

        bytes32 pickConfigId = keccak256(abi.encode(picks));
        bytes32 predictionHash = keccak256(
            abi.encode(
                pickConfigId,
                PREDICTOR_COLLATERAL,
                COUNTERPARTY_COLLATERAL,
                address(nonEIP1271),
                counterparty,
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
        request.predictor = address(nonEIP1271);
        request.counterparty = counterparty;
        request.predictorNonce = pNonce;
        request.counterpartyNonce = cNonce;
        request.predictorDeadline = deadline;
        request.counterpartyDeadline = deadline;
        // Sign with some key - doesn't matter since contract doesn't implement EIP-1271
        request.predictorSignature = _signApproval(
            predictionHash,
            address(nonEIP1271),
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

        // Should fail because the contract doesn't implement EIP-1271
        vm.expectRevert(
            IPredictionMarketEscrow.InvalidPredictorSignature.selector
        );
        market.mint(request);
    }

    function test_mint_revertingEIP1271Contract_fails() public {
        // Deploy a contract that reverts on isValidSignature
        RevertingEIP1271Contract revertingContract =
            new RevertingEIP1271Contract();

        // Fund and approve
        collateralToken.mint(address(revertingContract), 10_000e18);
        vm.prank(address(revertingContract));
        collateralToken.approve(address(market), type(uint256).max);

        IV2Types.Pick[] memory picks = new IV2Types.Pick[](1);
        picks[0] = _createPick(conditionId1, IV2Types.OutcomeSide.YES);

        bytes32 pickConfigId = keccak256(abi.encode(picks));
        bytes32 predictionHash = keccak256(
            abi.encode(
                pickConfigId,
                PREDICTOR_COLLATERAL,
                COUNTERPARTY_COLLATERAL,
                address(revertingContract),
                counterparty,
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
        request.predictor = address(revertingContract);
        request.counterparty = counterparty;
        request.predictorNonce = pNonce;
        request.counterpartyNonce = cNonce;
        request.predictorDeadline = deadline;
        request.counterpartyDeadline = deadline;
        request.predictorSignature = _signApproval(
            predictionHash,
            address(revertingContract),
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

        // Should fail gracefully (catch block in _isEIP1271SignatureValid)
        vm.expectRevert(
            IPredictionMarketEscrow.InvalidPredictorSignature.selector
        );
        market.mint(request);
    }

    function test_mint_EOA_stillWorks() public {
        // Ensure EOA signatures still work after adding EIP-1271 support
        IV2Types.Pick[] memory picks = new IV2Types.Pick[](1);
        picks[0] = _createPick(conditionId1, IV2Types.OutcomeSide.YES);

        IV2Types.MintRequest memory request = _createMintRequestEOA(picks);

        (
            bytes32 predictionId,
            address predictorToken,
            address counterpartyToken
        ) = market.mint(request);

        assertTrue(predictionId != bytes32(0));
        assertTrue(predictorToken != address(0));
        assertTrue(counterpartyToken != address(0));

        IV2Types.Prediction memory prediction =
            market.getPrediction(predictionId);
        assertEq(prediction.predictor, predictor);
        assertEq(prediction.counterparty, counterparty);
    }

    // ============ Full Lifecycle Tests ============

    function test_fullLifecycle_smartAccountWins() public {
        IV2Types.Pick[] memory picks = new IV2Types.Pick[](1);
        picks[0] = _createPick(conditionId1, IV2Types.OutcomeSide.YES);

        IV2Types.MintRequest memory request =
            _createMintRequestWithSmartAccountPredictor(picks);

        (bytes32 predictionId, address predictorToken,) = market.mint(request);

        // Settle condition to YES (predictor wins)
        vm.prank(settler);
        resolver.settleCondition(rawConditionId1, IV2Types.OutcomeVector(1, 0));

        // Settle prediction
        market.settle(predictionId, REF_CODE);

        // Smart account redeems
        uint256 balanceBefore =
            collateralToken.balanceOf(address(predictorSmartAccount));

        vm.prank(address(predictorSmartAccount));
        uint256 payout =
            market.redeem(predictorToken, TOTAL_COLLATERAL, REF_CODE);

        // Smart account should get all collateral
        assertEq(payout, TOTAL_COLLATERAL);
        assertEq(
            collateralToken.balanceOf(address(predictorSmartAccount)),
            balanceBefore + payout
        );
    }

    function test_fullLifecycle_smartAccountLoses() public {
        IV2Types.Pick[] memory picks = new IV2Types.Pick[](1);
        picks[0] = _createPick(conditionId1, IV2Types.OutcomeSide.YES);

        IV2Types.MintRequest memory request =
            _createMintRequestWithSmartAccountPredictor(picks);

        (bytes32 predictionId,, address counterpartyToken) =
            market.mint(request);

        // Settle condition to NO (counterparty wins)
        vm.prank(settler);
        resolver.settleCondition(rawConditionId1, IV2Types.OutcomeVector(0, 1));

        // Settle prediction
        market.settle(predictionId, REF_CODE);

        // Counterparty redeems
        uint256 counterpartyBalanceBefore =
            collateralToken.balanceOf(counterparty);

        vm.prank(counterparty);
        uint256 payout =
            market.redeem(counterpartyToken, TOTAL_COLLATERAL, REF_CODE);

        // Counterparty should get all collateral
        assertEq(payout, TOTAL_COLLATERAL);
        assertEq(
            collateralToken.balanceOf(counterparty),
            counterpartyBalanceBefore + payout
        );
    }

    function test_fullLifecycle_bothSmartAccountsTie() public {
        IV2Types.Pick[] memory picks = new IV2Types.Pick[](1);
        picks[0] = _createPick(conditionId1, IV2Types.OutcomeSide.YES);

        IV2Types.MintRequest memory request =
            _createMintRequestBothSmartAccounts(picks);

        (
            bytes32 predictionId,
            address predictorToken,
            address counterpartyToken
        ) = market.mint(request);

        // Settle condition to TIE
        vm.prank(settler);
        resolver.settleCondition(rawConditionId1, IV2Types.OutcomeVector(1, 1));

        // Settle prediction
        market.settle(predictionId, REF_CODE);

        // Both smart accounts redeem (full TOTAL_COLLATERAL each)
        vm.prank(address(predictorSmartAccount));
        uint256 predictorPayout =
            market.redeem(predictorToken, TOTAL_COLLATERAL, REF_CODE);

        vm.prank(address(counterpartySmartAccount));
        uint256 counterpartyPayout =
            market.redeem(counterpartyToken, TOTAL_COLLATERAL, REF_CODE);

        // Non-decisive = counterparty wins all collateral
        assertEq(predictorPayout, 0);
        assertEq(counterpartyPayout, TOTAL_COLLATERAL);
    }
}
