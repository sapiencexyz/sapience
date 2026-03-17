// SPDX-License-Identifier: MIT
pragma solidity ^0.8.19;

import "@openzeppelin/contracts/utils/cryptography/ECDSA.sol";
import "@openzeppelin/contracts/utils/cryptography/EIP712.sol";
import "@openzeppelin/contracts/interfaces/IERC1271.sol";
import "./IAccountFactory.sol";
import "./ECDSAHelper.sol";

/**
 * @title SignatureValidator
 * @notice EIP-712 signature validation for prediction market requests
 * @dev Supports both EOA signatures and ZeroDev session key signatures
 *
 * Session Key Flow (Option B):
 * 1. Owner creates a session key and signs a SessionKeyApproval authorizing it
 * 2. Session key signs the MintApproval message
 * 3. Contract verifies:
 *    - Session key signature on the message
 *    - Owner's session approval proving authorization
 *    - Smart account derivation from owner (verified against account factory)
 */
abstract contract SignatureValidator is EIP712 {
    /// @notice EIP-712 typehash for mint approval
    bytes32 public constant MINT_APPROVAL_TYPEHASH = keccak256(
        "MintApproval(bytes32 predictionHash,address signer,uint256 collateral,uint256 nonce,uint256 deadline)"
    );

    /// @notice EIP-712 typehash for burn approval
    bytes32 public constant BURN_APPROVAL_TYPEHASH = keccak256(
        "BurnApproval(bytes32 burnHash,address signer,uint256 tokenAmount,uint256 payout,uint256 nonce,uint256 deadline)"
    );

    /// @notice EIP-712 typehash for session key approval (owner authorizing a session key)
    /// @dev Includes chainId to prevent cross-chain replay attacks
    bytes32 public constant SESSION_KEY_APPROVAL_TYPEHASH = keccak256(
        "SessionKeyApproval(address sessionKey,address smartAccount,uint256 validUntil,bytes32 permissionsHash,uint256 chainId)"
    );

    /// @notice Permission hash for mint operations
    bytes32 public constant MINT_PERMISSION = keccak256("MINT");

    /// @notice Permission hash for burn operations
    bytes32 public constant BURN_PERMISSION = keccak256("BURN");

    /// @notice Trusted account factory for smart account verification
    /// @dev Used to verify that a smart account is derived from the claimed owner
    IAccountFactory public accountFactory;

    /// @notice Revoked session keys: owner => sessionKey => revokedAt timestamp
    mapping(address => mapping(address => uint256)) internal
        _revokedSessionKeys;

    /// @notice Emitted when the account factory is updated
    event AccountFactoryUpdated(
        address indexed oldFactory, address indexed newFactory
    );

    /// @notice Emitted when a session key is revoked
    event SessionKeyRevoked(
        address indexed owner, address indexed sessionKey, uint256 revokedAt
    );

    /// @notice Error when smart account verification fails
    error SmartAccountVerificationFailed(
        address owner, address claimedAccount, address expectedAccount
    );

    /// @notice Error when account factory is not set but session key validation is attempted
    error AccountFactoryNotSet();

    /// @notice Error when a revoked session key is used
    error SessionKeyIsRevoked();

    constructor() EIP712("PredictionMarketEscrow", "1") { }

    /// @notice Revoke a session key so it can no longer be used for signing
    /// @param sessionKey The session key address to revoke
    function revokeSessionKey(address sessionKey) external virtual {
        _revokedSessionKeys[msg.sender][sessionKey] = block.timestamp;
        emit SessionKeyRevoked(msg.sender, sessionKey, block.timestamp);
    }

    /// @notice Check if a session key has been revoked by an owner
    /// @param owner The owner who may have revoked the key
    /// @param sessionKey The session key to check
    /// @return revoked True if the session key is revoked
    function isSessionKeyRevoked(address owner, address sessionKey)
        external
        view
        virtual
        returns (bool revoked)
    {
        return _revokedSessionKeys[owner][sessionKey] > 0;
    }

    /// @notice Set the trusted account factory for smart account verification
    /// @param factory_ The account factory address (e.g., ZeroDev Kernel factory)
    /// @dev Should be called by inheriting contract with proper access control
    function _setAccountFactory(address factory_) internal {
        address oldFactory = address(accountFactory);
        accountFactory = IAccountFactory(factory_);
        emit AccountFactoryUpdated(oldFactory, factory_);
    }

    /// @notice Validate a mint approval signature
    /// @param predictionHash Hash of the prediction parameters
    /// @param signer Expected signer address
    /// @param collateral Collateral amount for this signer
    /// @param nonce Nonce for replay protection
    /// @param deadline Signature expiration timestamp
    /// @param signature The EIP-712 signature
    /// @return isValid True if the signature is valid
    function _isApprovalValid(
        bytes32 predictionHash,
        address signer,
        uint256 collateral,
        uint256 nonce,
        uint256 deadline,
        bytes memory signature
    ) internal view returns (bool isValid) {
        if (block.timestamp > deadline) {
            return false;
        }

        bytes32 hash = getMintApprovalHash(
            predictionHash, signer, collateral, nonce, deadline
        );
        return ECDSAHelper.isValidECDSASignature(hash, signature, signer);
    }

    /// @notice Gas limit for EIP-1271 signature validation calls
    /// @dev Prevents malicious contracts from consuming all gas
    uint256 internal constant EIP1271_GAS_LIMIT = 500_000;

    /// @notice Validate signature using EIP-1271 (for smart contract signers)
    /// @param signer The smart contract address that should validate the signature
    /// @param hash The hash that was signed
    /// @param signature The signature to validate
    /// @return isValid True if the signature is valid according to EIP-1271
    function _isEIP1271SignatureValid(
        address signer,
        bytes32 hash,
        bytes memory signature
    ) internal view returns (bool isValid) {
        if (signer.code.length == 0) {
            return false;
        }
        try IERC1271(signer).isValidSignature{ gas: EIP1271_GAS_LIMIT }(
            hash, signature
        ) returns (
            bytes4 magicValue
        ) {
            return magicValue == IERC1271.isValidSignature.selector;
        } catch {
            return false;
        }
    }

    /// @notice Validate signature: try ECDSA first, fallback to EIP-1271 for contracts
    /// @param hash The EIP-712 typed data hash
    /// @param signer Expected signer address (EOA or smart contract)
    /// @param signature The signature bytes
    /// @return isValid True if the signature is valid via either path
    function _validateSignatureWithFallback(
        bytes32 hash,
        address signer,
        bytes memory signature
    ) internal view returns (bool isValid) {
        // Try ECDSA first (for EOAs)
        if (ECDSAHelper.isValidECDSASignature(hash, signature, signer)) {
            return true;
        }

        // Fallback to EIP-1271 for contracts
        if (signer.code.length > 0) {
            return _isEIP1271SignatureValid(signer, hash, signature);
        }

        return false;
    }

    /// @notice Validate signature for EOA or smart contract with EIP-1271 fallback
    function _isApprovalValidWithEIP1271Fallback(
        bytes32 predictionHash,
        address signer,
        uint256 collateral,
        uint256 nonce,
        uint256 deadline,
        bytes memory signature
    ) internal view returns (bool isValid) {
        if (block.timestamp > deadline) {
            return false;
        }

        bytes32 hash = getMintApprovalHash(
            predictionHash, signer, collateral, nonce, deadline
        );
        return _validateSignatureWithFallback(hash, signer, signature);
    }

    /// @notice Get the hash that should be signed offchain for mint approval
    /// @param predictionHash Hash of the prediction parameters
    /// @param signer Signer address
    /// @param collateral Collateral amount
    /// @param nonce Nonce
    /// @param deadline Deadline timestamp
    /// @return hash The EIP-712 typed data hash to sign
    function getMintApprovalHash(
        bytes32 predictionHash,
        address signer,
        uint256 collateral,
        uint256 nonce,
        uint256 deadline
    ) public view returns (bytes32 hash) {
        bytes32 structHash = keccak256(
            abi.encode(
                MINT_APPROVAL_TYPEHASH,
                predictionHash,
                signer,
                collateral,
                nonce,
                deadline
            )
        );
        return _hashTypedDataV4(structHash);
    }

    /// @notice Validate a burn approval signature (ECDSA)
    /// @param burnHash Hash of the burn parameters
    /// @param signer Expected signer address
    /// @param tokenAmount Token amount for this signer
    /// @param payout Payout amount for this signer
    /// @param nonce Nonce for replay protection
    /// @param deadline Signature expiration timestamp
    /// @param signature The EIP-712 signature
    /// @return isValid True if the signature is valid
    function _isBurnApprovalValid(
        bytes32 burnHash,
        address signer,
        uint256 tokenAmount,
        uint256 payout,
        uint256 nonce,
        uint256 deadline,
        bytes memory signature
    ) internal view returns (bool isValid) {
        if (block.timestamp > deadline) {
            return false;
        }

        bytes32 hash = getBurnApprovalHash(
            burnHash, signer, tokenAmount, payout, nonce, deadline
        );
        return ECDSAHelper.isValidECDSASignature(hash, signature, signer);
    }

    /// @notice Validate burn signature for EOA or smart contract with EIP-1271 fallback
    function _isBurnApprovalValidWithEIP1271Fallback(
        bytes32 burnHash,
        address signer,
        uint256 tokenAmount,
        uint256 payout,
        uint256 nonce,
        uint256 deadline,
        bytes memory signature
    ) internal view returns (bool isValid) {
        if (block.timestamp > deadline) {
            return false;
        }

        bytes32 hash = getBurnApprovalHash(
            burnHash, signer, tokenAmount, payout, nonce, deadline
        );
        return _validateSignatureWithFallback(hash, signer, signature);
    }

    /// @notice Shared session key validation: preamble checks, session key sig,
    ///         owner sig, and account factory verification.
    /// @param messageDigest The EIP-712 hash of the operation-specific message
    ///        (mint or burn approval) that the session key signed
    /// @param smartAccount The smart account address (expected signer)
    /// @param deadline Signature expiration timestamp
    /// @param requiredPermission The permission hash required (MINT_PERMISSION or BURN_PERMISSION)
    /// @param sessionKeySignature The session key's signature on messageDigest
    /// @param sessionApproval The owner's session key approval
    /// @return isValid True if all checks pass
    function _validateSessionKeyApproval(
        bytes32 messageDigest,
        address smartAccount,
        uint256 deadline,
        bytes32 requiredPermission,
        bytes memory sessionKeySignature,
        SessionKeyApproval memory sessionApproval
    ) internal view returns (bool isValid) {
        // Deadline and session validity
        if (block.timestamp > deadline) {
            return false;
        }
        if (block.timestamp > sessionApproval.validUntil) {
            return false;
        }

        // Revocation check
        if (
            _revokedSessionKeys[
                    sessionApproval.owner
                ][sessionApproval.sessionKey] > 0
        ) {
            return false;
        }

        // Permission and smart account match
        if (sessionApproval.permissionsHash != requiredPermission) {
            return false;
        }
        if (sessionApproval.smartAccount != smartAccount) {
            return false;
        }

        // 1. Verify the session key signed the message
        if (!ECDSAHelper.isValidECDSASignature(
                messageDigest, sessionKeySignature, sessionApproval.sessionKey
            )) {
            return false;
        }

        // 2. Verify the owner authorized this session key
        if (sessionApproval.chainId != block.chainid) {
            return false;
        }

        bytes32 sessionHash = getSessionKeyApprovalHash(
            sessionApproval.sessionKey,
            sessionApproval.smartAccount,
            sessionApproval.validUntil,
            sessionApproval.permissionsHash,
            sessionApproval.chainId
        );
        if (!ECDSAHelper.isValidECDSASignature(
                sessionHash,
                sessionApproval.ownerSignature,
                sessionApproval.owner
            )) {
            return false;
        }

        // 3. Verify the smart account is derived from the owner
        if (address(accountFactory) == address(0)) {
            revert AccountFactoryNotSet();
        }

        address expectedAccount =
            accountFactory.getAccountAddress(sessionApproval.owner, 0);
        if (expectedAccount != smartAccount) {
            expectedAccount =
                accountFactory.getAccountAddress(sessionApproval.owner, 1);
            if (expectedAccount != smartAccount) {
                return false;
            }
        }

        return true;
    }

    /// @notice Validate a burn approval signed by a session key
    function _isSessionKeyBurnApprovalValid(
        bytes32 burnHash,
        address smartAccount,
        uint256 tokenAmount,
        uint256 payout,
        uint256 nonce,
        uint256 deadline,
        bytes memory sessionKeySignature,
        SessionKeyApproval memory sessionApproval
    ) internal view returns (bool isValid) {
        bytes32 burnDigest = getBurnApprovalHash(
            burnHash, smartAccount, tokenAmount, payout, nonce, deadline
        );
        return _validateSessionKeyApproval(
            burnDigest,
            smartAccount,
            deadline,
            BURN_PERMISSION,
            sessionKeySignature,
            sessionApproval
        );
    }

    /// @notice Get the hash that should be signed offchain for burn approval
    /// @param burnHash Hash of the burn parameters
    /// @param signer Signer address
    /// @param tokenAmount Token amount
    /// @param payout Payout amount
    /// @param nonce Nonce
    /// @param deadline Deadline timestamp
    /// @return hash The EIP-712 typed data hash to sign
    function getBurnApprovalHash(
        bytes32 burnHash,
        address signer,
        uint256 tokenAmount,
        uint256 payout,
        uint256 nonce,
        uint256 deadline
    ) public view returns (bytes32 hash) {
        bytes32 structHash = keccak256(
            abi.encode(
                BURN_APPROVAL_TYPEHASH,
                burnHash,
                signer,
                tokenAmount,
                payout,
                nonce,
                deadline
            )
        );
        return _hashTypedDataV4(structHash);
    }

    /// @notice Get the EIP-712 domain separator
    /// @return separator The domain separator
    function domainSeparator() external view returns (bytes32 separator) {
        return _domainSeparatorV4();
    }

    // ============ Session Key Support (Option B) ============

    /// @notice Session key approval data signed by the owner
    struct SessionKeyApproval {
        address sessionKey; // The session key address
        address owner; // The owner who authorized this session key
        address smartAccount; // The smart account (signer in the mint request)
        uint256 validUntil; // Expiration timestamp for the session key
        bytes32 permissionsHash; // Hash of permissions granted to this session key
        uint256 chainId; // Chain ID to prevent cross-chain replay attacks
        bytes ownerSignature; // Owner's signature on the session approval
    }

    /// @notice Validate a mint approval signed by a session key
    function _isSessionKeyApprovalValid(
        bytes32 predictionHash,
        address smartAccount,
        uint256 collateral,
        uint256 nonce,
        uint256 deadline,
        bytes memory sessionKeySignature,
        SessionKeyApproval memory sessionApproval
    ) internal view returns (bool isValid) {
        bytes32 mintDigest = getMintApprovalHash(
            predictionHash, smartAccount, collateral, nonce, deadline
        );
        return _validateSessionKeyApproval(
            mintDigest,
            smartAccount,
            deadline,
            MINT_PERMISSION,
            sessionKeySignature,
            sessionApproval
        );
    }

    /// @notice Get the hash for session key approval (owner signs this)
    /// @param sessionKey The session key address
    /// @param smartAccount The smart account address
    /// @param validUntil Expiration timestamp
    /// @param permissionsHash Hash of permissions
    /// @param chainId Chain ID (must match block.chainid during validation)
    /// @return hash The EIP-712 typed data hash for owner to sign
    function getSessionKeyApprovalHash(
        address sessionKey,
        address smartAccount,
        uint256 validUntil,
        bytes32 permissionsHash,
        uint256 chainId
    ) public view returns (bytes32 hash) {
        bytes32 structHash = keccak256(
            abi.encode(
                SESSION_KEY_APPROVAL_TYPEHASH,
                sessionKey,
                smartAccount,
                validUntil,
                permissionsHash,
                chainId
            )
        );
        return _hashTypedDataV4(structHash);
    }
}
