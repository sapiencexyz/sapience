// SPDX-License-Identifier: MIT
pragma solidity ^0.8.19;

import "./IV2Types.sol";

/**
 * @title IMintSponsor
 * @notice Interface for contracts that sponsor a predictor's collateral during mint
 * @dev The escrow calls `fundMint` on the sponsor contract. The sponsor must
 *      transfer `collateral` of the collateral token to `escrow` or revert.
 *      The escrow verifies actual balance increase — it does not trust return values.
 */
interface IMintSponsor {
    /// @notice Fund the predictor's collateral for a mint
    /// @param escrow The escrow contract address to transfer collateral to
    /// @param predictor The predictor being sponsored
    /// @param collateral The collateral amount the sponsor must transfer
    /// @param picks The picks in the mint request
    /// @param sponsorData Opaque data passed through from the mint request
    function fundMint(
        address escrow,
        address predictor,
        uint256 collateral,
        IV2Types.Pick[] calldata picks,
        bytes calldata sponsorData
    ) external;
}
