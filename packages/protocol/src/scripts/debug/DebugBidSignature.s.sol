// SPDX-License-Identifier: MIT
pragma solidity ^0.8.19;

import "forge-std/Script.sol";
import "@openzeppelin/contracts/utils/cryptography/ECDSA.sol";

/**
 * @title DebugBidSignature
 * @notice Forge script to debug the V2 bid signature mismatch
 * @dev Run with: forge script script/DebugBidSignature.s.sol --rpc-url https://rpc.etherealtest.net -vvvv
 *
 * This script tests what predictionHash the bidder signed vs what the contract expects.
 */
contract DebugBidSignature is Script {
    // ========== KNOWN VALUES FROM DEBUG LOGS ==========

    // Escrow contract
    address constant ESCROW = 0x8730eE1194Cd03A14deA9975e2bafD4C8b6019F1;

    // Addresses
    address constant PREDICTOR_SMART_ACCOUNT =
        0x5aab6F438Af9289798eEcBf83C06f62abdb529B9;
    address constant COUNTERPARTY_EOA =
        0xd8e6Af4901719176F0e2c89dEfAc30C12Ea6aB4B;

    // Collateral amounts (from debug logs)
    uint256 constant PREDICTOR_COLLATERAL = 6_300_000_000_000_000; // 0.0063 USDe
    uint256 constant COUNTERPARTY_COLLATERAL = 10_000_000_000_000_000; // 0.01 USDe

    // PickConfigId from logs
    bytes32 constant PICK_CONFIG_ID =
        0xcbb669689508534f93fb2a1dd73f67764194db20cf968f17e10b5f8522b093c0;

    // Counterparty signature (from bid)
    bytes constant COUNTERPARTY_SIGNATURE =
        hex"a4dc33e39523605261ece688048cbf6d7326e4efedb53473c7dccb5a23be5c2c3e2d23cca5758dc734b8a2440f4b63a698bbb1dc1b4ede446bc38e215cb4a2ba1b";

    // Counterparty's nonce and deadline
    uint256 constant COUNTERPARTY_NONCE = 5;
    uint256 constant COUNTERPARTY_DEADLINE = 1_770_232_931;

    // Contract's expected predictionHash
    bytes32 constant EXPECTED_PREDICTION_HASH =
        0x47270fbc48899f8885112dd1a17c5511d0c730643d8f038621374493ce01a733;

    // ========== END KNOWN VALUES ==========

    function run() external view {
        console.log("=== V2 Bid Signature Debug ===");
        console.log("");

        // Step 1: Compute predictionHash with mint-side values
        bytes32 predictionHash = _computePredictionHash(
            PICK_CONFIG_ID,
            PREDICTOR_COLLATERAL,
            COUNTERPARTY_COLLATERAL,
            PREDICTOR_SMART_ACCOUNT,
            COUNTERPARTY_EOA
        );

        console.log("Step 1: Compute predictionHash with mint values");
        console.log("  pickConfigId:", vm.toString(PICK_CONFIG_ID));
        console.log("  predictorCollateral:", PREDICTOR_COLLATERAL);
        console.log("  counterpartyCollateral:", COUNTERPARTY_COLLATERAL);

        console.log("  predictor:", PREDICTOR_SMART_ACCOUNT);
        console.log("  counterparty:", COUNTERPARTY_EOA);
        console.log("  => predictionHash:", vm.toString(predictionHash));
        console.log("  Expected:", vm.toString(EXPECTED_PREDICTION_HASH));
        console.log(
            "  Match:",
            predictionHash == EXPECTED_PREDICTION_HASH ? "YES" : "NO"
        );
        console.log("");

        // Step 2: Get the MintApproval hash from contract
        bytes32 mintApprovalHash = _getMintApprovalHash(
            predictionHash,
            COUNTERPARTY_EOA,
            COUNTERPARTY_COLLATERAL,
            COUNTERPARTY_NONCE,
            COUNTERPARTY_DEADLINE
        );

        console.log("Step 2: Get MintApproval hash for counterparty");
        console.log("  predictionHash:", vm.toString(predictionHash));
        console.log("  signer (counterparty):", COUNTERPARTY_EOA);
        console.log("  collateral:", COUNTERPARTY_COLLATERAL);
        console.log("  nonce:", COUNTERPARTY_NONCE);
        console.log("  deadline:", COUNTERPARTY_DEADLINE);
        console.log("  => mintApprovalHash:", vm.toString(mintApprovalHash));
        console.log("");

        // Step 3: Recover signer from signature
        address recovered =
            ECDSA.recover(mintApprovalHash, COUNTERPARTY_SIGNATURE);

        console.log("Step 3: Recover signer from counterparty signature");
        console.log("  Recovered:", recovered);
        console.log("  Expected:", COUNTERPARTY_EOA);
        console.log("  Match:", recovered == COUNTERPARTY_EOA ? "PASS" : "FAIL");
        console.log("");

        if (recovered != COUNTERPARTY_EOA) {
            console.log(
                "=== SIGNATURE MISMATCH - Testing alternative values ==="
            );
            console.log("");

            // Test with swapped collateral
            _testAlternativeHash(
                "Swapped collateral (counterparty=predictor, predictor=counterparty)",
                PICK_CONFIG_ID,
                COUNTERPARTY_COLLATERAL, // swap
                PREDICTOR_COLLATERAL, // swap
                PREDICTOR_SMART_ACCOUNT,
                COUNTERPARTY_EOA
            );

            // Test with role swap
            _testAlternativeHash(
                "Role swap (counterparty as predictor)",
                PICK_CONFIG_ID,
                PREDICTOR_COLLATERAL,
                COUNTERPARTY_COLLATERAL,
                COUNTERPARTY_EOA,
                PREDICTOR_SMART_ACCOUNT
            );

            // Test different nonces (maybe nonce changed)
            _testAlternativeNonce("nonce=4", 4);
            _testAlternativeNonce("nonce=6", 6);
            _testAlternativeNonce("nonce=0", 0);

            // Test with predictor's wager as signer's wager (maybe swapped in MintApproval)
            _testAlternativeMintApproval(
                "signer collateral = predictorCollateral",
                EXPECTED_PREDICTION_HASH,
                COUNTERPARTY_EOA,
                PREDICTOR_COLLATERAL, // use predictor wager as signer's wager
                COUNTERPARTY_NONCE,
                COUNTERPARTY_DEADLINE
            );

            // Test if bidder used a zero address for counterparty (like auction creation)
            _testAlternativeHash(
                "Zero counterparty (like auction creation)",
                PICK_CONFIG_ID,
                PREDICTOR_COLLATERAL,
                COUNTERPARTY_COLLATERAL,
                PREDICTOR_SMART_ACCOUNT,
                address(0) // zero address
            );

            // Test if the predictor address was the owner EOA instead of SmartAccount
            address OWNER_EOA = 0xefA0E8Aa84A713f6A6d4De8cC761Fe86c5957d72;
            _testAlternativeHash(
                "Predictor = Owner EOA (not SmartAccount)",
                PICK_CONFIG_ID,
                PREDICTOR_COLLATERAL,
                COUNTERPARTY_COLLATERAL,
                OWNER_EOA, // owner EOA
                COUNTERPARTY_EOA
            );
        }
    }

    function _testAlternativeNonce(string memory description, uint256 nonce)
        internal
        view
    {
        bytes32 altMintApprovalHash = _getMintApprovalHash(
            EXPECTED_PREDICTION_HASH,
            COUNTERPARTY_EOA,
            COUNTERPARTY_COLLATERAL,
            nonce,
            COUNTERPARTY_DEADLINE
        );
        address altRecovered =
            ECDSA.recover(altMintApprovalHash, COUNTERPARTY_SIGNATURE);
        console.log("Test nonce:", description);
        console.log("  Recovered:", altRecovered);
        console.log(
            "  Match:",
            altRecovered == COUNTERPARTY_EOA ? "*** FOUND IT! ***" : "no"
        );
        console.log("");
    }

    function _testAlternativeMintApproval(
        string memory description,
        bytes32 predictionHash,
        address signer,
        uint256 collateral,
        uint256 nonce,
        uint256 deadline
    ) internal view {
        bytes32 altMintApprovalHash = _getMintApprovalHash(
            predictionHash, signer, collateral, nonce, deadline
        );
        address altRecovered =
            ECDSA.recover(altMintApprovalHash, COUNTERPARTY_SIGNATURE);
        console.log("Test MintApproval:", description);
        console.log("  Recovered:", altRecovered);
        console.log(
            "  Match:",
            altRecovered == COUNTERPARTY_EOA ? "*** FOUND IT! ***" : "no"
        );
        console.log("");
    }

    function _testAlternativeHash(
        string memory description,
        bytes32 pickConfigId,
        uint256 predictorCollateral,
        uint256 counterpartyCollateral,
        address predictor,
        address counterparty
    ) internal view {
        bytes32 altPredictionHash = _computePredictionHash(
            pickConfigId,
            predictorCollateral,
            counterpartyCollateral,
            predictor,
            counterparty
        );

        bytes32 altMintApprovalHash = _getMintApprovalHash(
            altPredictionHash,
            COUNTERPARTY_EOA, // signer is always the counterparty EOA
            COUNTERPARTY_COLLATERAL,
            COUNTERPARTY_NONCE,
            COUNTERPARTY_DEADLINE
        );

        address altRecovered =
            ECDSA.recover(altMintApprovalHash, COUNTERPARTY_SIGNATURE);

        console.log("Test:", description);
        console.log("  predictionHash:", vm.toString(altPredictionHash));
        console.log("  Recovered:", altRecovered);
        console.log(
            "  Match:",
            altRecovered == COUNTERPARTY_EOA ? "*** FOUND IT! ***" : "no"
        );
        console.log("");
    }

    function _computePredictionHash(
        bytes32 pickConfigId,
        uint256 predictorCollateral,
        uint256 counterpartyCollateral,
        address predictor,
        address counterparty
    ) internal pure returns (bytes32) {
        return keccak256(
            abi.encode(
                pickConfigId,
                predictorCollateral,
                counterpartyCollateral,
                predictor,
                counterparty,
                address(0),
                ""
            )
        );
    }

    function _getMintApprovalHash(
        bytes32 predictionHash,
        address signer,
        uint256 collateral,
        uint256 nonce,
        uint256 deadline
    ) internal view returns (bytes32) {
        // Call the contract to get the hash
        (bool success, bytes memory result) = ESCROW.staticcall(
            abi.encodeWithSignature(
                "getMintApprovalHash(bytes32,address,uint256,uint256,uint256)",
                predictionHash,
                signer,
                collateral,
                nonce,
                deadline
            )
        );
        require(success, "getMintApprovalHash failed");
        return abi.decode(result, (bytes32));
    }
}
