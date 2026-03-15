// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "forge-std/Script.sol";
import "forge-std/console.sol";
import "../../PredictionMarketEscrow.sol";
import "../../interfaces/IV2Types.sol";

/**
 * @title DebugV2SignatureValidation
 * @notice Debug signature validation by calling view functions
 *
 * Run with:
 * forge script script/DebugV2SignatureValidation.s.sol --rpc-url https://rpc.etherealtest.net --fork-block-number 2202000 -vvvv
 */
contract DebugV2SignatureValidation is Script {
    address constant ESCROW = 0x8730eE1194Cd03A14deA9975e2bafD4C8b6019F1;
    address constant PREDICTOR = 0x5aab6F438Af9289798eEcBf83C06f62abdb529B9;
    address constant COUNTERPARTY = 0xd8e6Af4901719176F0e2c89dEfAc30C12Ea6aB4B;
    address constant RESOLVER = 0x514A4321d89Aa47D1b1Dd9E0a3226249E6ef896A;

    function run() external view {
        console.log("=== Signature Validation Debug ===");
        console.log("Block timestamp:", block.timestamp);

        PredictionMarketEscrow escrow = PredictionMarketEscrow(payable(ESCROW));

        // Build picks to compute pickConfigId and predictionHash
        IV2Types.Pick[] memory picks = new IV2Types.Pick[](2);
        picks[0] = IV2Types.Pick({
            conditionResolver: RESOLVER,
            conditionId: abi.encode(
                bytes32(
                    0xa8cf9bbc27d7def898d24e05d684f2bc95aa563ebf497998cfd5edb5f995a228
                )
            ),
            predictedOutcome: IV2Types.OutcomeSide.YES
        });
        picks[1] = IV2Types.Pick({
            conditionResolver: RESOLVER,
            conditionId: abi.encode(
                bytes32(
                    0xaa29c399d3701dd41fd76dc0ed57be0e53cbfff0632420974cebee5a58b4f016
                )
            ),
            predictedOutcome: IV2Types.OutcomeSide.NO
        });

        // Compute pickConfigId (same as contract)
        bytes32 pickConfigId = keccak256(abi.encode(picks));
        console.log("pickConfigId:");
        console.logBytes32(pickConfigId);

        uint256 predictorCollateral = 5_100_000_000_000_000;
        uint256 counterpartyCollateral = 10_000_000_000_000_000;

        // Compute predictionHash (same as contract)
        bytes32 predictionHash = keccak256(
            abi.encode(
                pickConfigId,
                predictorCollateral,
                counterpartyCollateral,
                PREDICTOR,
                COUNTERPARTY,
                address(0),
                ""
            )
        );
        console.log("predictionHash:");
        console.logBytes32(predictionHash);

        // Get contract's computed hash for counterparty
        bytes32 contractCounterpartyHash = escrow.getMintApprovalHash(
            predictionHash,
            COUNTERPARTY,
            counterpartyCollateral,
            5, // counterpartyNonce
            1_770_244_820 // counterpartyDeadline
        );
        console.log("Contract's counterparty MintApprovalHash:");
        console.logBytes32(contractCounterpartyHash);

        // Get contract's computed hash for predictor
        bytes32 contractPredictorHash = escrow.getMintApprovalHash(
            predictionHash,
            PREDICTOR,
            predictorCollateral,
            0, // predictorNonce
            1_770_245_065 // predictorDeadline
        );
        console.log("Contract's predictor MintApprovalHash:");
        console.logBytes32(contractPredictorHash);

        // Decode the session key data to see what values are in it
        bytes memory sessionKeyData =
            hex"00000000000000000000000083236e9d2170ffe24fb620c81aacef049116da54000000000000000000000000efa0e8aa84a713f6a6d4de8cc761fe86c5957d7200000000000000000000000000000000000000000000000000000000698d04c8d9762d852ca8dc23710c3bf3bca341b66f778a0c94cc060f0463687e9c260e9c0000000000000000000000000000000000000000000000000000000000cc12fa00000000000000000000000000000000000000000000000000000000000000c00000000000000000000000000000000000000000000000000000000000000041e716031e242e506e7faa4eb96f1909e7dd0696ac3be5cc73fbfdd4c89bce525a74c92b749ee63f11732d3da4777d50ddb910b7d66e8c446ce0ee3cc55e3d685d1b00000000000000000000000000000000000000000000000000000000000000";

        IV2Types.SessionKeyData memory skData =
            abi.decode(sessionKeyData, (IV2Types.SessionKeyData));
        console.log("\nDecoded SessionKeyData:");
        console.log("  sessionKey:", skData.sessionKey);
        console.log("  owner:", skData.owner);
        console.log("  validUntil:", skData.validUntil);
        console.log("  permissionsHash:");
        console.logBytes32(skData.permissionsHash);
        console.log("  chainId:", skData.chainId);
        console.log("  ownerSignature length:", skData.ownerSignature.length);

        // Check if chainId matches
        console.log("\nChainId check:");
        console.log("  SessionKeyData chainId:", skData.chainId);
        console.log("  block.chainid:", block.chainid);
        console.log("  Match:", skData.chainId == block.chainid);

        // Get SessionKeyApproval hash from contract
        bytes32 sessionApprovalHash = escrow.getSessionKeyApprovalHash(
            skData.sessionKey,
            PREDICTOR, // smartAccount
            skData.validUntil,
            skData.permissionsHash,
            skData.chainId
        );
        console.log("\nContract's SessionKeyApprovalHash:");
        console.logBytes32(sessionApprovalHash);

        // Try to recover the owner from the session key approval
        console.log("\nAttempting to recover owner from ownerSignature...");
        // This would require ECDSA.recover which we can't call directly here

        // Check account factory
        address factoryAddr = address(escrow.accountFactory());
        console.log("\nAccountFactory:", factoryAddr);

        // Check if smart account is derived correctly
        IZeroDevAccountFactory factory = IZeroDevAccountFactory(factoryAddr);
        address derivedAccount0 = factory.getAccountAddress(skData.owner, 0);
        address derivedAccount1 = factory.getAccountAddress(skData.owner, 1);
        console.log("Derived account (index 0):", derivedAccount0);
        console.log("Derived account (index 1):", derivedAccount1);
        console.log("Expected smart account:", PREDICTOR);
        console.log("Match index 0:", derivedAccount0 == PREDICTOR);
        console.log("Match index 1:", derivedAccount1 == PREDICTOR);
    }
}

interface IZeroDevAccountFactory {
    function getAccountAddress(address owner, uint256 index)
        external
        view
        returns (address);
}
