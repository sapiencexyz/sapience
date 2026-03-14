// SPDX-License-Identifier: MIT
pragma solidity ^0.8.19;

import "forge-std/Test.sol";
import "../src/PredictionMarketEscrow.sol";
import "../src/PredictionMarketTokenFactory.sol";
import "../src/SecondaryMarketEscrow.sol";
import "../src/resolvers/mocks/ManualConditionResolver.sol";
import "../src/interfaces/IV2Types.sol";
import "../src/interfaces/IPredictionMarketEscrow.sol";
import "../src/interfaces/ISecondaryMarketEscrow.sol";
import "../src/utils/IAccountFactory.sol";
import "../src/utils/SignatureValidator.sol";
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
 * @title SessionKeyRevocationTest
 * @notice Audit tests for M-2: Session Key Revocation
 *
 * M-2 Vulnerability:
 *   Session keys lack on-chain revocation. The only way to invalidate a
 *   session key is to wait for `validUntil` to expire, which could be hours
 *   or days away.
 *
 * M-2 Fix:
 *   Add `revokeSessionKey(address)` that immediately invalidates a session
 *   key by recording the revocation timestamp. Both PredictionMarketEscrow
 *   (mint/burn) and SecondaryMarketEscrow (trade) check revocation status.
 */
contract SessionKeyRevocationTest is Test {
    PredictionMarketEscrow public market;
    SecondaryMarketEscrow public secondaryMarket;
    ManualConditionResolver public resolver;
    MockERC20 public collateralToken;
    MockAccountFactory public factory;

    address public admin;
    address public settler;

    // Session key owner (EOA that owns the smart account)
    uint256 public ownerPk;
    address public ownerAddr;

    // Session key
    uint256 public sessionKeyPk;
    address public sessionKeyAddr;

    // Another session key
    uint256 public sessionKey2Pk;
    address public sessionKey2Addr;

    // Smart account derived from owner
    address public smartAccount;

    // Counterparty (EOA)
    uint256 public counterpartyPk;
    address public counterparty;

    uint256 public constant PREDICTOR_COLLATERAL = 100e18;
    uint256 public constant COUNTERPARTY_COLLATERAL = 150e18;
    bytes32 public constant REF_CODE = keccak256("session-key-revocation");
    bytes32 public constant CONDITION_ID =
        keccak256("SESSION_KEY_REVOCATION_CONDITION");

    uint256 private _nextNonce = 1;

    function _freshNonce() internal returns (uint256) {
        return _nextNonce++;
    }

    function setUp() public {
        admin = vm.addr(1);
        ownerPk = 10;
        ownerAddr = vm.addr(ownerPk);
        sessionKeyPk = 11;
        sessionKeyAddr = vm.addr(sessionKeyPk);
        sessionKey2Pk = 12;
        sessionKey2Addr = vm.addr(sessionKey2Pk);
        counterpartyPk = 3;
        counterparty = vm.addr(counterpartyPk);
        settler = vm.addr(4);
        smartAccount = address(0xBEEF);

        // Deploy factory and set account mapping
        factory = new MockAccountFactory();
        factory.setAccount(ownerAddr, 0, smartAccount);

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

        // Deploy SecondaryMarketEscrow
        secondaryMarket = new SecondaryMarketEscrow(address(factory));

        // Fund accounts
        collateralToken.mint(smartAccount, 1_000_000e18);
        collateralToken.mint(counterparty, 1_000_000e18);

        vm.prank(smartAccount);
        collateralToken.approve(address(market), type(uint256).max);
        vm.prank(counterparty);
        collateralToken.approve(address(market), type(uint256).max);
    }

    // ============ Helpers ============

    function _createSessionKeyData(uint256 skPk, address skAddr)
        internal
        view
        returns (bytes memory)
    {
        uint256 validUntil = block.timestamp + 1 days;
        bytes32 permissionsHash = keccak256("MINT");

        bytes32 sessionApprovalHash = market.getSessionKeyApprovalHash(
            skAddr, smartAccount, validUntil, permissionsHash, block.chainid
        );
        (uint8 v, bytes32 r, bytes32 s) = vm.sign(ownerPk, sessionApprovalHash);
        bytes memory ownerSig = abi.encodePacked(r, s, v);

        IV2Types.SessionKeyData memory skData = IV2Types.SessionKeyData({
            sessionKey: skAddr,
            owner: ownerAddr,
            validUntil: validUntil,
            permissionsHash: permissionsHash,
            chainId: block.chainid,
            ownerSignature: ownerSig
        });

        return abi.encode(skData);
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

    function _buildMintRequestWithSessionKey(uint256 skPk, address skAddr)
        internal
        returns (IV2Types.MintRequest memory request)
    {
        IV2Types.Pick[] memory picks = new IV2Types.Pick[](1);
        picks[0] = IV2Types.Pick({
            conditionResolver: address(resolver),
            conditionId: abi.encode(CONDITION_ID),
            predictedOutcome: IV2Types.OutcomeSide.YES
        });

        bytes32 pickConfigId = keccak256(abi.encode(picks));
        bytes32 predictionHash = keccak256(
            abi.encode(
                pickConfigId,
                PREDICTOR_COLLATERAL,
                COUNTERPARTY_COLLATERAL,
                smartAccount,
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
        request.predictor = smartAccount;
        request.counterparty = counterparty;
        request.predictorNonce = pNonce;
        request.counterpartyNonce = cNonce;
        request.predictorDeadline = deadline;
        request.counterpartyDeadline = deadline;
        // Session key signs on behalf of smartAccount (predictor)
        request.predictorSignature = _signMintApproval(
            predictionHash,
            smartAccount,
            PREDICTOR_COLLATERAL,
            pNonce,
            deadline,
            skPk
        );
        // Counterparty signs normally (EOA)
        request.counterpartySignature = _signMintApproval(
            predictionHash,
            counterparty,
            COUNTERPARTY_COLLATERAL,
            cNonce,
            deadline,
            counterpartyPk
        );
        request.refCode = REF_CODE;
        request.predictorSessionKeyData = _createSessionKeyData(skPk, skAddr);
        request.counterpartySessionKeyData = "";
        request.predictorSponsor = address(0);
        request.predictorSponsorData = "";
    }

    // ============ PredictionMarketEscrow Revocation Tests ============

    function test_M2_revokedSessionKeyBlocksMint() public {
        // Owner revokes session key
        vm.prank(ownerAddr);
        market.revokeSessionKey(sessionKeyAddr);

        // Attempt to mint with revoked session key
        IV2Types.MintRequest memory request =
            _buildMintRequestWithSessionKey(sessionKeyPk, sessionKeyAddr);

        vm.expectRevert(
            IPredictionMarketEscrow.InvalidPredictorSignature.selector
        );
        market.mint(request);
    }

    function test_M2_unRevokedSessionKeySucceeds() public {
        // Mint with non-revoked session key should succeed
        IV2Types.MintRequest memory request =
            _buildMintRequestWithSessionKey(sessionKeyPk, sessionKeyAddr);

        (bytes32 predictionId,,) = market.mint(request);
        assertNotEq(predictionId, bytes32(0));
    }

    function test_M2_revocationEmitsEvent() public {
        vm.expectEmit(true, true, false, true);
        emit SignatureValidator.SessionKeyRevoked(
            ownerAddr, sessionKeyAddr, block.timestamp
        );

        vm.prank(ownerAddr);
        market.revokeSessionKey(sessionKeyAddr);
    }

    function test_M2_onlyOwnersRevocationAffectsTheirKeys() public {
        // Counterparty revokes the same session key
        vm.prank(counterparty);
        market.revokeSessionKey(sessionKeyAddr);

        // Owner's session key is NOT revoked (different owner)
        assertFalse(market.isSessionKeyRevoked(ownerAddr, sessionKeyAddr));
        assertTrue(market.isSessionKeyRevoked(counterparty, sessionKeyAddr));

        // Mint with session key should still succeed (owner hasn't revoked)
        IV2Types.MintRequest memory request =
            _buildMintRequestWithSessionKey(sessionKeyPk, sessionKeyAddr);
        (bytes32 predictionId,,) = market.mint(request);
        assertNotEq(predictionId, bytes32(0));
    }

    function test_M2_isSessionKeyRevokedCorrectness() public {
        assertFalse(market.isSessionKeyRevoked(ownerAddr, sessionKeyAddr));

        vm.prank(ownerAddr);
        market.revokeSessionKey(sessionKeyAddr);

        assertTrue(market.isSessionKeyRevoked(ownerAddr, sessionKeyAddr));
    }

    function test_M2_revokingOneKeyDoesNotAffectOthers() public {
        // Revoke session key 1
        vm.prank(ownerAddr);
        market.revokeSessionKey(sessionKeyAddr);

        assertTrue(market.isSessionKeyRevoked(ownerAddr, sessionKeyAddr));
        assertFalse(market.isSessionKeyRevoked(ownerAddr, sessionKey2Addr));

        // Session key 2 should still work for minting
        IV2Types.MintRequest memory request =
            _buildMintRequestWithSessionKey(sessionKey2Pk, sessionKey2Addr);
        (bytes32 predictionId,,) = market.mint(request);
        assertNotEq(predictionId, bytes32(0));
    }

    // ============ SecondaryMarket Helpers ============

    MockERC20 public positionToken;

    function _setupSecondaryMarket() internal {
        positionToken = new MockERC20("Position Token", "POS", 18);
        positionToken.mint(smartAccount, 10_000e18);

        vm.prank(smartAccount);
        positionToken.approve(address(secondaryMarket), type(uint256).max);
        vm.prank(counterparty);
        collateralToken.approve(address(secondaryMarket), type(uint256).max);
    }

    function _signTradeApproval(
        bytes32 tradeHash,
        address signer,
        uint256 nonce,
        uint256 deadline,
        uint256 pk
    ) internal view returns (bytes memory) {
        bytes32 hash = secondaryMarket.getTradeApprovalHash(
            tradeHash, signer, nonce, deadline
        );
        (uint8 v, bytes32 r, bytes32 s) = vm.sign(pk, hash);
        return abi.encodePacked(r, s, v);
    }

    function _createTradeSessionKeyData() internal view returns (bytes memory) {
        uint256 validUntil = block.timestamp + 1 days;
        bytes32 permissionsHash = keccak256("TRADE");

        bytes32 sessionApprovalHash = secondaryMarket.getSessionKeyApprovalHash(
            sessionKeyAddr,
            smartAccount,
            validUntil,
            permissionsHash,
            block.chainid
        );
        (uint8 v, bytes32 r, bytes32 s) = vm.sign(ownerPk, sessionApprovalHash);

        IV2Types.SessionKeyData memory skData = IV2Types.SessionKeyData({
            sessionKey: sessionKeyAddr,
            owner: ownerAddr,
            validUntil: validUntil,
            permissionsHash: permissionsHash,
            chainId: block.chainid,
            ownerSignature: abi.encodePacked(r, s, v)
        });

        return abi.encode(skData);
    }

    function _buildTradeRequest()
        internal
        returns (ISecondaryMarketEscrow.TradeRequest memory request)
    {
        uint256 tokenAmount = 100e18;
        uint256 price = 50e18;

        bytes32 tradeHash = keccak256(
            abi.encode(
                address(positionToken),
                address(collateralToken),
                smartAccount,
                counterparty,
                tokenAmount,
                price
            )
        );

        uint256 sNonce = _freshNonce();
        uint256 bNonce = _freshNonce();
        uint256 deadline = block.timestamp + 1 hours;

        request.token = address(positionToken);
        request.collateral = address(collateralToken);
        request.seller = smartAccount;
        request.buyer = counterparty;
        request.tokenAmount = tokenAmount;
        request.price = price;
        request.sellerNonce = sNonce;
        request.buyerNonce = bNonce;
        request.sellerDeadline = deadline;
        request.buyerDeadline = deadline;
        request.sellerSignature = _signTradeApproval(
            tradeHash, smartAccount, sNonce, deadline, sessionKeyPk
        );
        request.buyerSignature = _signTradeApproval(
            tradeHash, counterparty, bNonce, deadline, counterpartyPk
        );
        request.refCode = REF_CODE;
        request.sellerSessionKeyData = _createTradeSessionKeyData();
        request.buyerSessionKeyData = "";
    }

    // ============ SecondaryMarketEscrow Revocation Tests ============

    function test_M2_secondaryMarket_revokedSessionKeyBlocksTrade() public {
        _setupSecondaryMarket();

        // Owner revokes session key on secondary market
        vm.prank(ownerAddr);
        secondaryMarket.revokeSessionKey(sessionKeyAddr);

        ISecondaryMarketEscrow.TradeRequest memory request =
            _buildTradeRequest();

        vm.expectRevert(ISecondaryMarketEscrow.InvalidSignature.selector);
        secondaryMarket.executeTrade(request);
    }

    function test_M2_secondaryMarket_revocationIsIndependent() public {
        // Revoke on PredictionMarketEscrow
        vm.prank(ownerAddr);
        market.revokeSessionKey(sessionKeyAddr);

        // SecondaryMarketEscrow should NOT be affected
        assertFalse(
            secondaryMarket.isSessionKeyRevoked(ownerAddr, sessionKeyAddr)
        );

        // Revoke on SecondaryMarketEscrow
        vm.prank(ownerAddr);
        secondaryMarket.revokeSessionKey(sessionKeyAddr);

        assertTrue(
            secondaryMarket.isSessionKeyRevoked(ownerAddr, sessionKeyAddr)
        );
    }

    function test_M2_secondaryMarket_revocationEmitsEvent() public {
        vm.expectEmit(true, true, false, true);
        emit ISecondaryMarketEscrow.SessionKeyRevoked(
            ownerAddr, sessionKeyAddr, block.timestamp
        );

        vm.prank(ownerAddr);
        secondaryMarket.revokeSessionKey(sessionKeyAddr);
    }
}
