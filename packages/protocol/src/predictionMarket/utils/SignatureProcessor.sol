// SPDX-License-Identifier: MIT
pragma solidity ^0.8.19;

import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/utils/cryptography/ECDSA.sol";
import "@openzeppelin/contracts/utils/cryptography/EIP712.sol";
import "@openzeppelin/contracts/token/ERC20/extensions/IERC20Permit.sol";

abstract contract SignatureProcessor is EIP712 {
    bytes32 public constant APPROVE_TYPEHASH = keccak256(
        "Approve(bytes32 messageHash,address owner,uint256 nonce)"
    );
    
    mapping(address => uint256) public nonces;
    
    constructor() EIP712("SignatureProcessor", "1") {}
    
    function _isApprovalValid(
        bytes32 messageHash,
        address owner,
        bytes memory signature
    ) internal returns (bool) {
        uint256 nonce = nonces[owner]++;
        
        bytes32 structHash = keccak256(
            abi.encode(
                APPROVE_TYPEHASH,
                messageHash,
                owner,
                nonce
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
        address owner,
        uint256 nonce
    ) public view returns (bytes32) {
        bytes32 structHash = keccak256(
            abi.encode(
                APPROVE_TYPEHASH,
                messageHash,
                owner,
                nonce
            )
        );
        return _hashTypedDataV4(structHash);
    }
    
    // Function to get the current nonce of a user
    function getNonce(address user) public view returns (uint256) {
        return nonces[user];
    }

    function _callPermit(
        address token,
        address spender,
        uint256 amount,
        uint256 deadline,
        bytes memory signature
    ) internal {
        (uint8 v, bytes32 r, bytes32 s) = _splitSignature(signature);
        IERC20Permit(token).permit(msg.sender, spender, amount, deadline, v, r, s);
    }

    /**
     * @dev Function to split a signature into v, r, s
     */
    function _splitSignature(bytes memory signature) 
        internal 
        pure 
        returns (uint8 v, bytes32 r, bytes32 s) 
    {
        require(signature.length == 65, "Invalid signature length");
        
        assembly {
            // The first 32 bytes (after the length) are r
            r := mload(add(signature, 32))
            // The next 32 bytes are s
            s := mload(add(signature, 64))
            // The last byte is v
            v := byte(0, mload(add(signature, 96)))
        }
        
        // Adjust v if necessary (some wallets use 0/1 instead of 27/28)
        if (v < 27) {
            v += 27;
        }
        
        return (v, r, s);
    }
}