// SPDX-License-Identifier: MIT
pragma solidity ^0.8.19;

import "forge-std/Script.sol";
import "src/v2/interfaces/IV2Types.sol";
import "src/v2/utils/SignatureValidator.sol";
import "src/v2/utils/SignatureProcessor.sol";

/**
 * @title GenerateHashFixtures
 * @notice Generates golden hash fixtures from the REAL contract encoding logic.
 *         Output is consumed by the SDK's vitest suite to verify TypeScript ↔ Solidity parity.
 *
 * Run: forge script test/v2/fixtures/GenerateHashFixtures.s.sol -vvv
 * Then copy the logged JSON into packages/sdk/auction/__fixtures__/escrowHashes.json
 */
contract GenerateHashFixtures is Script {
    // Instantiate concrete harnesses to access public constants
    SignatureValidatorHarness private validator =
        new SignatureValidatorHarness();
    SignatureProcessorHarness private processor =
        new SignatureProcessorHarness();
    // Same test addresses as the vitest fixtures (checksummed)
    address constant PREDICTOR = 0x1111111111111111111111111111111111111111;
    address constant COUNTERPARTY = 0x2222222222222222222222222222222222222222;
    address constant ESCROW_CONTRACT =
        0x3333333333333333333333333333333333333333;
    address constant SPONSOR = 0x4444444444444444444444444444444444444444;
    address constant RESOLVER_A = 0xaAaAaAaaAaAaAaaAaAAAAAAAAaaaAaAaAaaAaaAa;
    address constant RESOLVER_B = 0xbBbBBBBbbBBBbbbBbbBbbbbBBbBbbbbBbBbbBBbB;

    uint256 constant PREDICTOR_COLLATERAL = 1_000_000;
    uint256 constant COUNTERPARTY_COLLATERAL = 1_000_000;
    uint256 constant NONCE = 42;
    uint256 constant DEADLINE = 1_700_000_000;

    bytes32 constant CONDITION_ID_A =
        0xabababababababababababababababababababababababababababababababab;
    bytes32 constant CONDITION_ID_B =
        0xcdcdcdcdcdcdcdcdcdcdcdcdcdcdcdcdcdcdcdcdcdcdcdcdcdcdcdcdcdcdcdcd;

    // Typehashes imported directly from the contract — no copies

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
                uint256(500_000), // predictorTokenAmount
                uint256(500_000), // counterpartyTokenAmount
                PREDICTOR, // predictorHolder
                COUNTERPARTY, // counterpartyHolder
                uint256(1_000_000), // predictorPayout
                uint256(0) // counterpartyPayout
            )
        );

        // --- MintApproval struct hash (for EIP-712) ---
        bytes32 mintStructHash = keccak256(
            abi.encode(
                validator.MINT_APPROVAL_TYPEHASH(),
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
                validator.BURN_APPROVAL_TYPEHASH(),
                burnHash,
                PREDICTOR,
                uint256(500_000),
                uint256(1_000_000),
                NONCE,
                DEADLINE
            )
        );

        // --- Permission hashes (catches #1156: keccak256("V2_MINT") vs keccak256("MINT")) ---
        bytes32 mintPermission = validator.MINT_PERMISSION();
        bytes32 burnPermission = validator.BURN_PERMISSION();

        // --- Vault SignatureProcessor constants (catches #118) ---
        bytes32 approveTypehash = processor.APPROVE_TYPEHASH();

        // --- Full _hashTypedDataV4 for MintApproval (includes EIP-712 domain separator) ---
        // Uses the harness's domain: name="PredictionMarketEscrow", version="1"
        // Note: chainId and verifyingContract come from the harness deployment context,
        // so we output the domain separator separately for the SDK to reconstruct.
        bytes32 mintApprovalDigest = validator.hashTypedDataV4(mintStructHash);

        // --- Full _hashTypedDataV4 for BurnApproval ---
        bytes32 burnApprovalDigest = validator.hashTypedDataV4(burnStructHash);

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
        console.log("    \"%s\",", vm.toString(burnStructHash));
        console.log("  \"mintPermission\":");
        console.log("    \"%s\",", vm.toString(mintPermission));
        console.log("  \"burnPermission\":");
        console.log("    \"%s\",", vm.toString(burnPermission));
        console.log("  \"approveTypehash\":");
        console.log("    \"%s\",", vm.toString(approveTypehash));
        console.log("  \"mintApprovalDigest\":");
        console.log("    \"%s\",", vm.toString(mintApprovalDigest));
        console.log("  \"burnApprovalDigest\":");
        console.log("    \"%s\",", vm.toString(burnApprovalDigest));
        console.log("  \"domainChainId\":");
        console.log("    %s,", vm.toString(block.chainid));
        console.log("  \"domainVerifyingContract\":");
        console.log("    \"%s\"", vm.toString(address(validator)));
        console.log("}");
    }
}

/**
 * @notice Concrete implementation of SignatureValidator for accessing public constants
 */
contract SignatureProcessorHarness is SignatureProcessor {
    constructor() { }
}

contract SignatureValidatorHarness is SignatureValidator {
    constructor() { }

    /// @notice Expose internal _hashTypedDataV4 for fixture generation
    function hashTypedDataV4(bytes32 structHash)
        external
        view
        returns (bytes32)
    {
        return _hashTypedDataV4(structHash);
    }
}
