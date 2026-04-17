// SPDX-License-Identifier: MIT
pragma solidity ^0.8.19;

import { IV2Types } from "./IV2Types.sol";

/**
 * @title ICommittedIntent
 * @notice Canonical structs, errors and events for the Committed-Intent flow.
 * @dev See prd-001-spec-0.1-canonical.md §1 for authoritative field order.
 */
interface ICommittedIntent {
    // ============ Structs ============

    /// @notice Predictor-signed commitment.
    /// @dev Field order is canonical (prd-001-spec-0.1-canonical.md §1.1). SDK
    ///      and contract MUST encode/hash in this order.
    struct Commitment {
        address predictor; // 1
        uint64 predictorWindowEnd; // 2 — end of T₁ (predictor-exclusive window)
        uint64 deadline; // 3 — end of T₂ (expiry)
        bytes32 pickConfigId; // 4
        uint256 amountIn; // 5
        uint256 minFillIn; // 6
        uint256 minAmountOut; // 7
        uint256 executorTip; // 8 — escrowed separately from amountIn
        uint256 nonce; // 9 — independent bitmap (A-6)
    }

    /// @notice Counterparty-signed quote against a commitment.
    struct Quote {
        address counterparty; // 1
        uint64 deadline; // 2 — must be ≤ commitment.deadline
        bytes32 commitmentHash; // 3
        uint256 maxIn; // 4
        uint256 amountOut; // 5
        uint256 nonce; // 6
    }

    // ============ Errors ============

    error CI_Expired();
    error CI_NotYetExecutable();
    error CI_InvalidWindow();
    error CI_AlreadySettled();
    error CI_InvalidPredictorSig();
    error CI_InvalidCounterpartySig(uint256 quoteIndex);
    error CI_QuoteCommitmentMismatch(uint256 quoteIndex);
    error CI_QuoteExpired(uint256 quoteIndex);
    error CI_QuoteReused(uint256 quoteIndex);
    error CI_NonMonotonicQuotes(uint256 quoteIndex);
    error CI_BelowMinFillIn(uint256 filled, uint256 minFillIn);
    error CI_BelowMinAmountOut(uint256 aggOut, uint256 minAmountOut);
    error CI_TipUnderfunded();
    error CI_NotPredictor();
    error CI_NonceAlreadyUsed();
    error CI_PicksMismatch();

    // ============ Events ============

    event CommitmentCreated(
        bytes32 indexed commitmentHash,
        address indexed predictor,
        bytes32 indexed pickConfigId,
        uint256 amountIn,
        uint256 minFillIn,
        uint256 minAmountOut,
        uint64 predictorWindowEnd,
        uint64 deadline,
        uint256 executorTip,
        uint256 nonce,
        uint256 sponsorUse,
        uint256 walletUse
    );

    event Executed(
        bytes32 indexed commitmentHash,
        address indexed caller,
        uint256 filledIn,
        uint256 filledOut,
        uint256 refundedIn,
        uint256 tipPaid
    );

    event SliceFilled(
        bytes32 indexed commitmentHash,
        uint256 indexed sliceIndex,
        bytes32 indexed quoteHash,
        address counterparty,
        uint256 sliceIn,
        uint256 sliceOut,
        uint256 sliceBonusCollateral,
        bytes32 predictionId
    );

    event CommitmentExpired(
        bytes32 indexed commitmentHash,
        address indexed caller,
        uint256 walletRefunded,
        uint256 sponsorReleased
    );

    event CounterpartySlashed(
        bytes32 indexed commitmentHash,
        address indexed counterparty,
        uint256 vaultDrained,
        uint256 makeWhole,
        uint256 poolContribution,
        uint256 poolReceived
    );

    event InsurancePoolFunded(
        bytes32 indexed commitmentHash,
        address indexed fromCounterparty,
        uint256 amount
    );

    event InsurancePoolDrawn(bytes32 indexed commitmentHash, uint256 amount);

    // ============ Public entrypoints (informational) ============

    /// @notice Lock escrow for a signed commitment.
    function commit(Commitment calldata c, bytes calldata predictorSig) external;

    /// @notice Execute a commitment against a set of counterparty quotes.
    function execute(
        Commitment calldata c,
        bytes calldata predictorSig,
        IV2Types.Pick[] calldata picks,
        Quote[] calldata quotes,
        bytes[] calldata counterpartySigs,
        address tipRecipient
    ) external;

    /// @notice Expire a commitment after deadline, releasing escrow.
    function expire(Commitment calldata c, bytes calldata predictorSig) external;

    // ============ Public getters ============

    function commitmentHash(Commitment calldata c)
        external
        view
        returns (bytes32);

    function quoteHash(Quote calldata q) external view returns (bytes32);

    function DOMAIN_SEPARATOR() external view returns (bytes32);
}
