// SPDX-License-Identifier: MIT
pragma solidity ^0.8.19;

import "@openzeppelin/contracts/utils/cryptography/ECDSA.sol";
import "@openzeppelin/contracts/utils/cryptography/EIP712.sol";

/**
 * @title SignatureValidator
 * @notice EIP-712 signature validation for prediction market requests
 * @dev Adapted from legacy SignatureProcessor with support for two-party signatures
 */
abstract contract SignatureValidator is EIP712 {
    /// @notice EIP-712 typehash for mint approval
    bytes32 public constant MINT_APPROVAL_TYPEHASH = keccak256(
        "MintApproval(bytes32 predictionHash,address signer,uint256 wager,uint256 nonce,uint256 deadline)"
    );

    constructor() EIP712("PredictionMarketV2", "1") {}

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
    function getMintApprovalHash(
        bytes32 predictionHash,
        address signer,
        uint256 wager,
        uint256 nonce,
        uint256 deadline
    ) public view returns (bytes32 hash) {
        bytes32 structHash =
            keccak256(abi.encode(MINT_APPROVAL_TYPEHASH, predictionHash, signer, wager, nonce, deadline));
        return _hashTypedDataV4(structHash);
    }

    /// @notice Get the EIP-712 domain separator
    /// @return separator The domain separator
    function domainSeparator() external view returns (bytes32 separator) {
        return _domainSeparatorV4();
    }
}
