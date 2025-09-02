// SPDX-License-Identifier: MIT
pragma solidity ^0.8.19;

import "@openzeppelin/contracts/utils/cryptography/ECDSA.sol";
import "@openzeppelin/contracts/utils/cryptography/EIP712.sol";

abstract contract SignatureProcessor is EIP712 {
    bytes32 public constant APPROVE_TYPEHASH = keccak256(
        "Approve(bytes32 messageHash,address owner)"
    );
    
    constructor() EIP712("SignatureProcessor", "1") {}
    
    function _isApprovalValid(
        bytes32 messageHash,
        address owner,
        bytes memory signature
    ) internal view returns (bool) {
        bytes32 structHash = keccak256(
            abi.encode(
                APPROVE_TYPEHASH,
                messageHash,
                owner
            )
        );
        
        bytes32 hash = _hashTypedDataV4(structHash);
        address signer = ECDSA.recover(hash, signature);

        if (signer == address(0)) {
            return false;
        }

        if (signer != owner) {
            return false;
        }
        
        return true;
    }
    
    // Function to get the hash that should be signed offchain
    function getApprovalHash(
        bytes32 messageHash,
        address owner
    ) public view returns (bytes32) {
        bytes32 structHash = keccak256(
            abi.encode(
                APPROVE_TYPEHASH,
                messageHash,
                owner
            )
        );
        return _hashTypedDataV4(structHash);
    }
}