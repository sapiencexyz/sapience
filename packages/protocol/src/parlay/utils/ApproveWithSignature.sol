// SPDX-License-Identifier: MIT
pragma solidity ^0.8.19;

import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/utils/cryptography/ECDSA.sol";
import "@openzeppelin/contracts/utils/cryptography/EIP712.sol";

contract ApproveWithSignature is EIP712 {
    bytes32 public constant APPROVE_TYPEHASH = keccak256(
        "Approve(address token,address spender,uint256 amount,uint256 nonce)"
    );
    
    mapping(address => uint256) public nonces;
    
    constructor() EIP712("ApproveWithSignature", "1") {}
    
    function approveWithSignature(
        address token,
        address spender,
        uint256 amount,
        bytes memory signature
    ) public returns (bool) {
        address owner = msg.sender;
        uint256 nonce = nonces[owner]++;
        
        bytes32 structHash = keccak256(
            abi.encode(
                APPROVE_TYPEHASH,
                token,
                spender,
                amount,
                nonce
            )
        );
        
        bytes32 hash = _hashTypedDataV4(structHash);
        address signer = ECDSA.recover(hash, signature);
        
        require(signer == owner, "Invalid signature");
        require(signer != address(0), "Invalid signer");
        
        // The owner (signer) approves tokens for the spender
        IERC20(token).approve(spender, amount);
        return true;
    }
    
    // Function to get the hash that should be signed offchain
    function getApprovalHash(
        address token,
        address spender,
        uint256 amount,
        uint256 nonce
    ) public view returns (bytes32) {
        bytes32 structHash = keccak256(
            abi.encode(
                APPROVE_TYPEHASH,
                token,
                spender,
                amount,
                nonce
            )
        );
        return _hashTypedDataV4(structHash);
    }
    
    // Function to get the current nonce of a user
    function getNonce(address user) public view returns (uint256) {
        return nonces[user];
    }
}