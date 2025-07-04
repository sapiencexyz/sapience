// SPDX-License-Identifier: MIT
pragma solidity >=0.8.2 <0.9.0;

import {ISapienceStructs} from "./ISapienceStructs.sol";

interface ITradeModule {
    /** @dev Create a new trader position.
     * @param params The parameters for creating the trader position
     * @return positionId The position id.
     */
    function createTraderPosition(
        ISapienceStructs.TraderPositionCreateParams memory params
    ) external returns (uint256 positionId);

    /** @dev Modify an existing trader position.
     * @param params The parameters for modifying the trader position
     */
    function modifyTraderPosition(
        ISapienceStructs.TraderPositionModifyParams memory params
    ) external;

    /** @dev Quotes the required collateral to create a new trader position.
     * @dev warning: this function shouldn't be called on-chain since it will incur on gas usage. It executes and expect an internal txn to revert
     * @param marketId The market id.
     * @param size The position size.
     * @return requiredCollateral The required collateral.
     * @return fillPrice The virtual tokens trade fill price.
     * @return price18DigitsAfter The price after the trade.
     */
    function quoteCreateTraderPosition(
        uint256 marketId,
        int256 size
    )
        external
        returns (
            uint256 requiredCollateral,
            uint256 fillPrice,
            uint256 price18DigitsAfter
        );

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
