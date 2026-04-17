// SPDX-License-Identifier: MIT
pragma solidity ^0.8.19;

/**
 * @title IPreMintEscrow
 * @notice Holds predictor collateral + executor tip between commit and execute/expire.
 * @dev See prd-001-spec-0.1-canonical.md §1.8 for authoritative shape.
 */
interface IPreMintEscrow {
    /// @notice Lock the predictor's `amountIn` + `executorTip` for a commitment.
    /// @dev Executor-only. `sponsorUse + walletUse == amountIn`. Executor tip
    ///      is pulled from the predictor's wallet (not sponsored) per A-8.
    function lock(
        bytes32 commitmentHash,
        address predictor,
        uint256 amountIn,
        uint256 executorTip,
        uint256 sponsorUse,
        uint256 walletUse,
        address predictorSponsor,
        bytes calldata predictorSponsorData
    ) external;

    /// @notice Settle a commitment deposit: transfer `filledIn` to the
    ///         collateral sink, refund the rest sponsor-first-then-wallet,
    ///         and pay the executor tip if `tipPaid > 0`.
    /// @dev Executor-only. Returns wallet amount refunded as credit +
    ///      sponsor amount released.
    function settle(
        bytes32 commitmentHash,
        uint256 filledIn,
        address collateralSink,
        uint256 tipPaid,
        address tipRecipient
    ) external returns (uint256 refundedWallet, uint256 releasedSponsor);

    /// @notice Release the entire deposit (used by `expire`). Wallet portion
    ///         becomes credit; sponsor portion is released back to the sponsor.
    function releaseAll(bytes32 commitmentHash)
        external
        returns (uint256 refundedWallet, uint256 releasedSponsor);

    /// @notice Withdraw accumulated wallet-side credit.
    function withdrawCredit(address predictor, uint256 amount) external;

    /// @notice Wallet-side credit balance owned by `predictor`.
    function creditOf(address predictor) external view returns (uint256);
}
