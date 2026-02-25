// SPDX-License-Identifier: MIT
pragma solidity ^0.8.19;

import "forge-std/Test.sol";
import "../../src/v2/PredictionMarketEscrow.sol";
import "../../src/v2/PredictionMarketTokenFactory.sol";
import "../../src/v2/resolvers/mocks/ManualConditionResolver.sol";
import "../../src/v2/interfaces/IV2Types.sol";
import "../../src/v2/interfaces/IPredictionMarketEscrow.sol";
import "../../src/v2/utils/IAccountFactory.sol";
import "../../src/v2/utils/SignatureValidator.sol";
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

/**
 * @title SessionKeyRegistrationTest
 * @notice Tests for on-chain session key registration and validation.
 *
 * Tests the full compatibility matrix:
 * | Predictor   | Counterparty | Validation                              |
 * |-------------|-------------|------------------------------------------|
 * | EOA         | EOA         | ECDSA both sides (no change)             |
 * | Session     | EOA         | On-chain reg (predictor) + ECDSA (cp)    |
 * | EOA         | Session     | ECDSA (predictor) + On-chain reg (cp)    |
 * | Session     | Session     | On-chain reg both sides                  |
 */
contract SessionKeyRegistrationTest is Test {
    PredictionMarketEscrow public market;
    ManualConditionResolver public resolver;
    MockERC20 public collateralToken;
    MockAccountFactory public factory;

    address public admin;
    address public settler;

    // Predictor: EOA owner + session key + smart account
    uint256 public predictorOwnerPk;
    address public predictorOwner;
    uint256 public predictorSessionKeyPk;
    address public predictorSessionKey;
    address public predictorSmartAccount;

    // Counterparty: EOA owner + session key + smart account
    uint256 public counterpartyOwnerPk;
    address public counterpartyOwner;
    uint256 public counterpartySessionKeyPk;
    address public counterpartySessionKey;
    address public counterpartySmartAccount;

    // Pure EOA actors (no smart account)
    uint256 public eoaPredictorPk;
    address public eoaPredictor;
    uint256 public eoaCounterpartyPk;
    address public eoaCounterparty;

    uint256 public constant PREDICTOR_COLLATERAL = 100e18;
    uint256 public constant COUNTERPARTY_COLLATERAL = 150e18;
    bytes32 public constant REF_CODE = keccak256("session-key-registration");
    bytes32 public constant CONDITION_ID =
        keccak256("SESSION_KEY_REGISTRATION_CONDITION");
    uint256 public constant SESSION_DURATION = 1 days;

    uint256 private _nextNonce = 1;

    function _freshNonce() internal returns (uint256) {
        return _nextNonce++;
    }

    function setUp() public {
        admin = vm.addr(1);
        settler = vm.addr(4);

        // Predictor side
        predictorOwnerPk = 10;
        predictorOwner = vm.addr(predictorOwnerPk);
        predictorSessionKeyPk = 11;
        predictorSessionKey = vm.addr(predictorSessionKeyPk);
        predictorSmartAccount = address(0xBEEF);

        // Counterparty side
        counterpartyOwnerPk = 20;
        counterpartyOwner = vm.addr(counterpartyOwnerPk);
        counterpartySessionKeyPk = 21;
        counterpartySessionKey = vm.addr(counterpartySessionKeyPk);
        counterpartySmartAccount = address(0xCAFE);

        // Pure EOA actors
        eoaPredictorPk = 30;
        eoaPredictor = vm.addr(eoaPredictorPk);
        eoaCounterpartyPk = 31;
        eoaCounterparty = vm.addr(eoaCounterpartyPk);

        // Deploy factory and set account mappings
        factory = new MockAccountFactory();
        factory.setAccount(predictorOwner, 0, predictorSmartAccount);
        factory.setAccount(counterpartyOwner, 0, counterpartySmartAccount);

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
        collateralToken.mint(predictorSmartAccount, 1_000_000e18);
        collateralToken.mint(counterpartySmartAccount, 1_000_000e18);
        collateralToken.mint(eoaPredictor, 1_000_000e18);
        collateralToken.mint(eoaCounterparty, 1_000_000e18);

        vm.prank(predictorSmartAccount);
        collateralToken.approve(address(market), type(uint256).max);
        vm.prank(counterpartySmartAccount);
        collateralToken.approve(address(market), type(uint256).max);
        vm.prank(eoaPredictor);
        collateralToken.approve(address(market), type(uint256).max);
        vm.prank(eoaCounterparty);
        collateralToken.approve(address(market), type(uint256).max);
    }

    // ============ Helpers ============

    function _registerSessionKey(
        address smartAccount,
        address sessionKey,
        address owner,
        uint256 validUntil
    ) internal {
        vm.prank(smartAccount);
        market.registerSessionKey(sessionKey, owner, validUntil);
    }

    function _buildRegisteredSessionKeyData(address sessionKeyAddr)
        internal
        pure
        returns (bytes memory)
    {
        return abi.encode(sessionKeyAddr);
    }

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
            conditionId: CONDITION_ID,
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
                counterparty_
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
        bytes32 predictionHash = _computePredictionHash(picks, predictor, counterparty_);

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
            predictionHash, predictor, PREDICTOR_COLLATERAL, pNonce, deadline, predictorPk
        );
        request.counterpartySignature = _signMintApproval(
            predictionHash, counterparty_, COUNTERPARTY_COLLATERAL, cNonce, deadline, counterpartyPk_
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
        // Derive pickConfigId from the picks
        pickConfigId = keccak256(abi.encode(request.picks));
        // We don't actually need counterpartyToken, just avoid unused warning
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
        uint256 totalTokens = PREDICTOR_COLLATERAL + COUNTERPARTY_COLLATERAL;

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
            burnHash, p.predictorHolder, totalTokens, PREDICTOR_COLLATERAL, pNonce, deadline, p.predictorPk
        );
        request.counterpartySignature = _signBurnApproval(
            burnHash, p.counterpartyHolder, totalTokens, COUNTERPARTY_COLLATERAL, cNonce, deadline, p.counterpartyPk
        );
        request.refCode = REF_CODE;
        request.predictorSessionKeyData = p.predictorSessionKeyData;
        request.counterpartySessionKeyData = p.counterpartySessionKeyData;
    }

    // Helper for legacy SessionKeyData (for backward compat tests)
    function _createLegacySessionKeyData(
        uint256 skPk,
        address skAddr,
        address owner,
        address smartAccount
    ) internal view returns (bytes memory) {
        uint256 validUntil = block.timestamp + SESSION_DURATION;
        bytes32 permissionsHash = keccak256("MINT");

        bytes32 sessionApprovalHash = market.getSessionKeyApprovalHash(
            skAddr, smartAccount, validUntil, permissionsHash, block.chainid
        );
        (uint8 v, bytes32 r, bytes32 s) = vm.sign(
            // Owner PK - need to resolve which one
            _getOwnerPk(owner),
            sessionApprovalHash
        );
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

    function _getOwnerPk(address owner) internal view returns (uint256) {
        if (owner == predictorOwner) return predictorOwnerPk;
        if (owner == counterpartyOwner) return counterpartyOwnerPk;
        revert("Unknown owner");
    }

    // ============ Registration Tests ============

    function test_registerSessionKey_success() public {
        uint256 validUntil = block.timestamp + SESSION_DURATION;

        _registerSessionKey(predictorSmartAccount, predictorSessionKey, predictorOwner, validUntil);

        assertTrue(market.isSessionKeyRegistered(predictorSmartAccount, predictorSessionKey));
    }

    function test_registerSessionKey_emitsEvent() public {
        uint256 validUntil = block.timestamp + SESSION_DURATION;

        vm.expectEmit(true, true, true, true);
        emit SignatureValidator.SessionKeyRegistered(
            predictorSmartAccount, predictorSessionKey, predictorOwner, validUntil
        );

        vm.prank(predictorSmartAccount);
        market.registerSessionKey(predictorSessionKey, predictorOwner, validUntil);
    }

    function test_registerSessionKey_overwrite() public {
        uint256 validUntil1 = block.timestamp + 1 hours;
        uint256 validUntil2 = block.timestamp + 2 days;

        _registerSessionKey(predictorSmartAccount, predictorSessionKey, predictorOwner, validUntil1);
        assertTrue(market.isSessionKeyRegistered(predictorSmartAccount, predictorSessionKey));

        // Overwrite with longer duration
        _registerSessionKey(predictorSmartAccount, predictorSessionKey, predictorOwner, validUntil2);
        assertTrue(market.isSessionKeyRegistered(predictorSmartAccount, predictorSessionKey));

        // Warp past first validUntil but before second — should still be valid
        vm.warp(block.timestamp + 1 hours + 1);
        assertTrue(market.isSessionKeyRegistered(predictorSmartAccount, predictorSessionKey));
    }

    function test_isSessionKeyRegistered_expired() public {
        uint256 validUntil = block.timestamp + 1 hours;

        _registerSessionKey(predictorSmartAccount, predictorSessionKey, predictorOwner, validUntil);
        assertTrue(market.isSessionKeyRegistered(predictorSmartAccount, predictorSessionKey));

        vm.warp(validUntil + 1);
        assertFalse(market.isSessionKeyRegistered(predictorSmartAccount, predictorSessionKey));
    }

    function test_isSessionKeyRegistered_revoked() public {
        uint256 validUntil = block.timestamp + SESSION_DURATION;

        _registerSessionKey(predictorSmartAccount, predictorSessionKey, predictorOwner, validUntil);
        assertTrue(market.isSessionKeyRegistered(predictorSmartAccount, predictorSessionKey));

        // Owner revokes
        vm.prank(predictorOwner);
        market.revokeSessionKey(predictorSessionKey);
        assertFalse(market.isSessionKeyRegistered(predictorSmartAccount, predictorSessionKey));
    }

    function test_isSessionKeyRegistered_revokedFromSmartAccount() public {
        uint256 validUntil = block.timestamp + SESSION_DURATION;

        _registerSessionKey(predictorSmartAccount, predictorSessionKey, predictorOwner, validUntil);
        assertTrue(market.isSessionKeyRegistered(predictorSmartAccount, predictorSessionKey));

        // Smart account revokes
        vm.prank(predictorSmartAccount);
        market.revokeSessionKey(predictorSessionKey);
        assertFalse(market.isSessionKeyRegistered(predictorSmartAccount, predictorSessionKey));
    }

    function test_registerSessionKey_wrongOwner_reverts() public {
        uint256 validUntil = block.timestamp + SESSION_DURATION;

        // Try to register with wrong owner (counterpartyOwner doesn't own predictorSmartAccount)
        vm.prank(predictorSmartAccount);
        vm.expectRevert();
        market.registerSessionKey(predictorSessionKey, counterpartyOwner, validUntil);
    }

    // ============ Mint Matrix Tests ============

    function test_mint_EOA_EOA() public {
        IV2Types.MintRequest memory request = _buildMintRequest(
            eoaPredictor,
            eoaCounterparty,
            eoaPredictorPk,
            eoaCounterpartyPk,
            "",  // no session key data
            ""   // no session key data
        );

        (bytes32 predictionId,,) = market.mint(request);
        assertNotEq(predictionId, bytes32(0));
    }

    function test_mint_Session_EOA() public {
        // Register predictor session key
        _registerSessionKey(
            predictorSmartAccount, predictorSessionKey, predictorOwner,
            block.timestamp + SESSION_DURATION
        );

        IV2Types.MintRequest memory request = _buildMintRequest(
            predictorSmartAccount,
            eoaCounterparty,
            predictorSessionKeyPk,  // session key signs for predictor
            eoaCounterpartyPk,
            _buildRegisteredSessionKeyData(predictorSessionKey),
            ""  // EOA counterparty
        );

        (bytes32 predictionId,,) = market.mint(request);
        assertNotEq(predictionId, bytes32(0));
    }

    function test_mint_EOA_Session() public {
        // Register counterparty session key
        _registerSessionKey(
            counterpartySmartAccount, counterpartySessionKey, counterpartyOwner,
            block.timestamp + SESSION_DURATION
        );

        IV2Types.MintRequest memory request = _buildMintRequest(
            eoaPredictor,
            counterpartySmartAccount,
            eoaPredictorPk,
            counterpartySessionKeyPk,  // session key signs for counterparty
            "",  // EOA predictor
            _buildRegisteredSessionKeyData(counterpartySessionKey)
        );

        (bytes32 predictionId,,) = market.mint(request);
        assertNotEq(predictionId, bytes32(0));
    }

    function test_mint_Session_Session() public {
        // Register both session keys
        _registerSessionKey(
            predictorSmartAccount, predictorSessionKey, predictorOwner,
            block.timestamp + SESSION_DURATION
        );
        _registerSessionKey(
            counterpartySmartAccount, counterpartySessionKey, counterpartyOwner,
            block.timestamp + SESSION_DURATION
        );

        IV2Types.MintRequest memory request = _buildMintRequest(
            predictorSmartAccount,
            counterpartySmartAccount,
            predictorSessionKeyPk,
            counterpartySessionKeyPk,
            _buildRegisteredSessionKeyData(predictorSessionKey),
            _buildRegisteredSessionKeyData(counterpartySessionKey)
        );

        (bytes32 predictionId,,) = market.mint(request);
        assertNotEq(predictionId, bytes32(0));
    }

    // ============ Mint Negative Tests ============

    function test_mint_unregisteredSessionKey_reverts() public {
        // Don't register — should fail
        IV2Types.MintRequest memory request = _buildMintRequest(
            predictorSmartAccount,
            eoaCounterparty,
            predictorSessionKeyPk,
            eoaCounterpartyPk,
            _buildRegisteredSessionKeyData(predictorSessionKey),
            ""
        );

        vm.expectRevert(IPredictionMarketEscrow.InvalidSignature.selector);
        market.mint(request);
    }

    function test_mint_expiredRegistration_reverts() public {
        uint256 validUntil = block.timestamp + 1 hours;
        _registerSessionKey(
            predictorSmartAccount, predictorSessionKey, predictorOwner, validUntil
        );

        // Warp past expiration
        vm.warp(validUntil + 1);

        IV2Types.MintRequest memory request = _buildMintRequest(
            predictorSmartAccount,
            eoaCounterparty,
            predictorSessionKeyPk,
            eoaCounterpartyPk,
            _buildRegisteredSessionKeyData(predictorSessionKey),
            ""
        );

        vm.expectRevert(IPredictionMarketEscrow.InvalidSignature.selector);
        market.mint(request);
    }

    function test_mint_revokedRegisteredKey_reverts() public {
        _registerSessionKey(
            predictorSmartAccount, predictorSessionKey, predictorOwner,
            block.timestamp + SESSION_DURATION
        );

        // Owner revokes after registration
        vm.prank(predictorOwner);
        market.revokeSessionKey(predictorSessionKey);

        IV2Types.MintRequest memory request = _buildMintRequest(
            predictorSmartAccount,
            eoaCounterparty,
            predictorSessionKeyPk,
            eoaCounterpartyPk,
            _buildRegisteredSessionKeyData(predictorSessionKey),
            ""
        );

        vm.expectRevert(IPredictionMarketEscrow.InvalidSignature.selector);
        market.mint(request);
    }

    function test_mint_revokedFromSmartAccount_reverts() public {
        _registerSessionKey(
            predictorSmartAccount, predictorSessionKey, predictorOwner,
            block.timestamp + SESSION_DURATION
        );

        // Smart account revokes
        vm.prank(predictorSmartAccount);
        market.revokeSessionKey(predictorSessionKey);

        IV2Types.MintRequest memory request = _buildMintRequest(
            predictorSmartAccount,
            eoaCounterparty,
            predictorSessionKeyPk,
            eoaCounterpartyPk,
            _buildRegisteredSessionKeyData(predictorSessionKey),
            ""
        );

        vm.expectRevert(IPredictionMarketEscrow.InvalidSignature.selector);
        market.mint(request);
    }

    function test_mint_wrongSessionKeySigner_reverts() public {
        _registerSessionKey(
            predictorSmartAccount, predictorSessionKey, predictorOwner,
            block.timestamp + SESSION_DURATION
        );

        // Use counterparty session key PK to sign, but claim predictor session key address
        IV2Types.MintRequest memory request = _buildMintRequest(
            predictorSmartAccount,
            eoaCounterparty,
            counterpartySessionKeyPk,  // WRONG key signs
            eoaCounterpartyPk,
            _buildRegisteredSessionKeyData(predictorSessionKey),  // claims predictor session key
            ""
        );

        vm.expectRevert(IPredictionMarketEscrow.InvalidSignature.selector);
        market.mint(request);
    }

    // ============ Backward Compatibility Tests ============

    function test_mint_legacySessionKeyData_stillWorks() public {
        // Use legacy format (full SessionKeyApproval) — should still work
        bytes memory legacyData = _createLegacySessionKeyData(
            predictorSessionKeyPk, predictorSessionKey, predictorOwner, predictorSmartAccount
        );

        IV2Types.MintRequest memory request = _buildMintRequest(
            predictorSmartAccount,
            eoaCounterparty,
            predictorSessionKeyPk,
            eoaCounterpartyPk,
            legacyData,
            ""
        );

        (bytes32 predictionId,,) = market.mint(request);
        assertNotEq(predictionId, bytes32(0));
    }

    function test_mint_mixedFormats() public {
        // Predictor uses new registered format, counterparty uses legacy format
        _registerSessionKey(
            predictorSmartAccount, predictorSessionKey, predictorOwner,
            block.timestamp + SESSION_DURATION
        );

        bytes memory legacyData = _createLegacySessionKeyData(
            counterpartySessionKeyPk, counterpartySessionKey, counterpartyOwner, counterpartySmartAccount
        );

        IV2Types.MintRequest memory request = _buildMintRequest(
            predictorSmartAccount,
            counterpartySmartAccount,
            predictorSessionKeyPk,
            counterpartySessionKeyPk,
            _buildRegisteredSessionKeyData(predictorSessionKey),
            legacyData
        );

        (bytes32 predictionId,,) = market.mint(request);
        assertNotEq(predictionId, bytes32(0));
    }

    // ============ Burn Matrix Tests ============

    function test_burn_EOA_EOA() public {
        // First mint with EOA×EOA
        bytes32 pickConfigId = _mintAndGetPickConfigId(
            eoaPredictor, eoaCounterparty, eoaPredictorPk, eoaCounterpartyPk, "", ""
        );

        IV2Types.BurnRequest memory request = _buildBurnRequest(BurnParams({
            pickConfigId: pickConfigId,
            predictorHolder: eoaPredictor,
            counterpartyHolder: eoaCounterparty,
            predictorPk: eoaPredictorPk,
            counterpartyPk: eoaCounterpartyPk,
            predictorSessionKeyData: "",
            counterpartySessionKeyData: ""
        }));

        market.burn(request);
    }

    function test_burn_Session_EOA() public {
        // Register predictor session key
        _registerSessionKey(
            predictorSmartAccount, predictorSessionKey, predictorOwner,
            block.timestamp + SESSION_DURATION
        );

        // Mint with session×EOA
        bytes32 pickConfigId = _mintAndGetPickConfigId(
            predictorSmartAccount, eoaCounterparty,
            predictorSessionKeyPk, eoaCounterpartyPk,
            _buildRegisteredSessionKeyData(predictorSessionKey), ""
        );

        IV2Types.BurnRequest memory request = _buildBurnRequest(BurnParams({
            pickConfigId: pickConfigId,
            predictorHolder: predictorSmartAccount,
            counterpartyHolder: eoaCounterparty,
            predictorPk: predictorSessionKeyPk,
            counterpartyPk: eoaCounterpartyPk,
            predictorSessionKeyData: _buildRegisteredSessionKeyData(predictorSessionKey),
            counterpartySessionKeyData: ""
        }));

        market.burn(request);
    }

    function test_burn_EOA_Session() public {
        // Register counterparty session key
        _registerSessionKey(
            counterpartySmartAccount, counterpartySessionKey, counterpartyOwner,
            block.timestamp + SESSION_DURATION
        );

        // Mint with EOA×session
        bytes32 pickConfigId = _mintAndGetPickConfigId(
            eoaPredictor, counterpartySmartAccount,
            eoaPredictorPk, counterpartySessionKeyPk,
            "", _buildRegisteredSessionKeyData(counterpartySessionKey)
        );

        IV2Types.BurnRequest memory request = _buildBurnRequest(BurnParams({
            pickConfigId: pickConfigId,
            predictorHolder: eoaPredictor,
            counterpartyHolder: counterpartySmartAccount,
            predictorPk: eoaPredictorPk,
            counterpartyPk: counterpartySessionKeyPk,
            predictorSessionKeyData: "",
            counterpartySessionKeyData: _buildRegisteredSessionKeyData(counterpartySessionKey)
        }));

        market.burn(request);
    }

    function test_burn_Session_Session() public {
        // Register both session keys
        _registerSessionKey(
            predictorSmartAccount, predictorSessionKey, predictorOwner,
            block.timestamp + SESSION_DURATION
        );
        _registerSessionKey(
            counterpartySmartAccount, counterpartySessionKey, counterpartyOwner,
            block.timestamp + SESSION_DURATION
        );

        // Mint with session×session
        bytes32 pickConfigId = _mintAndGetPickConfigId(
            predictorSmartAccount, counterpartySmartAccount,
            predictorSessionKeyPk, counterpartySessionKeyPk,
            _buildRegisteredSessionKeyData(predictorSessionKey),
            _buildRegisteredSessionKeyData(counterpartySessionKey)
        );

        IV2Types.BurnRequest memory request = _buildBurnRequest(BurnParams({
            pickConfigId: pickConfigId,
            predictorHolder: predictorSmartAccount,
            counterpartyHolder: counterpartySmartAccount,
            predictorPk: predictorSessionKeyPk,
            counterpartyPk: counterpartySessionKeyPk,
            predictorSessionKeyData: _buildRegisteredSessionKeyData(predictorSessionKey),
            counterpartySessionKeyData: _buildRegisteredSessionKeyData(counterpartySessionKey)
        }));

        market.burn(request);
    }

    // ============ Intent Signature Ownership Verification Test ============

    /// @notice Demonstrates that a session key signature can be traced back to the
    /// smart account owner via on-chain registration. This is what enables the relayer
    /// to verify ownership: sessionKey signs → look up registration → get owner EOA.
    function test_intentSignature_provesOwnership() public {
        uint256 validUntil = block.timestamp + SESSION_DURATION;

        // 1. Register session key on-chain
        _registerSessionKey(predictorSmartAccount, predictorSessionKey, predictorOwner, validUntil);

        // 2. Session key signs a message (simulating an AuctionIntent signature)
        bytes32 intentHash = keccak256("test auction intent");
        (uint8 v, bytes32 r, bytes32 s) = vm.sign(predictorSessionKeyPk, intentHash);

        // 3. Recover signer from the signature
        address recoveredSigner = ecrecover(intentHash, v, r, s);
        assertEq(recoveredSigner, predictorSessionKey, "Should recover session key address");

        // 4. Look up on-chain registration to find the owner
        assertTrue(
            market.isSessionKeyRegistered(predictorSmartAccount, predictorSessionKey),
            "Session key should be registered"
        );

        // 5. The registration maps: smartAccount => sessionKey => {owner, validUntil, registeredAt}
        //    So given the session key address, the relayer can:
        //    a) Verify it's registered for the claimed smart account
        //    b) Know the owner EOA that authorized it via the registration

        // 6. Verify the smart account is derived from the owner via account factory
        address derivedAccount = factory.getAccountAddress(predictorOwner, 0);
        assertEq(derivedAccount, predictorSmartAccount, "Smart account should derive from owner");

        // This proves the chain: intentSignature → sessionKey → registration → owner EOA
    }
}
