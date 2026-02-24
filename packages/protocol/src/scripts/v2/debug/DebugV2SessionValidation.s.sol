// SPDX-License-Identifier: MIT
pragma solidity ^0.8.19;

import "forge-std/Script.sol";
import "@openzeppelin/contracts/utils/cryptography/ECDSA.sol";
import "@openzeppelin/contracts/utils/cryptography/EIP712.sol";

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
        uint256 wager,
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

interface IAccountFactory {
    function getAccountAddress(address owner, uint256 index)
        external
        view
        returns (address);
}

/**
 * @title DebugV2SessionValidation
 * @notice Forge script to validate session key approval step by step
 * @dev Run with: forge script script/DebugV2SessionValidation.s.sol --rpc-url https://rpc.etherealtest.net -vvvv
 *
 * To simulate with an older timestamp (to avoid deadline expiration):
 *   forge script script/DebugV2SessionValidation.s.sol --rpc-url https://rpc.etherealtest.net -vvvv --fork-block-number <BLOCK>
 */
contract DebugV2SessionValidation is Script {
    // ========== CONFIGURATION ==========
    // These are the ACTUAL values from the debugging session
    // Update these with fresh values from your frontend logs

    address constant ESCROW = 0x8730eE1194Cd03A14deA9975e2bafD4C8b6019F1;

    // From v2SessionKeyApproval:
    address constant SESSION_KEY = 0xd94480250f03D10Fb003EfDffC05467b6EE16459;
    address constant OWNER = 0xefA0E8Aa84A713f6A6d4De8cC761Fe86c5957d72;
    address constant SMART_ACCOUNT = 0x5aab6F438Af9289798eEcBf83C06f62abdb529B9;
    uint256 constant VALID_UNTIL = 1_770_234_632;
    // permissionsHash = keccak256("MINT")
    bytes32 constant PERMISSIONS_HASH =
        0xd9762d852ca8dc23710c3bf3bca341b66f778a0c94cc060f0463687e9c260e9c;
    uint256 constant SESSION_CHAIN_ID = 13_374_202;

    // ========== END CONFIGURATION ==========

    function run() external view {
        console.log("=== V2 Session Key Validation Debug ===");
        console.log("Block timestamp:", block.timestamp);
        console.log("");

        IEscrowDebug escrowContract = IEscrowDebug(ESCROW);

        // Step 1: Check session key validity
        _checkSessionValidity();

        // Step 2: Verify chain ID
        _checkChainId();

        // Step 3: Verify smart account derivation
        _checkAccountDerivation(escrowContract);

        // Step 4: Show contract details
        _showContractDetails(escrowContract);
    }

    function _checkSessionValidity() internal view {
        console.log("Step 1: Session Key Validity");
        console.log("  Block timestamp:", block.timestamp);
        console.log("  validUntil:", VALID_UNTIL);
        if (block.timestamp <= VALID_UNTIL) {
            console.log("  Status: PASS");
        } else {
            console.log("  Status: FAIL (session expired!)");
        }
        console.log("");
    }

    function _checkChainId() internal view {
        console.log("Step 2: Chain ID Check");
        console.log("  SessionKeyApproval.chainId:", SESSION_CHAIN_ID);
        console.log("  block.chainid:", block.chainid);
        if (SESSION_CHAIN_ID == block.chainid) {
            console.log("  Status: PASS");
        } else {
            console.log("  Status: FAIL (chain ID mismatch!)");
        }
        console.log("");
    }

    function _checkAccountDerivation(IEscrowDebug escrowContract)
        internal
        view
    {
        console.log("Step 3: Smart Account Derivation");
        address factoryAddr = escrowContract.accountFactory();
        console.log("  AccountFactory:", factoryAddr);

        if (factoryAddr == address(0)) {
            console.log("  Status: FAIL (AccountFactory not set!)");
            return;
        }

        IAccountFactory factory = IAccountFactory(factoryAddr);
        address derived0 = factory.getAccountAddress(OWNER, 0);
        address derived1 = factory.getAccountAddress(OWNER, 1);

        console.log("  Owner:", OWNER);
        console.log("  Derived (index 0):", derived0);
        console.log("  Derived (index 1):", derived1);
        console.log("  Expected smartAccount:", SMART_ACCOUNT);

        if (derived0 == SMART_ACCOUNT || derived1 == SMART_ACCOUNT) {
            console.log("  Status: PASS");
        } else {
            console.log(
                "  Status: FAIL (smart account not derived from owner!)"
            );
        }
        console.log("");
    }

    function _showContractDetails(IEscrowDebug escrowContract) internal view {
        console.log("=== Contract Details ===");
        console.log("Escrow:", ESCROW);
        console.log("Domain separator:");
        console.logBytes32(escrowContract.domainSeparator());
        console.log("");

        console.log("PermissionsHash (MINT):");
        console.logBytes32(PERMISSIONS_HASH);
        console.log("");

        console.log("Nonce usage:");
        console.log(
            "  SmartAccount nonce 0 used:",
            escrowContract.isNonceUsed(SMART_ACCOUNT, 0)
        );
        console.log("");

        // Compute and show session approval hash
        bytes32 sessionHash = escrowContract.getSessionKeyApprovalHash(
            SESSION_KEY,
            SMART_ACCOUNT,
            VALID_UNTIL,
            PERMISSIONS_HASH,
            SESSION_CHAIN_ID
        );
        console.log("Session approval hash (for owner to sign):");
        console.logBytes32(sessionHash);
    }
}
