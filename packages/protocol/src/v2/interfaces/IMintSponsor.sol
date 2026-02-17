// SPDX-License-Identifier: MIT
pragma solidity ^0.8.19;

import "./IV2Types.sol";

/**
 * @title IMintSponsor
 * @notice Interface for contracts that fund a predictor's collateral on their behalf
 * @dev The escrow calls fundMint on the sponsor contract. The sponsor must
 *      transfer `collateral` to `escrow` or revert.
 */
interface IMintSponsor {
    /// @notice Fund a predictor's collateral
    /// @param escrow The escrow contract requesting funds
    /// @param predictor The predictor whose collateral is being funded
    /// @param collateral The amount of collateral to transfer to the escrow
    /// @param picks The picks in the prediction
    /// @param sponsorData Opaque data passed through from the mint request
    function fundMint(
        address escrow,
        address predictor,
        uint256 collateral,
        IV2Types.Pick[] calldata picks,
        bytes calldata sponsorData
    ) external;
}
