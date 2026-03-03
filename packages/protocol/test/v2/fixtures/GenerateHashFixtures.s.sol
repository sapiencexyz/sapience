// SPDX-License-Identifier: MIT
pragma solidity ^0.8.19;

import "forge-std/Script.sol";
import "src/v2/interfaces/IV2Types.sol";

/**
 * @title GenerateHashFixtures
 * @notice Generates golden hash fixtures from the REAL contract encoding logic.
 *         Output is consumed by the SDK's vitest suite to verify TypeScript ↔ Solidity parity.
 *
 * Run: forge script test/v2/fixtures/GenerateHashFixtures.s.sol -vvv
 * Then copy the logged JSON into packages/sdk/auction/__fixtures__/escrowHashes.json
 */
contract GenerateHashFixtures is Script {
    // Same test addresses as the vitest fixtures (checksummed)
    address constant PREDICTOR = 0x1111111111111111111111111111111111111111;
    address constant COUNTERPARTY = 0x2222222222222222222222222222222222222222;
    address constant ESCROW_CONTRACT = 0x3333333333333333333333333333333333333333;
    address constant SPONSOR = 0x4444444444444444444444444444444444444444;
    address constant RESOLVER_A = 0xaAaAaAaaAaAaAaaAaAAAAAAAAaaaAaAaAaaAaaAa;
    address constant RESOLVER_B = 0xbBbBBBBbbBBBbbbBbbBbbbbBBbBbbbbBbBbbBBbB;

    uint256 constant PREDICTOR_COLLATERAL = 1000000;
    uint256 constant COUNTERPARTY_COLLATERAL = 1000000;
    uint256 constant NONCE = 42;
    uint256 constant DEADLINE = 1700000000;

    bytes32 constant CONDITION_ID_A = 0xabababababababababababababababababababababababababababababababab;
    bytes32 constant CONDITION_ID_B = 0xcdcdcdcdcdcdcdcdcdcdcdcdcdcdcdcdcdcdcdcdcdcdcdcdcdcdcdcdcdcdcdcd;

    // Mirror SignatureValidator typehashes
    bytes32 constant MINT_APPROVAL_TYPEHASH = keccak256(
        "MintApproval(bytes32 predictionHash,address signer,uint256 collateral,uint256 nonce,uint256 deadline)"
    );
    bytes32 constant BURN_APPROVAL_TYPEHASH = keccak256(
        "BurnApproval(bytes32 burnHash,address signer,uint256 tokenAmount,uint256 payout,uint256 nonce,uint256 deadline)"
    );

    function run() external view {
        // --- pickConfigId (single pick) ---
        IV2Types.Pick[] memory picks = new IV2Types.Pick[](1);
        picks[0] = IV2Types.Pick({
            conditionResolver: RESOLVER_A,
            conditionId: CONDITION_ID_A,
            predictedOutcome: IV2Types.OutcomeSide.NO
        });
        bytes32 pickConfigId = keccak256(abi.encode(picks));

        // --- pickConfigId (two picks) ---
        IV2Types.Pick[] memory twoPicks = new IV2Types.Pick[](2);
        twoPicks[0] = IV2Types.Pick({
            conditionResolver: RESOLVER_A,
            conditionId: CONDITION_ID_A,
            predictedOutcome: IV2Types.OutcomeSide.NO
        });
        twoPicks[1] = IV2Types.Pick({
            conditionResolver: RESOLVER_B,
            conditionId: CONDITION_ID_B,
            predictedOutcome: IV2Types.OutcomeSide.YES
        });
        bytes32 twoPickConfigId = keccak256(abi.encode(twoPicks));

        // --- predictionHash (no sponsor) ---
        bytes32 predictionHashNoSponsor = keccak256(
            abi.encode(
                pickConfigId,
                PREDICTOR_COLLATERAL,
                COUNTERPARTY_COLLATERAL,
                PREDICTOR,
                COUNTERPARTY,
                address(0),
                bytes("")
            )
        );

        // --- predictionHash (with sponsor) ---
        bytes32 predictionHashWithSponsor = keccak256(
            abi.encode(
                pickConfigId,
                PREDICTOR_COLLATERAL,
                COUNTERPARTY_COLLATERAL,
                PREDICTOR,
                COUNTERPARTY,
                SPONSOR,
                bytes("")
            )
        );

        // --- predictionHash (with sponsor + data) ---
        bytes32 predictionHashWithSponsorData = keccak256(
            abi.encode(
                pickConfigId,
                PREDICTOR_COLLATERAL,
                COUNTERPARTY_COLLATERAL,
                PREDICTOR,
                COUNTERPARTY,
                SPONSOR,
                bytes(hex"1234")
            )
        );

        // --- burnHash ---
        bytes32 burnHash = keccak256(
            abi.encode(
                pickConfigId,
                uint256(500000),  // predictorTokenAmount
                uint256(500000),  // counterpartyTokenAmount
                PREDICTOR,        // predictorHolder
                COUNTERPARTY,     // counterpartyHolder
                uint256(1000000), // predictorPayout
                uint256(0)        // counterpartyPayout
            )
        );

        // --- MintApproval struct hash (for EIP-712) ---
        bytes32 mintStructHash = keccak256(
            abi.encode(
                MINT_APPROVAL_TYPEHASH,
                predictionHashNoSponsor,
                PREDICTOR,
                PREDICTOR_COLLATERAL,
                NONCE,
                DEADLINE
            )
        );

        // --- BurnApproval struct hash ---
        bytes32 burnStructHash = keccak256(
            abi.encode(
                BURN_APPROVAL_TYPEHASH,
                burnHash,
                PREDICTOR,
                uint256(500000),
                uint256(1000000),
                NONCE,
                DEADLINE
            )
        );

        // --- Output as JSON ---
        console.log("{");
        console.log("  \"pickConfigId\":");
        console.log("    \"%s\",", vm.toString(pickConfigId));
        console.log("  \"twoPickConfigId\":");
        console.log("    \"%s\",", vm.toString(twoPickConfigId));
        console.log("  \"predictionHashNoSponsor\":");
        console.log("    \"%s\",", vm.toString(predictionHashNoSponsor));
        console.log("  \"predictionHashWithSponsor\":");
        console.log("    \"%s\",", vm.toString(predictionHashWithSponsor));
        console.log("  \"predictionHashWithSponsorData\":");
        console.log("    \"%s\",", vm.toString(predictionHashWithSponsorData));
        console.log("  \"burnHash\":");
        console.log("    \"%s\",", vm.toString(burnHash));
        console.log("  \"mintApprovalStructHash\":");
        console.log("    \"%s\",", vm.toString(mintStructHash));
        console.log("  \"burnApprovalStructHash\":");
        console.log("    \"%s\"", vm.toString(burnStructHash));
        console.log("}");
    }
}
