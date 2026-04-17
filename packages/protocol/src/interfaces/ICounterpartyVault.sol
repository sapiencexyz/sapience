// SPDX-License-Identifier: MIT
pragma solidity ^0.8.19;

/**
 * @title ICounterpartyVault
 * @notice Shared WUSDe-only vault backing a counterparty's outstanding quotes.
 * @dev See prd-001-spec-0.1-canonical.md §1.8.
 */
interface ICounterpartyVault {
    function deposit(uint256 amount) external;
    function withdraw(uint256 amount) external;
    function bumpEarliestWithdrawal(uint64 when) external;
    function balanceOf(address cp) external view returns (uint256);
    function earliestWithdrawal(address cp) external view returns (uint64);

    // ============ Executor-only ============

    /// @notice Drain the entire vault balance of `cp` to `sink`.
    /// @return vaultDrained Actual amount transferred.
    function slashTotal(address cp, address sink)
        external
        returns (uint256 vaultDrained);

    /// @notice Try to pull `amount` of collateral for counterparty `cp` —
    ///         first from `cp`'s wallet (via allowance), falling back to
    ///         `cp`'s vault deposit for any shortfall. Transfers the pulled
    ///         amount directly to `sink` (not via the executor).
    /// @return pulled Actual amount transferred to `sink`.
    function pullOut(address cp, uint256 amount, address sink)
        external
        returns (uint256 pulled);
}
