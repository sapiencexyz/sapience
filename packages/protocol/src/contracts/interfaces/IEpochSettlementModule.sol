// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

import {IFoilStructs} from "./IFoilStructs.sol";

/**
 * @title Interface for the EpochSettlementModule
 * @notice This interface defines the functions for settling positions in an epoch
 */
interface IEpochSettlementModule {
    /**
     * @notice Settles a position
     * @param positionId The ID of the position to settle
     */
    function settlePosition(uint256 positionId) external;

    /**
     * @notice Event emitted when a position is settled
     * @param positionId The ID of the settled position
     * @param kind The kind of position that was settled
     */
    event PositionSettled(uint256 positionId, IFoilStructs.PositionKind kind);
}
