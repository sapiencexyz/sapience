// SPDX-License-Identifier: MIT
pragma solidity ^0.8.19;

import "forge-std/Script.sol";
import "src/interfaces/IV2Types.sol";
import "src/utils/SignatureValidator.sol";
import "src/utils/SignatureProcessor.sol";

/**
 * @title GenerateHashFixtures
 * @notice Generates golden hash fixtures from the REAL contract encoding logic.
 *         Output is consumed by the SDK's vitest suite to verify TypeScript ↔ Solidity parity.
 *
 * Run: forge script test/fixtures/GenerateHashFixtures.s.sol --tc GenerateHashFixtures --via-ir -vvv
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

    // --- Internal helpers to avoid stack-too-deep in run() ---

    function _singlePickConfigId() internal pure returns (bytes32) {
        IV2Types.Pick[] memory picks = new IV2Types.Pick[](1);
        picks[0] = IV2Types.Pick({
            conditionResolver: RESOLVER_A,
            conditionId: abi.encode(CONDITION_ID_A),
            predictedOutcome: IV2Types.OutcomeSide.NO
        });
        return keccak256(abi.encode(picks));
    }

    function _twoPickConfigId() internal pure returns (bytes32) {
        IV2Types.Pick[] memory twoPicks = new IV2Types.Pick[](2);
        twoPicks[0] = IV2Types.Pick({
            conditionResolver: RESOLVER_A,
            conditionId: abi.encode(CONDITION_ID_A),
            predictedOutcome: IV2Types.OutcomeSide.NO
        });
        twoPicks[1] = IV2Types.Pick({
            conditionResolver: RESOLVER_B,
            conditionId: abi.encode(CONDITION_ID_B),
            predictedOutcome: IV2Types.OutcomeSide.YES
        });
        return keccak256(abi.encode(twoPicks));
    }

    function _predictionHash(
        bytes32 pickConfigId,
        address sponsor,
        bytes memory sponsorData
    ) internal pure returns (bytes32) {
        return keccak256(
            abi.encode(
                pickConfigId,
                PREDICTOR_COLLATERAL,
                COUNTERPARTY_COLLATERAL,
                PREDICTOR,
                COUNTERPARTY,
                sponsor,
                sponsorData
            )
        );
    }

    function _burnHash(bytes32 pickConfigId) internal pure returns (bytes32) {
        return keccak256(
            abi.encode(
                pickConfigId,
                uint256(500_000),
                uint256(500_000),
                PREDICTOR,
                COUNTERPARTY,
                uint256(1_000_000),
                uint256(0)
            )
        );
    }

    function _mintStructHash(bytes32 predictionHash)
        internal
        view
        returns (bytes32)
    {
        return keccak256(
            abi.encode(
                validator.MINT_APPROVAL_TYPEHASH(),
                predictionHash,
                PREDICTOR,
                PREDICTOR_COLLATERAL,
                NONCE,
                DEADLINE
            )
        );
    }

    function _burnStructHash(bytes32 burnHashVal)
        internal
        view
        returns (bytes32)
    {
        return keccak256(
            abi.encode(
                validator.BURN_APPROVAL_TYPEHASH(),
                burnHashVal,
                PREDICTOR,
                uint256(500_000),
                uint256(1_000_000),
                NONCE,
                DEADLINE
            )
        );
    }

    function run() external view {
        bytes32 pickConfigId = _singlePickConfigId();
        bytes32 twoPickConfigId = _twoPickConfigId();
        bytes32 predictionHashNoSponsor =
            _predictionHash(pickConfigId, address(0), bytes(""));
        bytes32 predictionHashWithSponsor =
            _predictionHash(pickConfigId, SPONSOR, bytes(""));
        bytes32 predictionHashWithSponsorData =
            _predictionHash(pickConfigId, SPONSOR, bytes(hex"1234"));
        bytes32 burnHashVal = _burnHash(pickConfigId);
        bytes32 mintStructHashVal = _mintStructHash(predictionHashNoSponsor);
        bytes32 burnStructHashVal = _burnStructHash(burnHashVal);

        _logJson(
            pickConfigId,
            twoPickConfigId,
            predictionHashNoSponsor,
            predictionHashWithSponsor,
            predictionHashWithSponsorData,
            burnHashVal,
            mintStructHashVal,
            burnStructHashVal
        );
    }

    function _logJson(
        bytes32 pickConfigId,
        bytes32 twoPickConfigId,
        bytes32 predictionHashNoSponsor,
        bytes32 predictionHashWithSponsor,
        bytes32 predictionHashWithSponsorData,
        bytes32 burnHashVal,
        bytes32 mintStructHashVal,
        bytes32 burnStructHashVal
    ) internal view {
        console.log("{");
        console.log(
            "  \"pickConfigId\":\n    \"%s\",", vm.toString(pickConfigId)
        );
        console.log(
            "  \"twoPickConfigId\":\n    \"%s\",", vm.toString(twoPickConfigId)
        );
        console.log(
            "  \"predictionHashNoSponsor\":\n    \"%s\",",
            vm.toString(predictionHashNoSponsor)
        );
        console.log(
            "  \"predictionHashWithSponsor\":\n    \"%s\",",
            vm.toString(predictionHashWithSponsor)
        );
        console.log(
            "  \"predictionHashWithSponsorData\":\n    \"%s\",",
            vm.toString(predictionHashWithSponsorData)
        );
        console.log("  \"burnHash\":\n    \"%s\",", vm.toString(burnHashVal));
        console.log(
            "  \"mintApprovalStructHash\":\n    \"%s\",",
            vm.toString(mintStructHashVal)
        );
        console.log(
            "  \"burnApprovalStructHash\":\n    \"%s\",",
            vm.toString(burnStructHashVal)
        );

        _logJsonPart2(mintStructHashVal, burnStructHashVal);
    }

    function _logJsonPart2(bytes32 mintStructHashVal, bytes32 burnStructHashVal)
        internal
        view
    {
        console.log(
            "  \"mintPermission\":\n    \"%s\",",
            vm.toString(validator.MINT_PERMISSION())
        );
        console.log(
            "  \"burnPermission\":\n    \"%s\",",
            vm.toString(validator.BURN_PERMISSION())
        );
        console.log(
            "  \"approveTypehash\":\n    \"%s\",",
            vm.toString(processor.APPROVE_TYPEHASH())
        );
        console.log(
            "  \"mintApprovalDigest\":\n    \"%s\",",
            vm.toString(validator.hashTypedDataV4(mintStructHashVal))
        );
        console.log(
            "  \"burnApprovalDigest\":\n    \"%s\",",
            vm.toString(validator.hashTypedDataV4(burnStructHashVal))
        );
        console.log("  \"domainChainId\":\n    %s,", vm.toString(block.chainid));
        console.log(
            "  \"domainVerifyingContract\":\n    \"%s\"",
            vm.toString(address(validator))
        );
        console.log("}");
    }
}

/**
 * @notice Concrete implementation of SignatureProcessor for accessing APPROVE_TYPEHASH
 */
contract SignatureProcessorHarness is SignatureProcessor {
    constructor() { }
}

/**
 * @notice Concrete implementation of SignatureValidator for accessing public constants
 */
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
