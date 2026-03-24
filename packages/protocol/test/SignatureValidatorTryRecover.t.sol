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

/// @notice Mock account factory
contract MockAccountFactoryTV is IAccountFactory {
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

/// @notice Smart account that accepts both 65-byte and 64-byte (EIP-2098 compact) sigs
contract CompactSigSmartAccount is IERC1271 {
    address public authorizedSigner;

    constructor(address _signer) {
        authorizedSigner = _signer;
    }

    function isValidSignature(bytes32 hash, bytes memory signature)
        external
        view
        override
        returns (bytes4)
    {
        uint8 v;
        bytes32 r;
        bytes32 s;
        if (signature.length == 65) {
            assembly {
                r := mload(add(signature, 32))
                s := mload(add(signature, 64))
                v := byte(0, mload(add(signature, 96)))
            }
        } else if (signature.length == 64) {
            bytes32 vs;
            assembly {
                r := mload(add(signature, 32))
                vs := mload(add(signature, 64))
            }
            s = vs
                & bytes32(
                    0x7fffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffff
                );
            v = uint8(uint256(vs >> 255)) + 27;
        } else {
            return 0xffffffff;
        }
        address recovered = ecrecover(hash, v, r, s);
        return recovered == authorizedSigner
            ? IERC1271.isValidSignature.selector
            : bytes4(0xffffffff);
    }

    receive() external payable { }
}

/// @notice 2-of-3 multisig implementing EIP-1271
contract MultisigAccount is IERC1271 {
    uint256 public threshold;
    mapping(address => bool) public isSigner;

    constructor(address[] memory signers, uint256 _threshold) {
        threshold = _threshold;
        for (uint256 i = 0; i < signers.length; i++) {
            isSigner[signers[i]] = true;
        }
    }

    function isValidSignature(bytes32 hash, bytes memory signature)
        external
        view
        override
        returns (bytes4)
    {
        bytes[] memory sigs = abi.decode(signature, (bytes[]));
        uint256 valid = 0;
        address lastSigner = address(0);
        for (uint256 i = 0; i < sigs.length; i++) {
            require(sigs[i].length == 65, "bad inner sig");
            uint8 v;
            bytes32 r;
            bytes32 s;
            bytes memory sig = sigs[i];
            assembly {
                r := mload(add(sig, 32))
                s := mload(add(sig, 64))
                v := byte(0, mload(add(sig, 96)))
            }
            address recovered = ecrecover(hash, v, r, s);
            if (recovered > lastSigner && isSigner[recovered]) {
                valid++;
                lastSigner = recovered;
            }
        }
        return valid >= threshold
            ? IERC1271.isValidSignature.selector
            : bytes4(0xffffffff);
    }

    receive() external payable { }
}

/**
 * @title SignatureValidatorTryRecoverTest
 * @notice Regression tests proving ECDSA.recover → tryRecover fix was necessary
 *         in SignatureValidator's session key paths, plus comprehensive coverage
 *         of all signature validation paths.
 *
 * Tests are grouped:
 * 1. Regression: prove the fix was necessary (compact sig, multisig, truncated sig)
 * 2. Coverage: all signature paths (EOA, EIP-1271, session key) for both mint and burn
 */
contract SignatureValidatorTryRecoverTest is Test {
    PredictionMarketEscrow public market;
    ManualConditionResolver public resolver;
    MockERC20 public collateralToken;
    MockAccountFactoryTV public factory;

    address public admin;
    address public settler;

    // EOA actors
    uint256 public eoaPredictorPk = 30;
    address public eoaPredictor;
    uint256 public eoaCounterpartyPk = 31;
    address public eoaCounterparty;

    // Session key + smart account actors
    uint256 public ownerPk = 40;
    address public owner;
    uint256 public sessionKeyPk = 41;
    address public sessionKey;
    address public smartAccount;

    // Second session key actor (for counterparty side)
    uint256 public owner2Pk = 50;
    address public owner2;
    uint256 public sessionKey2Pk = 51;
    address public sessionKey2;
    address public smartAccount2;

    // Multisig actors
    uint256 public signer1Pk = 60;
    address public signer1;
    uint256 public signer2Pk = 61;
    address public signer2;
    uint256 public signer3Pk = 62;
    address public signer3;

    uint256 public constant PREDICTOR_COLLATERAL = 100e18;
    uint256 public constant COUNTERPARTY_COLLATERAL = 150e18;
    bytes32 public constant REF_CODE = keccak256("tryrecover-test");
    bytes32 public constant CONDITION_ID = keccak256("TRYRECOVER_CONDITION");
    uint256 public constant SESSION_DURATION = 1 days;

    uint256 private _nextNonce = 1;

    function _freshNonce() internal returns (uint256) {
        return _nextNonce++;
    }

    function setUp() public {
        admin = vm.addr(1);
        settler = vm.addr(4);

        eoaPredictor = vm.addr(eoaPredictorPk);
        eoaCounterparty = vm.addr(eoaCounterpartyPk);

        owner = vm.addr(ownerPk);
        sessionKey = vm.addr(sessionKeyPk);
        smartAccount = address(0xAA01);

        owner2 = vm.addr(owner2Pk);
        sessionKey2 = vm.addr(sessionKey2Pk);
        smartAccount2 = address(0xAA02);

        signer1 = vm.addr(signer1Pk);
        signer2 = vm.addr(signer2Pk);
        signer3 = vm.addr(signer3Pk);

        // Deploy factory and map smart accounts
        factory = new MockAccountFactoryTV();
        factory.setAccount(owner, 0, smartAccount);
        factory.setAccount(owner2, 0, smartAccount2);

        // Deploy collateral
        collateralToken = new MockERC20("Test USDE", "USDE", 18);

        // Deploy market
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
        address[] memory toFund = new address[](4);
        toFund[0] = eoaPredictor;
        toFund[1] = eoaCounterparty;
        toFund[2] = smartAccount;
        toFund[3] = smartAccount2;
        for (uint256 i = 0; i < toFund.length; i++) {
            collateralToken.mint(toFund[i], 10_000_000e18);
            vm.prank(toFund[i]);
            collateralToken.approve(address(market), type(uint256).max);
        }
    }

    // ============ Helpers ============

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

    function _signMintApproval(
        bytes32 predictionHash,
        address signer,
        uint256 collateral,
        uint256 nonce,
        uint256 deadline,
        uint256 pk
    ) internal view returns (bytes memory) {
        bytes32 hash = market.getMintApprovalHash(
            predictionHash, signer, collateral, nonce, deadline
        );
        (uint8 v, bytes32 r, bytes32 s) = vm.sign(pk, hash);
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
        bytes32 hash = market.getBurnApprovalHash(
            burnHash, signer, tokenAmount, payout, nonce, deadline
        );
        (uint8 v, bytes32 r, bytes32 s) = vm.sign(pk, hash);
        return abi.encodePacked(r, s, v);
    }

    function _createSessionKeyData(
        address _sessionKey,
        address _owner,
        uint256 _ownerPk,
        address _smartAccount,
        bytes32 permissionsHash
    ) internal view returns (bytes memory) {
        uint256 validUntil =
            block.timestamp + SESSION_DURATION;

        bytes32 sessionApprovalHash = market.getSessionKeyApprovalHash(
            _sessionKey,
            _smartAccount,
            validUntil,
            permissionsHash,
            block.chainid
        );
        (uint8 v, bytes32 r, bytes32 s) = vm.sign(_ownerPk, sessionApprovalHash);
        bytes memory ownerSig = abi.encodePacked(r, s, v);

        IV2Types.SessionKeyData memory skData = IV2Types.SessionKeyData({
            sessionKey: _sessionKey,
            owner: _owner,
            validUntil: validUntil,
            permissionsHash: permissionsHash,
            chainId: block.chainid,
            ownerSignature: ownerSig
        });

        return abi.encode(skData);
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
        market.mint(request);
        pickConfigId = keccak256(abi.encode(request.picks));
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
        bytes32 burnHash;
        {
            burnHash = keccak256(
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
        }

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

    // ================================================================
    // 1. REGRESSION: Prove tryRecover fix was necessary
    //    These tests fail with ECDSA.recover, pass with tryRecover.
    // ================================================================

    /// @notice EIP-1271 smart account with 64-byte compact sig on mint EOA path.
    ///         ECDSA.recover reverts on non-65-byte sigs, blocking EIP-1271 fallback.
    function test_mint_eip1271_compactSignature_predictor() public {
        CompactSigSmartAccount smartSeller =
            new CompactSigSmartAccount(eoaPredictor);
        collateralToken.mint(address(smartSeller), 10_000_000e18);
        vm.prank(address(smartSeller));
        collateralToken.approve(address(market), type(uint256).max);

        IV2Types.Pick[] memory picks = _createPicks();
        bytes32 predictionHash = _computePredictionHash(
            picks, address(smartSeller), eoaCounterparty
        );

        uint256 pNonce = _freshNonce();
        uint256 cNonce = _freshNonce();
        uint256 deadline = block.timestamp + 1 hours;

        // Build 64-byte compact signature (EIP-2098)
        bytes32 approvalHash = market.getMintApprovalHash(
            predictionHash,
            address(smartSeller),
            PREDICTOR_COLLATERAL,
            pNonce,
            deadline
        );
        (uint8 v, bytes32 r, bytes32 s) = vm.sign(eoaPredictorPk, approvalHash);
        bytes32 vs = bytes32(uint256(s) | (uint256(v - 27) << 255));
        bytes memory compactSig = abi.encodePacked(r, vs);
        assert(compactSig.length == 64);

        IV2Types.MintRequest memory request;
        request.picks = picks;
        request.predictorCollateral = PREDICTOR_COLLATERAL;
        request.counterpartyCollateral = COUNTERPARTY_COLLATERAL;
        request.predictor = address(smartSeller);
        request.counterparty = eoaCounterparty;
        request.predictorNonce = pNonce;
        request.counterpartyNonce = cNonce;
        request.predictorDeadline = deadline;
        request.counterpartyDeadline = deadline;
        request.predictorSignature = compactSig;
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

        // Before fix: ECDSAInvalidSignatureLength(64)
        // After fix: tryRecover returns error, falls through to EIP-1271
        (bytes32 predictionId,,) = market.mint(request);
        assertNotEq(predictionId, bytes32(0));
    }

    /// @notice Multisig predictor on mint path. Multisig signature is
    ///         abi.encode(bytes[]) — not valid ECDSA at any length.
    function test_mint_eip1271_multisig_predictor() public {
        address[] memory signers = new address[](3);
        signers[0] = signer1;
        signers[1] = signer2;
        signers[2] = signer3;
        MultisigAccount multisig = new MultisigAccount(signers, 2);

        collateralToken.mint(address(multisig), 10_000_000e18);
        vm.prank(address(multisig));
        collateralToken.approve(address(market), type(uint256).max);

        IV2Types.Pick[] memory picks = _createPicks();
        bytes32 predictionHash =
            _computePredictionHash(picks, address(multisig), eoaCounterparty);

        uint256 pNonce = _freshNonce();
        uint256 cNonce = _freshNonce();
        uint256 deadline = block.timestamp + 1 hours;

        // Build multisig signature: 2-of-3
        bytes32 approvalHash = market.getMintApprovalHash(
            predictionHash,
            address(multisig),
            PREDICTOR_COLLATERAL,
            pNonce,
            deadline
        );
        bytes[] memory innerSigs = new bytes[](2);
        // Must be ascending address order
        if (signer1 < signer2) {
            (uint8 v1, bytes32 r1, bytes32 s1) =
                vm.sign(signer1Pk, approvalHash);
            innerSigs[0] = abi.encodePacked(r1, s1, v1);
            (uint8 v2, bytes32 r2, bytes32 s2) =
                vm.sign(signer2Pk, approvalHash);
            innerSigs[1] = abi.encodePacked(r2, s2, v2);
        } else {
            (uint8 v2, bytes32 r2, bytes32 s2) =
                vm.sign(signer2Pk, approvalHash);
            innerSigs[0] = abi.encodePacked(r2, s2, v2);
            (uint8 v1, bytes32 r1, bytes32 s1) =
                vm.sign(signer1Pk, approvalHash);
            innerSigs[1] = abi.encodePacked(r1, s1, v1);
        }

        IV2Types.MintRequest memory request;
        request.picks = picks;
        request.predictorCollateral = PREDICTOR_COLLATERAL;
        request.counterpartyCollateral = COUNTERPARTY_COLLATERAL;
        request.predictor = address(multisig);
        request.counterparty = eoaCounterparty;
        request.predictorNonce = pNonce;
        request.counterpartyNonce = cNonce;
        request.predictorDeadline = deadline;
        request.counterpartyDeadline = deadline;
        request.predictorSignature = abi.encode(innerSigs);
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

        // Before fix: ECDSA.recover reverts on multisig sig format
        // After fix: tryRecover gracefully fails, EIP-1271 validates 2-of-3
        (bytes32 predictionId,,) = market.mint(request);
        assertNotEq(predictionId, bytes32(0));
    }

    /// @notice Multisig with insufficient signers should still revert
    function test_mint_eip1271_multisig_insufficientSigners_reverts() public {
        address[] memory signers = new address[](3);
        signers[0] = signer1;
        signers[1] = signer2;
        signers[2] = signer3;
        MultisigAccount multisig = new MultisigAccount(signers, 2);

        collateralToken.mint(address(multisig), 10_000_000e18);
        vm.prank(address(multisig));
        collateralToken.approve(address(market), type(uint256).max);

        IV2Types.Pick[] memory picks = _createPicks();
        bytes32 predictionHash =
            _computePredictionHash(picks, address(multisig), eoaCounterparty);

        uint256 pNonce = _freshNonce();
        uint256 cNonce = _freshNonce();
        uint256 deadline = block.timestamp + 1 hours;

        bytes32 approvalHash = market.getMintApprovalHash(
            predictionHash,
            address(multisig),
            PREDICTOR_COLLATERAL,
            pNonce,
            deadline
        );

        // Only 1 signer — below threshold of 2
        bytes[] memory innerSigs = new bytes[](1);
        (uint8 v1, bytes32 r1, bytes32 s1) = vm.sign(signer1Pk, approvalHash);
        innerSigs[0] = abi.encodePacked(r1, s1, v1);

        IV2Types.MintRequest memory request;
        request.picks = picks;
        request.predictorCollateral = PREDICTOR_COLLATERAL;
        request.counterpartyCollateral = COUNTERPARTY_COLLATERAL;
        request.predictor = address(multisig);
        request.counterparty = eoaCounterparty;
        request.predictorNonce = pNonce;
        request.counterpartyNonce = cNonce;
        request.predictorDeadline = deadline;
        request.counterpartyDeadline = deadline;
        request.predictorSignature = abi.encode(innerSigs);
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

        vm.expectRevert(
            IPredictionMarketEscrow.InvalidPredictorSignature.selector
        );
        market.mint(request);
    }

    /// @notice EIP-1271 smart account with compact sig on burn path
    function test_burn_eip1271_compactSignature_predictor() public {
        CompactSigSmartAccount smartSeller =
            new CompactSigSmartAccount(eoaPredictor);
        collateralToken.mint(address(smartSeller), 10_000_000e18);
        vm.prank(address(smartSeller));
        collateralToken.approve(address(market), type(uint256).max);

        // Mint first with standard sig, then burn with compact sig
        bytes32 pickConfigId;
        {
            IV2Types.Pick[] memory picks = _createPicks();
            bytes32 predictionHash = _computePredictionHash(
                picks, address(smartSeller), eoaCounterparty
            );
            uint256 pNonce = _freshNonce();
            uint256 cNonce = _freshNonce();
            uint256 deadline = block.timestamp + 1 hours;

            IV2Types.MintRequest memory mintReq;
            mintReq.picks = picks;
            mintReq.predictorCollateral = PREDICTOR_COLLATERAL;
            mintReq.counterpartyCollateral = COUNTERPARTY_COLLATERAL;
            mintReq.predictor = address(smartSeller);
            mintReq.counterparty = eoaCounterparty;
            mintReq.predictorNonce = pNonce;
            mintReq.counterpartyNonce = cNonce;
            mintReq.predictorDeadline = deadline;
            mintReq.counterpartyDeadline = deadline;
            mintReq.predictorSignature = _signMintApproval(
                predictionHash,
                address(smartSeller),
                PREDICTOR_COLLATERAL,
                pNonce,
                deadline,
                eoaPredictorPk
            );
            mintReq.counterpartySignature = _signMintApproval(
                predictionHash,
                eoaCounterparty,
                COUNTERPARTY_COLLATERAL,
                cNonce,
                deadline,
                eoaCounterpartyPk
            );
            mintReq.refCode = REF_CODE;
            mintReq.predictorSponsor = address(0);
            mintReq.predictorSponsorData = "";

            market.mint(mintReq);
            pickConfigId = keccak256(abi.encode(picks));
        }

        // Burn with compact sig
        {
            uint256 totalTokens = PREDICTOR_COLLATERAL + COUNTERPARTY_COLLATERAL;
            bytes32 burnHash = keccak256(
                abi.encode(
                    pickConfigId,
                    totalTokens,
                    totalTokens,
                    address(smartSeller),
                    eoaCounterparty,
                    PREDICTOR_COLLATERAL,
                    COUNTERPARTY_COLLATERAL
                )
            );

            uint256 bpNonce = _freshNonce();
            uint256 bcNonce = _freshNonce();
            uint256 bDeadline = block.timestamp + 1 hours;

            // Build compact burn sig (64 bytes, EIP-2098)
            bytes memory compactSig;
            {
                bytes32 burnApprovalHash = market.getBurnApprovalHash(
                    burnHash,
                    address(smartSeller),
                    totalTokens,
                    PREDICTOR_COLLATERAL,
                    bpNonce,
                    bDeadline
                );
                (uint8 v, bytes32 r, bytes32 s) =
                    vm.sign(eoaPredictorPk, burnApprovalHash);
                bytes32 vs = bytes32(uint256(s) | (uint256(v - 27) << 255));
                compactSig = abi.encodePacked(r, vs);
            }

            IV2Types.BurnRequest memory burnReq;
            burnReq.pickConfigId = pickConfigId;
            burnReq.predictorTokenAmount = totalTokens;
            burnReq.counterpartyTokenAmount = totalTokens;
            burnReq.predictorHolder = address(smartSeller);
            burnReq.counterpartyHolder = eoaCounterparty;
            burnReq.predictorPayout = PREDICTOR_COLLATERAL;
            burnReq.counterpartyPayout = COUNTERPARTY_COLLATERAL;
            burnReq.predictorNonce = bpNonce;
            burnReq.counterpartyNonce = bcNonce;
            burnReq.predictorDeadline = bDeadline;
            burnReq.counterpartyDeadline = bDeadline;
            burnReq.predictorSignature = compactSig; // 64 bytes
            burnReq.counterpartySignature = _signBurnApproval(
                burnHash,
                eoaCounterparty,
                totalTokens,
                COUNTERPARTY_COLLATERAL,
                bcNonce,
                bDeadline,
                eoaCounterpartyPk
            );
            burnReq.refCode = REF_CODE;

            // Before fix: ECDSAInvalidSignatureLength(64) on burn
            // After fix: tryRecover returns error, falls through to EIP-1271
            market.burn(burnReq);
        }
    }

    // ================================================================
    // 2. SESSION KEY PATH: mint + burn with legacy session key data
    // ================================================================

    /// @notice Session key mint — happy path (both sides)
    function test_mint_sessionKey_bothSides() public {
        bytes memory predictorSKData = _createSessionKeyData(
            sessionKey, owner, ownerPk, smartAccount, keccak256("MINT")
        );
        bytes memory counterpartySKData = _createSessionKeyData(
            sessionKey2, owner2, owner2Pk, smartAccount2, keccak256("MINT")
        );

        IV2Types.MintRequest memory request = _buildMintRequest(
            smartAccount,
            smartAccount2,
            sessionKeyPk,
            sessionKey2Pk,
            predictorSKData,
            counterpartySKData
        );

        (bytes32 predictionId,,) = market.mint(request);
        assertNotEq(predictionId, bytes32(0));
    }

    /// @notice Session key mint — wrong session key should revert
    function test_mint_sessionKey_wrongKey_reverts() public {
        bytes memory predictorSKData = _createSessionKeyData(
            sessionKey, owner, ownerPk, smartAccount, keccak256("MINT")
        );

        // Sign with wrong key (sessionKey2Pk instead of sessionKeyPk)
        IV2Types.MintRequest memory request = _buildMintRequest(
            smartAccount,
            eoaCounterparty,
            sessionKey2Pk, // WRONG KEY
            eoaCounterpartyPk,
            predictorSKData,
            ""
        );

        vm.expectRevert(
            IPredictionMarketEscrow.InvalidPredictorSignature.selector
        );
        market.mint(request);
    }

    /// @notice Session key mint — expired session should revert
    function test_mint_sessionKey_expired_reverts() public {
        bytes memory predictorSKData = _createSessionKeyData(
            sessionKey, owner, ownerPk, smartAccount, keccak256("MINT")
        );

        IV2Types.MintRequest memory request = _buildMintRequest(
            smartAccount,
            eoaCounterparty,
            sessionKeyPk,
            eoaCounterpartyPk,
            predictorSKData,
            ""
        );

        // Warp past session expiry
        vm.warp(block.timestamp + SESSION_DURATION + 1);

        vm.expectRevert(
            IPredictionMarketEscrow.InvalidPredictorSignature.selector
        );
        market.mint(request);
    }

    /// @notice Session key mint — wrong permissions hash should revert
    function test_mint_sessionKey_wrongPermission_reverts() public {
        // Create session key data with BURN permission for a MINT operation
        bytes memory predictorSKData = _createSessionKeyData(
            sessionKey, owner, ownerPk, smartAccount, keccak256("BURN")
        );

        IV2Types.MintRequest memory request = _buildMintRequest(
            smartAccount,
            eoaCounterparty,
            sessionKeyPk,
            eoaCounterpartyPk,
            predictorSKData,
            ""
        );

        vm.expectRevert(
            IPredictionMarketEscrow.InvalidPredictorSignature.selector
        );
        market.mint(request);
    }

    /// @notice Session key burn — happy path
    function test_burn_sessionKey_bothSides() public {
        bytes memory mintPSKData = _createSessionKeyData(
            sessionKey, owner, ownerPk, smartAccount, keccak256("MINT")
        );
        bytes memory mintCSKData = _createSessionKeyData(
            sessionKey2, owner2, owner2Pk, smartAccount2, keccak256("MINT")
        );

        bytes32 pickConfigId = _mintAndGetPickConfigId(
            smartAccount,
            smartAccount2,
            sessionKeyPk,
            sessionKey2Pk,
            mintPSKData,
            mintCSKData
        );

        bytes memory burnPSKData = _createSessionKeyData(
            sessionKey, owner, ownerPk, smartAccount, keccak256("BURN")
        );
        bytes memory burnCSKData = _createSessionKeyData(
            sessionKey2, owner2, owner2Pk, smartAccount2, keccak256("BURN")
        );

        IV2Types.BurnRequest memory request = _buildBurnRequest(
            BurnParams({
                pickConfigId: pickConfigId,
                predictorHolder: smartAccount,
                counterpartyHolder: smartAccount2,
                predictorPk: sessionKeyPk,
                counterpartyPk: sessionKey2Pk,
                predictorSessionKeyData: burnPSKData,
                counterpartySessionKeyData: burnCSKData
            })
        );

        market.burn(request);
    }

    /// @notice Session key burn — wrong permission should revert
    function test_burn_sessionKey_wrongPermission_reverts() public {
        bytes memory mintPSKData = _createSessionKeyData(
            sessionKey, owner, ownerPk, smartAccount, keccak256("MINT")
        );

        bytes32 pickConfigId = _mintAndGetPickConfigId(
            smartAccount,
            eoaCounterparty,
            sessionKeyPk,
            eoaCounterpartyPk,
            mintPSKData,
            ""
        );

        // Use MINT permission for burn — should fail
        bytes memory burnPSKData = _createSessionKeyData(
            sessionKey, owner, ownerPk, smartAccount, keccak256("MINT")
        );

        IV2Types.BurnRequest memory request = _buildBurnRequest(
            BurnParams({
                pickConfigId: pickConfigId,
                predictorHolder: smartAccount,
                counterpartyHolder: eoaCounterparty,
                predictorPk: sessionKeyPk,
                counterpartyPk: eoaCounterpartyPk,
                predictorSessionKeyData: burnPSKData,
                counterpartySessionKeyData: ""
            })
        );

        vm.expectRevert(
            IPredictionMarketEscrow.InvalidPredictorSignature.selector
        );
        market.burn(request);
    }

    // ================================================================
    // 3. EOA PATH: basic coverage for completeness
    // ================================================================

    /// @notice EOA mint — wrong signer should revert
    function test_mint_eoa_wrongSigner_reverts() public {
        IV2Types.Pick[] memory picks = _createPicks();
        bytes32 predictionHash =
            _computePredictionHash(picks, eoaPredictor, eoaCounterparty);

        uint256 pNonce = _freshNonce();
        uint256 cNonce = _freshNonce();
        uint256 deadline = block.timestamp + 1 hours;

        IV2Types.MintRequest memory request;
        request.picks = picks;
        request.predictorCollateral = PREDICTOR_COLLATERAL;
        request.counterpartyCollateral = COUNTERPARTY_COLLATERAL;
        request.predictor = eoaPredictor;
        request.counterparty = eoaCounterparty;
        request.predictorNonce = pNonce;
        request.counterpartyNonce = cNonce;
        request.predictorDeadline = deadline;
        request.counterpartyDeadline = deadline;
        // Sign with counterparty key for predictor
        request.predictorSignature = _signMintApproval(
            predictionHash,
            eoaPredictor,
            PREDICTOR_COLLATERAL,
            pNonce,
            deadline,
            eoaCounterpartyPk // WRONG KEY
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

        vm.expectRevert(
            IPredictionMarketEscrow.InvalidPredictorSignature.selector
        );
        market.mint(request);
    }

    /// @notice Truncated signature (< 64 bytes) for EOA should revert cleanly
    function test_mint_eoa_truncatedSignature_reverts() public {
        IV2Types.Pick[] memory picks = _createPicks();

        uint256 pNonce = _freshNonce();
        uint256 cNonce = _freshNonce();
        uint256 deadline = block.timestamp + 1 hours;

        IV2Types.MintRequest memory request;
        request.picks = picks;
        request.predictorCollateral = PREDICTOR_COLLATERAL;
        request.counterpartyCollateral = COUNTERPARTY_COLLATERAL;
        request.predictor = eoaPredictor;
        request.counterparty = eoaCounterparty;
        request.predictorNonce = pNonce;
        request.counterpartyNonce = cNonce;
        request.predictorDeadline = deadline;
        request.counterpartyDeadline = deadline;
        request.predictorSignature = hex"deadbeef"; // 4 bytes — way too short
        request.counterpartySignature = hex"deadbeef";
        request.refCode = REF_CODE;
        request.predictorSessionKeyData = "";
        request.counterpartySessionKeyData = "";
        request.predictorSponsor = address(0);
        request.predictorSponsorData = "";

        vm.expectRevert(
            IPredictionMarketEscrow.InvalidPredictorSignature.selector
        );
        market.mint(request);
    }

    /// @notice Empty signature for EOA should revert cleanly
    function test_mint_eoa_emptySignature_reverts() public {
        IV2Types.Pick[] memory picks = _createPicks();

        uint256 pNonce = _freshNonce();
        uint256 cNonce = _freshNonce();
        uint256 deadline = block.timestamp + 1 hours;

        IV2Types.MintRequest memory request;
        request.picks = picks;
        request.predictorCollateral = PREDICTOR_COLLATERAL;
        request.counterpartyCollateral = COUNTERPARTY_COLLATERAL;
        request.predictor = eoaPredictor;
        request.counterparty = eoaCounterparty;
        request.predictorNonce = pNonce;
        request.counterpartyNonce = cNonce;
        request.predictorDeadline = deadline;
        request.counterpartyDeadline = deadline;
        request.predictorSignature = ""; // empty
        request.counterpartySignature = "";
        request.refCode = REF_CODE;
        request.predictorSessionKeyData = "";
        request.counterpartySessionKeyData = "";
        request.predictorSponsor = address(0);
        request.predictorSponsorData = "";

        vm.expectRevert(
            IPredictionMarketEscrow.InvalidPredictorSignature.selector
        );
        market.mint(request);
    }
}
