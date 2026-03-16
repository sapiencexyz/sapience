// SPDX-License-Identifier: MIT
pragma solidity ^0.8.19;

import "forge-std/Test.sol";
import "../src/PredictionMarketEscrow.sol";
import "../src/PredictionMarketTokenFactory.sol";
import "../src/resolvers/mocks/ManualConditionResolver.sol";
import "../src/interfaces/IV2Types.sol";
import "../src/interfaces/IPredictionMarketEscrow.sol";
import "../src/utils/IAccountFactory.sol";
import "../src/utils/SignatureValidator.sol";
import "@openzeppelin/contracts/interfaces/IERC1271.sol";
import "./mocks/MockERC20.sol";

/// @notice Mock account factory for testing
contract MockAccountFactory {
    mapping(address => mapping(uint256 => address)) private _accounts;

    function setAccount(address owner_, uint256 index, address account)
        external
    {
        _accounts[owner_][index] = account;
    }

    function getAccountAddress(address owner_, uint256 index)
        external
        view
        returns (address)
    {
        return _accounts[owner_][index];
    }
}

/// @notice Mock smart account that implements ERC-1271 (simulates Kernel's behavior)
/// The session key signs the typed data hash, and the smart account validates via isValidSignature()
contract MockSmartAccount is IERC1271 {
    /// @notice Session key authorized to sign on behalf of this account
    address public sessionKey;
    /// @notice Whether to return valid or invalid magic value (for testing rejection)
    bool public shouldReject;

    constructor(address _sessionKey) {
        sessionKey = _sessionKey;
    }

    function setSessionKey(address _sessionKey) external {
        sessionKey = _sessionKey;
    }

    function setShouldReject(bool _shouldReject) external {
        shouldReject = _shouldReject;
    }

    /// @notice ERC-1271 signature validation
    /// Simulates Kernel's behavior: recovers the signer from the signature and checks
    /// if it matches the authorized session key
    function isValidSignature(bytes32 hash, bytes memory signature)
        external
        view
        override
        returns (bytes4)
    {
        if (shouldReject) {
            return bytes4(0xffffffff);
        }

        // Recover signer from ECDSA signature
        (uint8 v, bytes32 r, bytes32 s) = _splitSignature(signature);
        address recovered = ecrecover(hash, v, r, s);

        if (recovered == sessionKey) {
            return IERC1271.isValidSignature.selector; // 0x1626ba7e
        }

        return bytes4(0xffffffff);
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

    // Allow receiving ETH/tokens
    receive() external payable { }
}

/**
 * @title SessionKeyERC1271Test
 * @notice Tests for ERC-1271 signature validation path.
 *
 * With the ERC-1271 approach, session keys sign typed data through the Kernel smart account,
 * and the escrow contract verifies via isValidSignature(). No on-chain registration needed.
 *
 * Test matrix:
 * | Predictor       | Counterparty    | Validation                                  |
 * |-----------------|-----------------|---------------------------------------------|
 * | EOA             | EOA             | ECDSA both sides (no change)                |
 * | SmartAccount    | EOA             | ERC-1271 (predictor) + ECDSA (cp)           |
 * | EOA             | SmartAccount    | ECDSA (predictor) + ERC-1271 (cp)           |
 * | SmartAccount    | SmartAccount    | ERC-1271 both sides                         |
 */
contract SessionKeyERC1271Test is Test {
    PredictionMarketEscrow public market;
    ManualConditionResolver public resolver;
    MockERC20 public collateralToken;
    MockAccountFactory public factory;

    address public admin;
    address public settler;

    // Predictor: session key + mock smart account
    uint256 public predictorSessionKeyPk;
    address public predictorSessionKey;
    MockSmartAccount public predictorSmartAccount;

    // Counterparty: session key + mock smart account
    uint256 public counterpartySessionKeyPk;
    address public counterpartySessionKey;
    MockSmartAccount public counterpartySmartAccount;

    // Pure EOA actors (no smart account)
    uint256 public eoaPredictorPk;
    address public eoaPredictor;
    uint256 public eoaCounterpartyPk;
    address public eoaCounterparty;

    // Legacy session key actors (for backward compat tests)
    uint256 public legacyOwnerPk;
    address public legacyOwner;
    uint256 public legacySessionKeyPk;
    address public legacySessionKey;
    address public legacySmartAccount;

    uint256 public constant PREDICTOR_COLLATERAL = 100e18;
    uint256 public constant COUNTERPARTY_COLLATERAL = 150e18;
    bytes32 public constant REF_CODE = keccak256("erc1271-session-key");
    bytes32 public constant CONDITION_ID =
        keccak256("ERC1271_SESSION_KEY_CONDITION");
    uint256 public constant SESSION_DURATION = 1 days;

    uint256 private _nextNonce = 1;

    function _freshNonce() internal returns (uint256) {
        return _nextNonce++;
    }

    function setUp() public {
        admin = vm.addr(1);
        settler = vm.addr(4);

        // Predictor side: session key + mock smart account
        predictorSessionKeyPk = 11;
        predictorSessionKey = vm.addr(predictorSessionKeyPk);
        predictorSmartAccount = new MockSmartAccount(predictorSessionKey);

        // Counterparty side: session key + mock smart account
        counterpartySessionKeyPk = 21;
        counterpartySessionKey = vm.addr(counterpartySessionKeyPk);
        counterpartySmartAccount = new MockSmartAccount(counterpartySessionKey);

        // Pure EOA actors
        eoaPredictorPk = 30;
        eoaPredictor = vm.addr(eoaPredictorPk);
        eoaCounterpartyPk = 31;
        eoaCounterparty = vm.addr(eoaCounterpartyPk);

        // Legacy session key actors
        legacyOwnerPk = 40;
        legacyOwner = vm.addr(legacyOwnerPk);
        legacySessionKeyPk = 41;
        legacySessionKey = vm.addr(legacySessionKeyPk);
        legacySmartAccount = address(0xDEAD);

        // Deploy factory and set account mappings
        factory = new MockAccountFactory();
        factory.setAccount(legacyOwner, 0, legacySmartAccount);

        // Deploy collateral
        collateralToken = new MockERC20("Test USDE", "USDE", 18);

        // Deploy PredictionMarketEscrow
        PredictionMarketTokenFactory tokenFactory =
            new PredictionMarketTokenFactory(admin);
        market = new PredictionMarketEscrow(
            address(collateralToken), admin, address(tokenFactory)
        );
        vm.startPrank(admin);
        tokenFactory.setDeployer(address(market));
        market.setAccountFactory(address(factory));
        vm.stopPrank();

        // Deploy resolver
        vm.startPrank(admin);
        resolver = new ManualConditionResolver(admin);
        resolver.approveSettler(settler);
        vm.stopPrank();

        // Fund all accounts
        collateralToken.mint(address(predictorSmartAccount), 1_000_000e18);
        collateralToken.mint(address(counterpartySmartAccount), 1_000_000e18);
        collateralToken.mint(eoaPredictor, 1_000_000e18);
        collateralToken.mint(eoaCounterparty, 1_000_000e18);
        collateralToken.mint(legacySmartAccount, 1_000_000e18);

        vm.prank(address(predictorSmartAccount));
        collateralToken.approve(address(market), type(uint256).max);
        vm.prank(address(counterpartySmartAccount));
        collateralToken.approve(address(market), type(uint256).max);
        vm.prank(eoaPredictor);
        collateralToken.approve(address(market), type(uint256).max);
        vm.prank(eoaCounterparty);
        collateralToken.approve(address(market), type(uint256).max);
        vm.prank(legacySmartAccount);
        collateralToken.approve(address(market), type(uint256).max);
    }

    // ============ Helpers ============

    function _signMintApproval(
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

    function _signBurnApproval(
        bytes32 burnHash,
        address signer,
        uint256 tokenAmount,
        uint256 payout,
        uint256 nonce,
        uint256 deadline,
        uint256 pk
    ) internal view returns (bytes memory) {
        bytes32 approvalHash = market.getBurnApprovalHash(
            burnHash, signer, tokenAmount, payout, nonce, deadline
        );
        (uint8 v, bytes32 r, bytes32 s) = vm.sign(pk, approvalHash);
        return abi.encodePacked(r, s, v);
    }

    function _createPicks() internal view returns (IV2Types.Pick[] memory) {
        IV2Types.Pick[] memory picks = new IV2Types.Pick[](1);
        picks[0] = IV2Types.Pick({
            conditionResolver: address(resolver),
            conditionId: abi.encode(CONDITION_ID),
            predictedOutcome: IV2Types.OutcomeSide.YES
        });
        return picks;
    }

    function _computePredictionHash(
        IV2Types.Pick[] memory picks,
        address predictor,
        address counterparty_
    ) internal pure returns (bytes32) {
        bytes32 pickConfigId = keccak256(abi.encode(picks));
        return keccak256(
            abi.encode(
                pickConfigId,
                PREDICTOR_COLLATERAL,
                COUNTERPARTY_COLLATERAL,
                predictor,
                counterparty_,
                address(0),
                ""
            )
        );
    }

    function _buildMintRequest(
        address predictor,
        address counterparty_,
        uint256 predictorPk,
        uint256 counterpartyPk_,
        bytes memory predictorSessionKeyData,
        bytes memory counterpartySessionKeyData
    ) internal returns (IV2Types.MintRequest memory request) {
        IV2Types.Pick[] memory picks = _createPicks();
        bytes32 predictionHash =
            _computePredictionHash(picks, predictor, counterparty_);

        uint256 pNonce = _freshNonce();
        uint256 cNonce = _freshNonce();
        uint256 deadline = block.timestamp + 1 hours;

        request.picks = picks;
        request.predictorCollateral = PREDICTOR_COLLATERAL;
        request.counterpartyCollateral = COUNTERPARTY_COLLATERAL;
        request.predictor = predictor;
        request.counterparty = counterparty_;
        request.predictorNonce = pNonce;
        request.counterpartyNonce = cNonce;
        request.predictorDeadline = deadline;
        request.counterpartyDeadline = deadline;
        request.predictorSignature = _signMintApproval(
            predictionHash,
            predictor,
            PREDICTOR_COLLATERAL,
            pNonce,
            deadline,
            predictorPk
        );
        request.counterpartySignature = _signMintApproval(
            predictionHash,
            counterparty_,
            COUNTERPARTY_COLLATERAL,
            cNonce,
            deadline,
            counterpartyPk_
        );
        request.refCode = REF_CODE;
        request.predictorSessionKeyData = predictorSessionKeyData;
        request.counterpartySessionKeyData = counterpartySessionKeyData;
        request.predictorSponsor = address(0);
        request.predictorSponsorData = "";
    }

    /// @dev Helper to mint a prediction and return the pickConfigId for burn testing
    function _mintAndGetPickConfigId(
        address predictor,
        address counterparty_,
        uint256 predictorPk,
        uint256 counterpartyPk_,
        bytes memory predictorSessionKeyData,
        bytes memory counterpartySessionKeyData
    ) internal returns (bytes32 pickConfigId) {
        IV2Types.MintRequest memory request = _buildMintRequest(
            predictor,
            counterparty_,
            predictorPk,
            counterpartyPk_,
            predictorSessionKeyData,
            counterpartySessionKeyData
        );

        (,, address counterpartyToken) = market.mint(request);
        pickConfigId = keccak256(abi.encode(request.picks));
        counterpartyToken;
    }

    struct BurnParams {
        bytes32 pickConfigId;
        address predictorHolder;
        address counterpartyHolder;
        uint256 predictorPk;
        uint256 counterpartyPk;
        bytes predictorSessionKeyData;
        bytes counterpartySessionKeyData;
    }

    function _buildBurnRequest(BurnParams memory p)
        internal
        returns (IV2Types.BurnRequest memory request)
    {
        uint256 totalTokens =
            PREDICTOR_COLLATERAL + COUNTERPARTY_COLLATERAL;

        bytes32 burnHash = keccak256(
            abi.encode(
                p.pickConfigId,
                totalTokens,
                totalTokens,
                p.predictorHolder,
                p.counterpartyHolder,
                PREDICTOR_COLLATERAL,
                COUNTERPARTY_COLLATERAL
            )
        );

        uint256 pNonce = _freshNonce();
        uint256 cNonce = _freshNonce();
        uint256 deadline = block.timestamp + 1 hours;

        request.pickConfigId = p.pickConfigId;
        request.predictorTokenAmount = totalTokens;
        request.counterpartyTokenAmount = totalTokens;
        request.predictorHolder = p.predictorHolder;
        request.counterpartyHolder = p.counterpartyHolder;
        request.predictorPayout = PREDICTOR_COLLATERAL;
        request.counterpartyPayout = COUNTERPARTY_COLLATERAL;
        request.predictorNonce = pNonce;
        request.counterpartyNonce = cNonce;
        request.predictorDeadline = deadline;
        request.counterpartyDeadline = deadline;
        request.predictorSignature = _signBurnApproval(
            burnHash,
            p.predictorHolder,
            totalTokens,
            PREDICTOR_COLLATERAL,
            pNonce,
            deadline,
            p.predictorPk
        );
        request.counterpartySignature = _signBurnApproval(
            burnHash,
            p.counterpartyHolder,
            totalTokens,
            COUNTERPARTY_COLLATERAL,
            cNonce,
            deadline,
            p.counterpartyPk
        );
        request.refCode = REF_CODE;
        request.predictorSessionKeyData = p.predictorSessionKeyData;
        request.counterpartySessionKeyData = p.counterpartySessionKeyData;
    }

    // Helper for legacy SessionKeyData (for backward compat tests)
    function _createLegacySessionKeyData(
        address skAddr,
        address owner,
        address smartAccount,
        bytes32 permissionsHash
    ) internal view returns (bytes memory) {
        uint256 validUntil =
            block.timestamp + SESSION_DURATION;

        bytes32 sessionApprovalHash = market.getSessionKeyApprovalHash(
            skAddr, smartAccount, validUntil, permissionsHash, block.chainid
        );
        (uint8 v, bytes32 r, bytes32 s) =
            vm.sign(legacyOwnerPk, sessionApprovalHash);
        bytes memory ownerSig = abi.encodePacked(r, s, v);

        IV2Types.SessionKeyData memory skData = IV2Types.SessionKeyData({
            sessionKey: skAddr,
            owner: owner,
            validUntil: validUntil,
            permissionsHash: permissionsHash,
            chainId: block.chainid,
            ownerSignature: ownerSig
        });

        return abi.encode(skData);
    }

    // ============ Mint Matrix Tests (ERC-1271) ============

    function test_mint_EOA_EOA() public {
        IV2Types.MintRequest memory request = _buildMintRequest(
            eoaPredictor,
            eoaCounterparty,
            eoaPredictorPk,
            eoaCounterpartyPk,
            "", // no session key data
            "" // no session key data
        );

        (bytes32 predictionId,,) = market.mint(request);
        assertNotEq(predictionId, bytes32(0));
    }

    function test_mint_SmartAccount_EOA() public {
        // Session key signs for the predictor smart account
        // Contract verifies via ERC-1271 on the smart account (no session key data needed)
        IV2Types.MintRequest memory request = _buildMintRequest(
            address(predictorSmartAccount),
            eoaCounterparty,
            predictorSessionKeyPk, // session key signs
            eoaCounterpartyPk,
            "", // empty = ERC-1271 path
            "" // EOA counterparty
        );

        (bytes32 predictionId,,) = market.mint(request);
        assertNotEq(predictionId, bytes32(0));
    }

    function test_mint_EOA_SmartAccount() public {
        // Session key signs for the counterparty smart account
        IV2Types.MintRequest memory request = _buildMintRequest(
            eoaPredictor,
            address(counterpartySmartAccount),
            eoaPredictorPk,
            counterpartySessionKeyPk, // session key signs
            "", // EOA predictor
            "" // empty = ERC-1271 path
        );

        (bytes32 predictionId,,) = market.mint(request);
        assertNotEq(predictionId, bytes32(0));
    }

    function test_mint_SmartAccount_SmartAccount() public {
        // Both sides use ERC-1271
        IV2Types.MintRequest memory request = _buildMintRequest(
            address(predictorSmartAccount),
            address(counterpartySmartAccount),
            predictorSessionKeyPk,
            counterpartySessionKeyPk,
            "", // ERC-1271
            "" // ERC-1271
        );

        (bytes32 predictionId,,) = market.mint(request);
        assertNotEq(predictionId, bytes32(0));
    }

    // ============ Mint Negative Tests (ERC-1271) ============

    function test_mint_ERC1271_rejection_reverts() public {
        // Smart account rejects the signature
        predictorSmartAccount.setShouldReject(true);

        IV2Types.MintRequest memory request = _buildMintRequest(
            address(predictorSmartAccount),
            eoaCounterparty,
            predictorSessionKeyPk,
            eoaCounterpartyPk,
            "",
            ""
        );

        vm.expectRevert(
            IPredictionMarketEscrow.InvalidPredictorSignature.selector
        );
        market.mint(request);
    }

    function test_mint_wrongSessionKey_ERC1271_reverts() public {
        // Use counterparty session key to sign for predictor smart account
        // The smart account only authorizes predictorSessionKey, so ERC-1271 should fail
        IV2Types.MintRequest memory request = _buildMintRequest(
            address(predictorSmartAccount),
            eoaCounterparty,
            counterpartySessionKeyPk, // WRONG key signs for predictor
            eoaCounterpartyPk,
            "",
            ""
        );

        vm.expectRevert(
            IPredictionMarketEscrow.InvalidPredictorSignature.selector
        );
        market.mint(request);
    }

    function test_mint_expiredDeadline_reverts() public {
        IV2Types.Pick[] memory picks = _createPicks();
        bytes32 predictionHash = _computePredictionHash(
            picks, address(predictorSmartAccount), eoaCounterparty
        );

        uint256 pNonce = _freshNonce();
        uint256 cNonce = _freshNonce();
        uint256 deadline = block.timestamp + 1 hours;

        IV2Types.MintRequest memory request;
        request.picks = picks;
        request.predictorCollateral = PREDICTOR_COLLATERAL;
        request.counterpartyCollateral = COUNTERPARTY_COLLATERAL;
        request.predictor = address(predictorSmartAccount);
        request.counterparty = eoaCounterparty;
        request.predictorNonce = pNonce;
        request.counterpartyNonce = cNonce;
        request.predictorDeadline = deadline;
        request.counterpartyDeadline = deadline;
        request.predictorSignature = _signMintApproval(
            predictionHash,
            address(predictorSmartAccount),
            PREDICTOR_COLLATERAL,
            pNonce,
            deadline,
            predictorSessionKeyPk
        );
        request.counterpartySignature = _signMintApproval(
            predictionHash,
            eoaCounterparty,
            COUNTERPARTY_COLLATERAL,
            cNonce,
            deadline,
            eoaCounterpartyPk
        );
        request.refCode = REF_CODE;
        request.predictorSessionKeyData = "";
        request.counterpartySessionKeyData = "";
        request.predictorSponsor = address(0);
        request.predictorSponsorData = "";

        // Warp past deadline
        vm.warp(deadline + 1);

        vm.expectRevert(
            IPredictionMarketEscrow.InvalidPredictorSignature.selector
        );
        market.mint(request);
    }

    // ============ Backward Compatibility Tests ============

    function test_mint_legacySessionKeyData_stillWorks() public {
        // Use legacy format (full SessionKeyApproval) — should still work
        bytes memory legacyData = _createLegacySessionKeyData(
            legacySessionKey, legacyOwner, legacySmartAccount, keccak256("MINT")
        );

        IV2Types.MintRequest memory request = _buildMintRequest(
            legacySmartAccount,
            eoaCounterparty,
            legacySessionKeyPk,
            eoaCounterpartyPk,
            legacyData,
            ""
        );

        (bytes32 predictionId,,) = market.mint(request);
        assertNotEq(predictionId, bytes32(0));
    }

    function test_mint_mixedFormats_ERC1271_and_legacy() public {
        // Predictor uses ERC-1271, counterparty uses legacy session key format
        bytes memory legacyData = _createLegacySessionKeyData(
            legacySessionKey, legacyOwner, legacySmartAccount, keccak256("MINT")
        );

        IV2Types.MintRequest memory request = _buildMintRequest(
            address(predictorSmartAccount),
            legacySmartAccount,
            predictorSessionKeyPk,
            legacySessionKeyPk,
            "", // ERC-1271
            legacyData // legacy
        );

        (bytes32 predictionId,,) = market.mint(request);
        assertNotEq(predictionId, bytes32(0));
    }

    function test_mint_mixedFormats_legacy_and_ERC1271() public {
        // Predictor uses legacy, counterparty uses ERC-1271
        bytes memory legacyData = _createLegacySessionKeyData(
            legacySessionKey, legacyOwner, legacySmartAccount, keccak256("MINT")
        );

        IV2Types.MintRequest memory request = _buildMintRequest(
            legacySmartAccount,
            address(counterpartySmartAccount),
            legacySessionKeyPk,
            counterpartySessionKeyPk,
            legacyData, // legacy
            "" // ERC-1271
        );

        (bytes32 predictionId,,) = market.mint(request);
        assertNotEq(predictionId, bytes32(0));
    }

    // ============ Burn Matrix Tests (ERC-1271) ============

    function test_burn_EOA_EOA() public {
        bytes32 pickConfigId = _mintAndGetPickConfigId(
            eoaPredictor,
            eoaCounterparty,
            eoaPredictorPk,
            eoaCounterpartyPk,
            "",
            ""
        );

        IV2Types.BurnRequest memory request = _buildBurnRequest(
            BurnParams({
                pickConfigId: pickConfigId,
                predictorHolder: eoaPredictor,
                counterpartyHolder: eoaCounterparty,
                predictorPk: eoaPredictorPk,
                counterpartyPk: eoaCounterpartyPk,
                predictorSessionKeyData: "",
                counterpartySessionKeyData: ""
            })
        );

        market.burn(request);
    }

    function test_burn_SmartAccount_EOA() public {
        // Mint with ERC-1271 predictor
        bytes32 pickConfigId = _mintAndGetPickConfigId(
            address(predictorSmartAccount),
            eoaCounterparty,
            predictorSessionKeyPk,
            eoaCounterpartyPk,
            "",
            ""
        );

        IV2Types.BurnRequest memory request = _buildBurnRequest(
            BurnParams({
                pickConfigId: pickConfigId,
                predictorHolder: address(predictorSmartAccount),
                counterpartyHolder: eoaCounterparty,
                predictorPk: predictorSessionKeyPk,
                counterpartyPk: eoaCounterpartyPk,
                predictorSessionKeyData: "",
                counterpartySessionKeyData: ""
            })
        );

        market.burn(request);
    }

    function test_burn_EOA_SmartAccount() public {
        bytes32 pickConfigId = _mintAndGetPickConfigId(
            eoaPredictor,
            address(counterpartySmartAccount),
            eoaPredictorPk,
            counterpartySessionKeyPk,
            "",
            ""
        );

        IV2Types.BurnRequest memory request = _buildBurnRequest(
            BurnParams({
                pickConfigId: pickConfigId,
                predictorHolder: eoaPredictor,
                counterpartyHolder: address(counterpartySmartAccount),
                predictorPk: eoaPredictorPk,
                counterpartyPk: counterpartySessionKeyPk,
                predictorSessionKeyData: "",
                counterpartySessionKeyData: ""
            })
        );

        market.burn(request);
    }

    function test_burn_SmartAccount_SmartAccount() public {
        bytes32 pickConfigId = _mintAndGetPickConfigId(
            address(predictorSmartAccount),
            address(counterpartySmartAccount),
            predictorSessionKeyPk,
            counterpartySessionKeyPk,
            "",
            ""
        );

        IV2Types.BurnRequest memory request = _buildBurnRequest(
            BurnParams({
                pickConfigId: pickConfigId,
                predictorHolder: address(predictorSmartAccount),
                counterpartyHolder: address(counterpartySmartAccount),
                predictorPk: predictorSessionKeyPk,
                counterpartyPk: counterpartySessionKeyPk,
                predictorSessionKeyData: "",
                counterpartySessionKeyData: ""
            })
        );

        market.burn(request);
    }

    // ============ Burn Negative Tests ============

    function test_burn_ERC1271_rejection_reverts() public {
        // First mint successfully
        bytes32 pickConfigId = _mintAndGetPickConfigId(
            address(predictorSmartAccount),
            eoaCounterparty,
            predictorSessionKeyPk,
            eoaCounterpartyPk,
            "",
            ""
        );

        // Now reject for burn
        predictorSmartAccount.setShouldReject(true);

        IV2Types.BurnRequest memory request = _buildBurnRequest(
            BurnParams({
                pickConfigId: pickConfigId,
                predictorHolder: address(predictorSmartAccount),
                counterpartyHolder: eoaCounterparty,
                predictorPk: predictorSessionKeyPk,
                counterpartyPk: eoaCounterpartyPk,
                predictorSessionKeyData: "",
                counterpartySessionKeyData: ""
            })
        );

        vm.expectRevert(
            IPredictionMarketEscrow.InvalidPredictorSignature.selector
        );
        market.burn(request);
    }

    // ============ Revocation Tests ============

    function test_revocation_worksWithEOA() public {
        // Revoke a session key (generic mechanism, works for any signing approach)
        vm.prank(eoaPredictor);
        market.revokeSessionKey(address(0x1234));

        assertTrue(market.isSessionKeyRevoked(eoaPredictor, address(0x1234)));
    }

    function test_revocation_worksWithSmartAccount() public {
        // Smart account can also revoke session keys
        vm.prank(address(predictorSmartAccount));
        market.revokeSessionKey(predictorSessionKey);

        assertTrue(
            market.isSessionKeyRevoked(
                address(predictorSmartAccount), predictorSessionKey
            )
        );
    }
}
