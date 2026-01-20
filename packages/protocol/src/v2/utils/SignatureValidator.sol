// SPDX-License-Identifier: MIT
pragma solidity ^0.8.19;

import "@openzeppelin/contracts/utils/cryptography/ECDSA.sol";
import "@openzeppelin/contracts/utils/cryptography/EIP712.sol";
import "./IAccountFactory.sol";

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
    bytes32 public constant MINT_APPROVAL_TYPEHASH =
        keccak256("MintApproval(bytes32 predictionHash,address signer,uint256 wager,uint256 nonce,uint256 deadline)");

    /// @notice EIP-712 typehash for session key approval (owner authorizing a session key)
    bytes32 public constant SESSION_KEY_APPROVAL_TYPEHASH = keccak256(
        "SessionKeyApproval(address sessionKey,address smartAccount,uint256 validUntil,bytes32 permissionsHash)"
    );

    /// @notice Trusted account factory for smart account verification
    /// @dev Used to verify that a smart account is derived from the claimed owner
    IAccountFactory public accountFactory;

    /// @notice Emitted when the account factory is updated
    event AccountFactoryUpdated(address indexed oldFactory, address indexed newFactory);

    /// @notice Error when smart account verification fails
    error SmartAccountVerificationFailed(address owner, address claimedAccount, address expectedAccount);

    /// @notice Error when account factory is not set but session key validation is attempted
    error AccountFactoryNotSet();

    constructor() EIP712("PredictionMarketV2", "1") {}

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
    /// @param wager Wager amount for this signer
    /// @param nonce Nonce for replay protection
    /// @param deadline Signature expiration timestamp
    /// @param signature The EIP-712 signature
    /// @return isValid True if the signature is valid
    function _isApprovalValid(
        bytes32 predictionHash,
        address signer,
        uint256 wager,
        uint256 nonce,
        uint256 deadline,
        bytes memory signature
    ) internal view returns (bool isValid) {
        // Check deadline
        if (block.timestamp > deadline) {
            return false;
        }

        bytes32 structHash =
            keccak256(abi.encode(MINT_APPROVAL_TYPEHASH, predictionHash, signer, wager, nonce, deadline));

        bytes32 hash = _hashTypedDataV4(structHash);
        address recoveredSigner = ECDSA.recover(hash, signature);

        if (recoveredSigner == address(0)) {
            return false;
        }

        return recoveredSigner == signer;
    }

    /// @notice Get the hash that should be signed offchain for mint approval
    /// @param predictionHash Hash of the prediction parameters
    /// @param signer Signer address
    /// @param wager Wager amount
    /// @param nonce Nonce
    /// @param deadline Deadline timestamp
    /// @return hash The EIP-712 typed data hash to sign
    function getMintApprovalHash(bytes32 predictionHash, address signer, uint256 wager, uint256 nonce, uint256 deadline)
        public
        view
        returns (bytes32 hash)
    {
        bytes32 structHash =
            keccak256(abi.encode(MINT_APPROVAL_TYPEHASH, predictionHash, signer, wager, nonce, deadline));
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
        bytes ownerSignature; // Owner's signature on the session approval
    }

    /// @notice Validate a mint approval signed by a session key
    /// @param predictionHash Hash of the prediction parameters
    /// @param smartAccount The smart account address (expected signer)
    /// @param wager Wager amount
    /// @param nonce Nonce for replay protection
    /// @param deadline Signature expiration timestamp
    /// @param sessionKeySignature The session key's signature on the mint approval
    /// @param sessionApproval The owner's approval of the session key
    /// @return isValid True if both signatures are valid
    function _isSessionKeyApprovalValid(
        bytes32 predictionHash,
        address smartAccount,
        uint256 wager,
        uint256 nonce,
        uint256 deadline,
        bytes memory sessionKeySignature,
        SessionKeyApproval memory sessionApproval
    ) internal view returns (bool isValid) {
        // Check deadline
        if (block.timestamp > deadline) {
            return false;
        }

        // Check session key is still valid
        if (block.timestamp > sessionApproval.validUntil) {
            return false;
        }

        // Verify smart account matches
        if (sessionApproval.smartAccount != smartAccount) {
            return false;
        }

        // 1. Verify the session key signed the message
        bytes32 mintStructHash =
            keccak256(abi.encode(MINT_APPROVAL_TYPEHASH, predictionHash, smartAccount, wager, nonce, deadline));
        bytes32 mintHash = _hashTypedDataV4(mintStructHash);
        address recoveredSessionKey = ECDSA.recover(mintHash, sessionKeySignature);

        if (recoveredSessionKey == address(0) || recoveredSessionKey != sessionApproval.sessionKey) {
            return false;
        }

        // 2. Verify the owner authorized this session key
        bytes32 sessionStructHash = keccak256(
            abi.encode(
                SESSION_KEY_APPROVAL_TYPEHASH,
                sessionApproval.sessionKey,
                sessionApproval.smartAccount,
                sessionApproval.validUntil,
                sessionApproval.permissionsHash
            )
        );
        bytes32 sessionHash = _hashTypedDataV4(sessionStructHash);
        address recoveredOwner = ECDSA.recover(sessionHash, sessionApproval.ownerSignature);

        if (recoveredOwner == address(0) || recoveredOwner != sessionApproval.owner) {
            return false;
        }

        // 3. Verify the smart account is derived from the owner
        // This ensures the owner actually controls the smart account they claim to
        if (address(accountFactory) != address(0)) {
            // Try index 0 first (primary account), then index 1 as fallback
            address expectedAccount = accountFactory.getAccountAddress(sessionApproval.owner, 0);
            if (expectedAccount != smartAccount) {
                // Try index 1 for users with multiple accounts
                expectedAccount = accountFactory.getAccountAddress(sessionApproval.owner, 1);
                if (expectedAccount != smartAccount) {
                    return false;
                }
            }
        }
        // Note: If accountFactory is not set, we fall back to trusting the owner's signature
        // This allows gradual migration - set accountFactory for stricter verification

        return true;
    }

    /// @notice Get the hash for session key approval (owner signs this)
    /// @param sessionKey The session key address
    /// @param smartAccount The smart account address
    /// @param validUntil Expiration timestamp
    /// @param permissionsHash Hash of permissions
    /// @return hash The EIP-712 typed data hash for owner to sign
    function getSessionKeyApprovalHash(
        address sessionKey,
        address smartAccount,
        uint256 validUntil,
        bytes32 permissionsHash
    ) public view returns (bytes32 hash) {
        bytes32 structHash = keccak256(
            abi.encode(SESSION_KEY_APPROVAL_TYPEHASH, sessionKey, smartAccount, validUntil, permissionsHash)
        );
        return _hashTypedDataV4(structHash);
    }
}
