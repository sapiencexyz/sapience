// SPDX-License-Identifier: MIT
pragma solidity ^0.8.19;

import "forge-std/Script.sol";
import "@openzeppelin/contracts/utils/cryptography/ECDSA.sol";

interface IEscrowDebug {
    function isNonceUsed(address account, uint256 nonce)
        external
        view
        returns (bool);
    function accountFactory() external view returns (address);
    function domainSeparator() external view returns (bytes32);
    function getMintApprovalHash(
        bytes32 predictionHash,
        address signer,
        uint256 collateral,
        uint256 nonce,
        uint256 deadline
    ) external view returns (bytes32);
    function getSessionKeyApprovalHash(
        address sessionKey,
        address smartAccount,
        uint256 validUntil,
        bytes32 permissionsHash,
        uint256 chainId
    ) external view returns (bytes32);
}

/**
 * @title DebugV2Signature
 * @notice Forge script to verify V2 signatures against the escrow contract
 * @dev Run with: forge script script/DebugV2Signature.s.sol --rpc-url https://rpc.etherealtest.net -vvvv --fork-block-number <BLOCK>
 *
 * IMPORTANT: Fill in the actual signature values from your frontend logs before running!
 */
contract DebugV2Signature is Script {
    // ========== CONTRACT ADDRESSES ==========
    address constant ESCROW = 0x8730eE1194Cd03A14deA9975e2bafD4C8b6019F1;

    // ========== SESSION KEY APPROVAL CONFIG ==========
    // Copy these from v2SessionKeyApproval in frontend logs
    address constant SESSION_KEY = 0xd94480250f03D10Fb003EfDffC05467b6EE16459;
    address constant OWNER = 0xefA0E8Aa84A713f6A6d4De8cC761Fe86c5957d72;
    address constant SMART_ACCOUNT = 0x5aab6F438Af9289798eEcBf83C06f62abdb529B9;
    uint256 constant VALID_UNTIL = 1_770_234_632;
    bytes32 constant PERMISSIONS_HASH =
        0xd9762d852ca8dc23710c3bf3bca341b66f778a0c94cc060f0463687e9c260e9c;
    uint256 constant SESSION_CHAIN_ID = 13_374_202;

    // ========== FILL IN THESE VALUES FROM FRONTEND LOGS ==========
    // Owner signature on SessionKeyApproval (v2SessionKeyApproval.ownerSignature)
    bytes constant OWNER_SIGNATURE = hex""; // <-- PASTE YOUR OWNER SIGNATURE HERE

    // Predictor's MintApproval values (from [V2 Submit] logs)
    bytes32 constant PREDICTION_HASH = bytes32(0); // <-- from [V2 Submit] Hash computation: predictionHash
    uint256 constant PREDICTOR_COLLATERAL = 0; // <-- from logs
    uint256 constant PREDICTOR_NONCE = 0; // <-- from logs
    uint256 constant PREDICTOR_DEADLINE = 0; // <-- from logs

    // Session key signature on MintApproval (predictorSignature)
    bytes constant SESSION_KEY_SIGNATURE = hex""; // <-- PASTE YOUR SESSION KEY SIGNATURE HERE

    // ========== END CONFIG ==========

    function run() external view {
        console.log("=== V2 Signature Debug ===");
        console.log("Block timestamp:", block.timestamp);
        console.log("");

        IEscrowDebug escrow = IEscrowDebug(ESCROW);

        // Verify owner signature on SessionKeyApproval
        _verifyOwnerSignature(escrow);

        // Verify session key signature on MintApproval
        _verifySessionKeySignature(escrow);
    }

    function _verifyOwnerSignature(IEscrowDebug escrow) internal view {
        console.log(
            "=== Step 1: Verify Owner Signature on SessionKeyApproval ==="
        );

        // Get the hash that the owner should have signed
        bytes32 sessionHash = escrow.getSessionKeyApprovalHash(
            SESSION_KEY,
            SMART_ACCOUNT,
            VALID_UNTIL,
            PERMISSIONS_HASH,
            SESSION_CHAIN_ID
        );
        console.log("Session approval hash (contract computed):");
        console.logBytes32(sessionHash);

        if (OWNER_SIGNATURE.length == 0) {
            console.log("");
            console.log(
                "!!! OWNER_SIGNATURE not provided - skipping verification"
            );
            console.log(
                "Fill in OWNER_SIGNATURE with v2SessionKeyApproval.ownerSignature from frontend logs"
            );
            console.log("");
            return;
        }

        address recovered = ECDSA.recover(sessionHash, OWNER_SIGNATURE);
        console.log("Recovered signer:", recovered);
        console.log("Expected owner:", OWNER);

        if (recovered == OWNER) {
            console.log("Status: PASS - Owner signature is valid!");
        } else {
            console.log(
                "Status: FAIL - Owner signature does NOT recover to owner!"
            );
            console.log("");
            console.log("Possible causes:");
            console.log("  1. Wrong signature");
            console.log("  2. Frontend computed different hash");
            console.log("  3. Domain separator mismatch");
        }
        console.log("");
    }

    function _verifySessionKeySignature(IEscrowDebug escrow) internal view {
        console.log(
            "=== Step 2: Verify Session Key Signature on MintApproval ==="
        );

        if (PREDICTION_HASH == bytes32(0)) {
            console.log(
                "!!! PREDICTION_HASH not provided - skipping verification"
            );
            console.log(
                "Fill in PREDICTION_HASH from [V2 Submit] Hash computation logs"
            );
            console.log("");
            return;
        }

        // Get the hash that the session key should have signed
        bytes32 mintHash = escrow.getMintApprovalHash(
            PREDICTION_HASH,
            SMART_ACCOUNT, // signer is the smart account
            PREDICTOR_COLLATERAL,
            PREDICTOR_NONCE,
            PREDICTOR_DEADLINE
        );
        console.log("Mint approval hash (contract computed):");
        console.logBytes32(mintHash);

        if (SESSION_KEY_SIGNATURE.length == 0) {
            console.log("");
            console.log(
                "!!! SESSION_KEY_SIGNATURE not provided - skipping verification"
            );
            console.log(
                "Fill in SESSION_KEY_SIGNATURE with predictorSignature from frontend logs"
            );
            console.log("");
            return;
        }

        address recovered = ECDSA.recover(mintHash, SESSION_KEY_SIGNATURE);
        console.log("Recovered signer:", recovered);
        console.log("Expected session key:", SESSION_KEY);

        if (recovered == SESSION_KEY) {
            console.log("Status: PASS - Session key signature is valid!");
        } else {
            console.log(
                "Status: FAIL - Session key signature does NOT recover to session key!"
            );
            console.log("");
            console.log("Possible causes:");
            console.log("  1. Wrong signature");
            console.log("  2. Different predictionHash");
            console.log("  3. Domain separator mismatch");
        }
        console.log("");
    }
}
