// SPDX-License-Identifier: MIT
pragma solidity ^0.8.19;

import "forge-std/Script.sol";
import "../../interfaces/IV2Types.sol";

interface IEscrowDebug {
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
    function computePickConfigId(IV2Types.Pick[] calldata picks)
        external
        pure
        returns (bytes32);
}

contract DebugV2Hashes is Script {
    function run() external view {
        IEscrowDebug escrow =
            IEscrowDebug(0x8730eE1194Cd03A14deA9975e2bafD4C8b6019F1);

        // Build picks array
        IV2Types.Pick[] memory picks = new IV2Types.Pick[](2);
        picks[0] = IV2Types.Pick({
            conditionResolver: 0x514A4321d89Aa47D1b1Dd9E0a3226249E6ef896A,
            conditionId: abi.encode(
                bytes32(
                    0x989603653056b8f9008bee9e97c0a757697ce0bee0410a8516008e41656037cd
                )
            ),
            predictedOutcome: IV2Types.OutcomeSide.YES
        });
        picks[1] = IV2Types.Pick({
            conditionResolver: 0x514A4321d89Aa47D1b1Dd9E0a3226249E6ef896A,
            conditionId: abi.encode(
                bytes32(
                    0xa8cf9bbc27d7def898d24e05d684f2bc95aa563ebf497998cfd5edb5f995a228
                )
            ),
            predictedOutcome: IV2Types.OutcomeSide.YES
        });

        // Compute pickConfigId
        bytes32 pickConfigId = keccak256(abi.encode(picks));
        console.log("=== Pick Config ID ===");
        console.logBytes32(pickConfigId);

        // Addresses and amounts
        address predictor = 0x5aab6F438Af9289798eEcBf83C06f62abdb529B9;
        address counterparty = 0xd8e6Af4901719176F0e2c89dEfAc30C12Ea6aB4B;
        uint256 predictorCollateral = 7_100_000_000_000_000;
        uint256 counterpartyCollateral = 10_000_000_000_000_000;

        // Compute prediction hash (same as contract)
        bytes32 predictionHash = keccak256(
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
        console.log("\n=== Prediction Hash ===");
        console.logBytes32(predictionHash);

        // Predictor mint approval hash
        bytes32 predictorHash = escrow.getMintApprovalHash(
            predictionHash, predictor, predictorCollateral, 0, 1_770_219_190
        );
        console.log("\n=== Predictor Mint Approval Hash ===");
        console.logBytes32(predictorHash);

        // Counterparty mint approval hash
        bytes32 counterpartyHash = escrow.getMintApprovalHash(
            predictionHash,
            counterparty,
            counterpartyCollateral,
            5,
            1_770_218_941
        );
        console.log("\n=== Counterparty Mint Approval Hash ===");
        console.logBytes32(counterpartyHash);

        // Session key approval hash
        address sessionKey = 0xBbB00443e1bB97c8f89e5343E78645dF439c971a;
        bytes32 permissionsHash =
            0xd9762d852ca8dc23710c3bf3bca341b66f778a0c94cc060f0463687e9c260e9c;
        uint256 validUntil = 1_770_823_613;
        uint256 sessionChainId = 13_374_202;

        bytes32 sessionHash = escrow.getSessionKeyApprovalHash(
            sessionKey, predictor, validUntil, permissionsHash, sessionChainId
        );
        console.log("\n=== Session Key Approval Hash (owner signs this) ===");
        console.logBytes32(sessionHash);
    }
}
