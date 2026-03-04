// SPDX-License-Identifier: MIT
pragma solidity ^0.8.19;

import "./IV2Types.sol";

/**
 * @title IMintSponsor
 * @notice Interface for contracts that sponsor a predictor's collateral during mint
 * @dev The escrow calls `fundMint` on the sponsor contract. The sponsor must
 *      transfer `collateral` of the collateral token to `escrow` or revert.
 *      The escrow verifies actual balance increase — it does not trust return values.
 *      The full MintRequest is passed so sponsors can enforce arbitrary constraints
 *      (counterparty identity, entry price caps, pick requirements, etc.).
 */
interface IMintSponsor {
    /// @notice Fund the predictor's collateral for a mint
    /// @param escrow The escrow contract address to transfer collateral to
    /// @param request The full mint request (predictor, counterparty, collateral, picks, etc.)
    function fundMint(address escrow, IV2Types.MintRequest calldata request)
        external;
}
