// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

import {IFoilStructs} from "./IFoilStructs.sol";

/**
 * @title Interface for the SettlementModule
 * @notice This interface defines the functions for settling positions in an epoch
 */
interface ISettlementModule {
    /**
     * @notice Settles a position
     * @param positionId The ID of the position to settle
     */
    function settlePosition(uint256 positionId) external returns (uint256);
}
