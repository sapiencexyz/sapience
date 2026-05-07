// SPDX-License-Identifier: MIT
pragma solidity ^0.8.19;

import "@openzeppelin/contracts/utils/cryptography/EIP712.sol";
import "@openzeppelin/contracts/interfaces/IERC1271.sol";
import "./ECDSAHelper.sol";

/**
 * @title SignatureValidator
 * @notice EIP-712 signature validation for prediction market mint and burn
 *         approvals. Accepts EOA ECDSA signatures and smart-account ERC-1271
 *         (`isValidSignature`) signatures against the request signer.
 * @dev Smart accounts using session keys must do so through their own
 *      validator (e.g. Kernel permission validator) so the smart account
 *      validates the signature itself.
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

    /// @notice Gas limit for EIP-1271 signature validation calls
    /// @dev Prevents malicious contracts from consuming all gas
    uint256 internal constant EIP1271_GAS_LIMIT = 500_000;

    constructor() EIP712("PredictionMarketEscrow", "1") { }

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
}
