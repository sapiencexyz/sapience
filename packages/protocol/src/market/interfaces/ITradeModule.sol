// SPDX-License-Identifier: MIT
pragma solidity >=0.8.2 <0.9.0;

import {IFoilStructs} from "./IFoilStructs.sol";

interface ITradeModule {
    event TraderPositionCreated(
        address indexed sender,
        uint256 indexed epochId,
        uint256 indexed positionId,
        uint256 collateralAmount,
        uint256 vEthAmount,
        uint256 vGasAmount,
        uint256 borrowedVEth,
        uint256 borrowedVGas,
        uint256 initialPrice,
        uint256 finalPrice,
        uint256 tradeRatio
    );

    event TraderPositionModified(
        address indexed sender,
        uint256 indexed epochId,
        uint256 indexed positionId,
        uint256 collateralAmount,
        uint256 vEthAmount,
        uint256 vGasAmount,
        uint256 borrowedVEth,
        uint256 borrowedVGas,
        uint256 initialPrice,
        uint256 finalPrice,
        uint256 tradeRatio
    );

    /** @dev Create a new trader position.
     * @param epochId The epoch id.
     * @param size The position size.
     * @param maxCollateral The maximum collateral that can be deposited.
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
     * @param deltaCollateralLimit The change in the collateral limit. Positive for adding collateral, negative for reomving (closing a position means minimum profit to withdraw)
     * @param deadline The deadline for the transaction.
     */
    function modifyTraderPosition(
        uint256 positionId,
        int256 size,
        int256 deltaCollateralLimit,
        uint256 deadline
    ) external;

    /** @dev Quotes the required collateral to create a new trader position.
     * @param epochId The epoch id.
     * @param size The position size.
     * @return requiredCollateral The required collateral.
     * @return fillPrice The virtual tokens trade fill price.
     */
    function quoteCreateTraderPosition(
        uint256 epochId,
        int256 size
    ) external returns (uint256 requiredCollateral, uint256 fillPrice);

    /** @dev Quotes the required collateral to modify an existing trader position.
     * @param positionId The position id.
     * @param size The new position size.
     * @return expectedCollateralDelta The expected change in collateral. Negative means sender will receive some collateral back, positive some collateral needs to be collected.
     * @return closePnL The expected profit or loss from the original position.
     * @return fillPrice The virtual tokens trade fill price.
     */
    function quoteModifyTraderPosition(
        uint256 positionId,
        int256 size
    )
        external
        returns (
            int256 expectedCollateralDelta,
            int256 closePnL,
            uint256 fillPrice
        );
}
