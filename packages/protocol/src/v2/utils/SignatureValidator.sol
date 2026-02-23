// SPDX-License-Identifier: MIT
pragma solidity ^0.8.19;

import "@openzeppelin/contracts/utils/cryptography/ECDSA.sol";
import "@openzeppelin/contracts/utils/cryptography/EIP712.sol";
import "@openzeppelin/contracts/interfaces/IERC1271.sol";
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

    /// @notice Trusted account factory for smart account verification
    /// @dev Used to verify that a smart account is derived from the claimed owner
    IAccountFactory public accountFactory;

    /// @notice Emitted when the account factory is updated
    event AccountFactoryUpdated(
        address indexed oldFactory, address indexed newFactory
    );

    /// @notice Error when smart account verification fails
    error SmartAccountVerificationFailed(
        address owner, address claimedAccount, address expectedAccount
    );

    /// @notice Error when account factory is not set but session key validation is attempted
    error AccountFactoryNotSet();

    constructor() EIP712("PredictionMarketEscrow", "1") { }

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
        // Check deadline
        if (block.timestamp > deadline) {
            return false;
        }

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

        bytes32 hash = _hashTypedDataV4(structHash);
        address recoveredSigner = ECDSA.recover(hash, signature);

        if (recoveredSigner == address(0)) {
            return false;
        }

        return recoveredSigner == signer;
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
        ) returns (bytes4 magicValue) {
            return magicValue == IERC1271.isValidSignature.selector;
        } catch {
            return false;
        }
    }

    /// @notice Validate signature for EOA or smart contract with EIP-1271 fallback
    /// @param predictionHash Hash of the prediction parameters
    /// @param signer Expected signer address (EOA or smart contract)
    /// @param collateral Collateral amount for this signer
    /// @param nonce Nonce for replay protection
    /// @param deadline Signature expiration timestamp
    /// @param signature The signature (ECDSA for EOA, or signature validated by EIP-1271)
    /// @return isValid True if the signature is valid
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

        // Try ECDSA first (for EOAs)
        if (
            _isApprovalValid(
                predictionHash, signer, collateral, nonce, deadline, signature
            )
        ) {
            return true;
        }

        // Fallback to EIP-1271 for contracts
        if (signer.code.length > 0) {
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
            bytes32 hash = _hashTypedDataV4(structHash);
            return _isEIP1271SignatureValid(signer, hash, signature);
        }

        return false;
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

        bytes32 hash = _hashTypedDataV4(structHash);
        address recoveredSigner = ECDSA.recover(hash, signature);

        if (recoveredSigner == address(0)) {
            return false;
        }

        return recoveredSigner == signer;
    }

    /// @notice Validate burn signature for EOA or smart contract with EIP-1271 fallback
    /// @param burnHash Hash of the burn parameters
    /// @param signer Expected signer address (EOA or smart contract)
    /// @param tokenAmount Token amount for this signer
    /// @param payout Payout amount for this signer
    /// @param nonce Nonce for replay protection
    /// @param deadline Signature expiration timestamp
    /// @param signature The signature (ECDSA for EOA, or signature validated by EIP-1271)
    /// @return isValid True if the signature is valid
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

        // Try ECDSA first (for EOAs)
        if (
            _isBurnApprovalValid(
                burnHash,
                signer,
                tokenAmount,
                payout,
                nonce,
                deadline,
                signature
            )
        ) {
            return true;
        }

        // Fallback to EIP-1271 for contracts
        if (signer.code.length > 0) {
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
            bytes32 hash = _hashTypedDataV4(structHash);
            return _isEIP1271SignatureValid(signer, hash, signature);
        }

        return false;
    }

    /// @notice Validate a burn approval signed by a session key
    /// @param burnHash Hash of the burn parameters
    /// @param smartAccount The smart account address (expected signer)
    /// @param tokenAmount Token amount
    /// @param payout Payout amount
    /// @param nonce Nonce for replay protection
    /// @param deadline Signature expiration timestamp
    /// @param sessionKeySignature The session key's signature on the burn approval
    /// @param sessionApproval The owner's approval of the session key
    /// @return isValid True if both signatures are valid
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
        if (block.timestamp > deadline) {
            return false;
        }

        if (block.timestamp > sessionApproval.validUntil) {
            return false;
        }

        if (sessionApproval.smartAccount != smartAccount) {
            return false;
        }

        // 1. Verify the session key signed the burn message
        bytes32 burnStructHash = keccak256(
            abi.encode(
                BURN_APPROVAL_TYPEHASH,
                burnHash,
                smartAccount,
                tokenAmount,
                payout,
                nonce,
                deadline
            )
        );
        bytes32 burnDigest = _hashTypedDataV4(burnStructHash);
        address recoveredSessionKey =
            ECDSA.recover(burnDigest, sessionKeySignature);

        if (
            recoveredSessionKey == address(0)
                || recoveredSessionKey != sessionApproval.sessionKey
        ) {
            return false;
        }

        // 2. Verify the owner authorized this session key
        if (sessionApproval.chainId != block.chainid) {
            return false;
        }

        bytes32 sessionStructHash = keccak256(
            abi.encode(
                SESSION_KEY_APPROVAL_TYPEHASH,
                sessionApproval.sessionKey,
                sessionApproval.smartAccount,
                sessionApproval.validUntil,
                sessionApproval.permissionsHash,
                sessionApproval.chainId
            )
        );
        bytes32 sessionHash = _hashTypedDataV4(sessionStructHash);
        address recoveredOwner =
            ECDSA.recover(sessionHash, sessionApproval.ownerSignature);

        if (
            recoveredOwner == address(0)
                || recoveredOwner != sessionApproval.owner
        ) {
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
    /// @param predictionHash Hash of the prediction parameters
    /// @param smartAccount The smart account address (expected signer)
    /// @param collateral Collateral amount
    /// @param nonce Nonce for replay protection
    /// @param deadline Signature expiration timestamp
    /// @param sessionKeySignature The session key's signature on the mint approval
    /// @param sessionApproval The owner's approval of the session key
    /// @return isValid True if both signatures are valid
    function _isSessionKeyApprovalValid(
        bytes32 predictionHash,
        address smartAccount,
        uint256 collateral,
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
        bytes32 mintStructHash = keccak256(
            abi.encode(
                MINT_APPROVAL_TYPEHASH,
                predictionHash,
                smartAccount,
                collateral,
                nonce,
                deadline
            )
        );
        bytes32 mintHash = _hashTypedDataV4(mintStructHash);
        address recoveredSessionKey =
            ECDSA.recover(mintHash, sessionKeySignature);

        if (
            recoveredSessionKey == address(0)
                || recoveredSessionKey != sessionApproval.sessionKey
        ) {
            return false;
        }

        // 2. Verify the owner authorized this session key
        // Verify chain ID matches to prevent cross-chain replay attacks
        if (sessionApproval.chainId != block.chainid) {
            return false;
        }

        bytes32 sessionStructHash = keccak256(
            abi.encode(
                SESSION_KEY_APPROVAL_TYPEHASH,
                sessionApproval.sessionKey,
                sessionApproval.smartAccount,
                sessionApproval.validUntil,
                sessionApproval.permissionsHash,
                sessionApproval.chainId
            )
        );
        bytes32 sessionHash = _hashTypedDataV4(sessionStructHash);
        address recoveredOwner =
            ECDSA.recover(sessionHash, sessionApproval.ownerSignature);

        if (
            recoveredOwner == address(0)
                || recoveredOwner != sessionApproval.owner
        ) {
            return false;
        }

        // 3. Verify the smart account is derived from the owner
        // This ensures the owner actually controls the smart account they claim to
        if (address(accountFactory) == address(0)) {
            revert AccountFactoryNotSet();
        }

        // Try index 0 first (primary account), then index 1 as fallback
        address expectedAccount =
            accountFactory.getAccountAddress(sessionApproval.owner, 0);
        if (expectedAccount != smartAccount) {
            // Try index 1 for users with multiple accounts
            expectedAccount =
                accountFactory.getAccountAddress(sessionApproval.owner, 1);
            if (expectedAccount != smartAccount) {
                return false;
            }
        }

        return true;
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
