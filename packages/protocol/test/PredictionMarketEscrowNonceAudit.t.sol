// SPDX-License-Identifier: MIT
pragma solidity ^0.8.19;

import "forge-std/Test.sol";
import "../src/PredictionMarketEscrow.sol";
import "../src/PredictionMarketTokenFactory.sol";
import "../src/resolvers/mocks/ManualConditionResolver.sol";
import "../src/interfaces/IV2Types.sol";
import "../src/interfaces/IPredictionMarketEscrow.sol";
import "./mocks/MockERC20.sol";

/**
 * @title PredictionMarketEscrowNonceAudit
 * @notice Audit tests for M-3: Bitmap nonces (Permit2-style)
 *
 * M-3 Vulnerability:
 *   Sequential nonces (`mapping(address => uint256)`) block concurrent bets.
 *   If a user signs nonces 3 and 4, nonce 4 cannot execute before 3.
 *
 * M-3 Fix:
 *   Bitmap nonces (`mapping(address => mapping(uint256 => uint256))`) allow
 *   any unused nonce to be consumed in any order, enabling concurrent bets.
 */
contract PredictionMarketEscrowNonceAudit is Test {
    PredictionMarketEscrow public market;
    ManualConditionResolver public resolver;
    MockERC20 public collateralToken;

    address public owner;
    address public predictor;
    address public counterparty;
    address public settler;

    uint256 public predictorPk;
    uint256 public counterpartyPk;

    uint256 public constant PREDICTOR_COLLATERAL = 100e18;
    uint256 public constant COUNTERPARTY_COLLATERAL = 150e18;
    bytes32 public constant REF_CODE = keccak256("nonce-audit");

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

        collateralToken.mint(predictor, 1_000_000e18);
        collateralToken.mint(counterparty, 1_000_000e18);

        vm.prank(predictor);
        collateralToken.approve(address(market), type(uint256).max);
        vm.prank(counterparty);
        collateralToken.approve(address(market), type(uint256).max);
    }

    // ============ Helpers ============

    function _createPick(bytes memory conditionId)
        internal
        view
        returns (IV2Types.Pick[] memory)
    {
        IV2Types.Pick[] memory picks = new IV2Types.Pick[](1);
        picks[0] = IV2Types.Pick({
            conditionResolver: address(resolver),
            conditionId: conditionId,
            predictedOutcome: IV2Types.OutcomeSide.YES
        });
        return picks;
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
        uint256 pNonce,
        uint256 cNonce
    ) internal view returns (IV2Types.MintRequest memory request) {
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

    // ============ M-3 Tests ============

    /**
     * @notice Concurrent nonces: execute out of order, both succeed
     */
    function test_M3_concurrentNoncesOutOfOrder() public {
        bytes32 condId1 = keccak256("concurrent-1");
        bytes32 condId2 = keccak256("concurrent-2");

        IV2Types.Pick[] memory picks1 = _createPick(abi.encode(condId1));
        IV2Types.Pick[] memory picks2 = _createPick(abi.encode(condId2));

        // Sign with nonces 100 and 50 (intentionally non-sequential)
        IV2Types.MintRequest memory req1 = _buildMintRequest(picks1, 100, 200);
        IV2Types.MintRequest memory req2 = _buildMintRequest(picks2, 50, 150);

        // Execute nonce 50/150 first (out of order relative to 100/200)
        market.mint(req2);
        // Execute nonce 100/200 second — should succeed with bitmap nonces
        market.mint(req1);

        assertTrue(market.isNonceUsed(predictor, 50));
        assertTrue(market.isNonceUsed(predictor, 100));
        assertTrue(market.isNonceUsed(counterparty, 150));
        assertTrue(market.isNonceUsed(counterparty, 200));
    }

    /**
     * @notice Reused nonce reverts with NonceAlreadyUsed
     */
    function test_M3_reusedNonceReverts() public {
        bytes32 condId1 = keccak256("reuse-1");
        bytes32 condId2 = keccak256("reuse-2");

        IV2Types.Pick[] memory picks1 = _createPick(abi.encode(condId1));
        IV2Types.Pick[] memory picks2 = _createPick(abi.encode(condId2));

        // First mint with nonce 42 for predictor
        IV2Types.MintRequest memory req1 = _buildMintRequest(picks1, 42, 43);
        market.mint(req1);

        // Second mint reuses predictor nonce 42
        IV2Types.MintRequest memory req2 = _buildMintRequest(picks2, 42, 44);
        vm.expectRevert(IPredictionMarketEscrow.NonceAlreadyUsed.selector);
        market.mint(req2);
    }

    /**
     * @notice Reused counterparty nonce reverts
     */
    function test_M3_reusedCounterpartyNonceReverts() public {
        bytes32 condId1 = keccak256("reuse-ctr-1");
        bytes32 condId2 = keccak256("reuse-ctr-2");

        IV2Types.Pick[] memory picks1 = _createPick(abi.encode(condId1));
        IV2Types.Pick[] memory picks2 = _createPick(abi.encode(condId2));

        IV2Types.MintRequest memory req1 = _buildMintRequest(picks1, 10, 20);
        market.mint(req1);

        // Reuse counterparty nonce 20
        IV2Types.MintRequest memory req2 = _buildMintRequest(picks2, 11, 20);
        vm.expectRevert(IPredictionMarketEscrow.NonceAlreadyUsed.selector);
        market.mint(req2);
    }

    /**
     * @notice Word boundary crossing: nonces 255 and 256 are in different words
     */
    function test_M3_wordBoundaryCrossing() public {
        bytes32 condId1 = keccak256("word-boundary-1");
        bytes32 condId2 = keccak256("word-boundary-2");

        IV2Types.Pick[] memory picks1 = _createPick(abi.encode(condId1));
        IV2Types.Pick[] memory picks2 = _createPick(abi.encode(condId2));

        // Nonce 255 is in word 0, bit 255
        // Nonce 256 is in word 1, bit 0
        IV2Types.MintRequest memory req1 = _buildMintRequest(picks1, 255, 255);
        IV2Types.MintRequest memory req2 = _buildMintRequest(picks2, 256, 256);

        market.mint(req1);
        market.mint(req2);

        assertTrue(market.isNonceUsed(predictor, 255));
        assertTrue(market.isNonceUsed(predictor, 256));
        assertTrue(market.isNonceUsed(counterparty, 255));
        assertTrue(market.isNonceUsed(counterparty, 256));

        // Verify bitmap storage: word 0 should have bit 255 set
        uint256 word0 = market.nonceBitmap(predictor, 0);
        assertEq(word0 & (1 << 255), 1 << 255);
        // Word 1 should have bit 0 set
        uint256 word1 = market.nonceBitmap(predictor, 1);
        assertEq(word1 & 1, 1);
    }

    /**
     * @notice isNonceUsed returns false for unused nonces
     */
    function test_M3_isNonceUsedFalseForUnused() public view {
        assertFalse(market.isNonceUsed(predictor, 0));
        assertFalse(market.isNonceUsed(predictor, 1));
        assertFalse(market.isNonceUsed(predictor, 999));
        assertFalse(market.isNonceUsed(predictor, type(uint256).max));
    }

    /**
     * @notice nonceBitmap returns zero for untouched words
     */
    function test_M3_nonceBitmapZeroForUntouched() public view {
        assertEq(market.nonceBitmap(predictor, 0), 0);
        assertEq(market.nonceBitmap(predictor, 1), 0);
        assertEq(market.nonceBitmap(predictor, type(uint256).max), 0);
    }

    /**
     * @notice High nonce values work without overflow
     */
    function test_M3_highNonceValues() public {
        bytes32 condId = keccak256("high-nonce");
        IV2Types.Pick[] memory picks = _createPick(abi.encode(condId));

        // Use very high nonces (near max uint256 range)
        uint256 highNonce1 = type(uint256).max - 1;
        uint256 highNonce2 = type(uint256).max;

        IV2Types.MintRequest memory req =
            _buildMintRequest(picks, highNonce1, highNonce2);
        market.mint(req);

        assertTrue(market.isNonceUsed(predictor, highNonce1));
        assertTrue(market.isNonceUsed(counterparty, highNonce2));
    }

    /**
     * @notice Same nonce value works for different accounts
     */
    function test_M3_sameNonceDifferentAccounts() public {
        bytes32 condId = keccak256("same-nonce-diff-accounts");
        IV2Types.Pick[] memory picks = _createPick(abi.encode(condId));

        // Both predictor and counterparty use nonce 7
        IV2Types.MintRequest memory req = _buildMintRequest(picks, 7, 7);
        market.mint(req);

        assertTrue(market.isNonceUsed(predictor, 7));
        assertTrue(market.isNonceUsed(counterparty, 7));
    }

    /**
     * @notice Multiple bits in the same word work independently
     */
    function test_M3_multipleBitsSameWord() public {
        bytes32 condId1 = keccak256("same-word-1");
        bytes32 condId2 = keccak256("same-word-2");
        bytes32 condId3 = keccak256("same-word-3");

        IV2Types.Pick[] memory picks1 = _createPick(abi.encode(condId1));
        IV2Types.Pick[] memory picks2 = _createPick(abi.encode(condId2));
        IV2Types.Pick[] memory picks3 = _createPick(abi.encode(condId3));

        // All in word 0 (nonces 0-255)
        market.mint(_buildMintRequest(picks1, 0, 0));
        market.mint(_buildMintRequest(picks2, 128, 128));
        market.mint(_buildMintRequest(picks3, 255, 255));

        assertTrue(market.isNonceUsed(predictor, 0));
        assertTrue(market.isNonceUsed(predictor, 128));
        assertTrue(market.isNonceUsed(predictor, 255));
        // Other bits still unused
        assertFalse(market.isNonceUsed(predictor, 1));
        assertFalse(market.isNonceUsed(predictor, 127));
        assertFalse(market.isNonceUsed(predictor, 254));
    }
}
