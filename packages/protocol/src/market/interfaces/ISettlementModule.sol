// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

import {ISapienceStructs} from "./ISapienceStructs.sol";

/**
 * @title Interface for the SettlementModule
 * @notice This interface defines the functions for settling positions in an market
 */
interface ISettlementModule {
    /**
     * @notice Settles a position
     * @param positionId The ID of the position to settle
     */
    function settlePosition(uint256 positionId) external returns (uint256);

    /**
     * @notice The function may be called by anyone to set the settlement price to be whatever the uniswap pool price is
     * @return settlementPriceX96 settlement price that was set
     */
    function __manual_setSettlementPrice() external returns (uint160 settlementPriceX96);

    event MarketManualSettlement(uint256 marketId, uint256 settlementPriceD18);
}
