// SPDX-License-Identifier: MIT
pragma solidity ^0.8.19;

/**
 * @title IInsurancePool
 * @notice On-chain, permissionless, single-asset (WUSDe) pool funded by slash
 *         excess and drawn on when a counterparty's vault doesn't cover delta.
 * @dev See prd-001-spec-0.1-canonical.md §1.8.
 */
interface IInsurancePool {
    /// @notice Deposit `amount` from the caller into the pool, tagged with the
    ///         commitment it relates to.
    function contribute(bytes32 commitmentHash, address fromCp, uint256 amount)
        external;

    /// @notice Executor-only. Transfer up to `requested` from the pool to `sink`.
    /// @return drawn Actual amount transferred (may be less than requested when
    ///         the pool is short).
    function drawFor(bytes32 commitmentHash, address sink, uint256 requested)
        external
        returns (uint256 drawn);

    function balance() external view returns (uint256);
}
