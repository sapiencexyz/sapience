// SPDX-License-Identifier: MIT
pragma solidity >=0.8.2 <0.9.0;

import {IFoilStructs} from "./IFoilStructs.sol";

interface ITradeModule {
    /** @dev Create a new trader position.
     * @param epochId The epoch id.
     * @param size The position size.
     * @param maxCollateral The maximum collateral that can be deposited. If 0, no limit.
     * @param deadline The deadline for the transaction.
     * @return positionId The position id.
     */
    function createTraderPosition(
        uint256 epochId,
        int256 size,
        uint256 maxCollateral,
        uint256 deadline
    ) external returns (uint256 positionId);

    /** @dev Modify an existing trader position.
     * @param positionId The position id.
     * @param size The new position size.
     * @param deltaCollateralLimit The change in the collateral limit. Positive for adding collateral, negative for reomving (closing a position means minimum profit to withdraw). If 0, no limit.
     * @param deadline The deadline for the transaction.
     */
    function modifyTraderPosition(
        uint256 positionId,
        int256 size,
        int256 deltaCollateralLimit,
        uint256 deadline
    ) external;

    /** @dev Quotes the required collateral to create a new trader position.
     * @dev warning: this function shouldn't be called on-chain since it will incur on gas usage. It executes and expect an internal txn to revert
     * @param epochId The epoch id.
     * @param size The position size.
     * @return requiredCollateral The required collateral.
     * @return fillPrice The virtual tokens trade fill price.
     * @return price18DigitsAfter The price after the trade.
     */
    function quoteCreateTraderPosition(
        uint256 epochId,
        int256 size
    ) external returns (uint256 requiredCollateral, uint256 fillPrice, uint256 price18DigitsAfter);

    /** @dev Quotes the required collateral to modify an existing trader position.
     * @dev warning: this function shouldn't be called on-chain since it will incur on gas usage. It executes and expect an internal txn to revert
     * @param positionId The position id.
     * @param size The new position size.
     * @return expectedCollateralDelta The expected change in collateral. Negative means sender will receive some collateral back, positive some collateral needs to be collected.
     * @return closePnL The expected profit or loss from the original position.
     * @return fillPrice The virtual tokens trade fill price.
     * @return price18DigitsAfter The price after the trade.
     */
    function quoteModifyTraderPosition(
        uint256 positionId,
        int256 size
    )
        external
        returns (
            int256 expectedCollateralDelta,
            int256 closePnL,
            uint256 fillPrice,
            uint256 price18DigitsAfter
        );
}
