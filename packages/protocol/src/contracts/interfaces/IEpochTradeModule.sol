// SPDX-License-Identifier: MIT
pragma solidity >=0.8.2 <0.9.0;

import {IFoilStructs} from "./IFoilStructs.sol";

interface IEpochTradeModule {
    /**
     * @notice Create a new position for a trade
     * @param epochId the epoch id
     * @param collateralAmount amount of collateral to deposit for the position
     * @param tokenAmount size of the position as vgas token amount. Positive for long, negative for short
     * @param tokenAmountLimit token amount limit for slippage protection, 0 for no limit
     * @return positionId the id of the created position
     */
    function createTraderPosition(
        uint256 epochId,
        uint256 collateralAmount,
        int256 tokenAmount,
        int256 tokenAmountLimit
    ) external returns (uint256 positionId);

    /**
     * @notice Modify an existing trade position
     * @param positionId id of the position to modify
     * @param collateralAmount new amount of collateral to deposit for the position (not delta), if less than current will withdraw
     * @param tokenAmount new size of the position as vgas token amount. Positive for long, negative for short
     * @param tokenAmountLimit token amount limit for slippage protection, 0 for no limit
     */
    function modifyTraderPosition(
        uint256 positionId,
        uint256 collateralAmount,
        int256 tokenAmount,
        int256 tokenAmountLimit
    ) external;

    /**
     * @notice Gets the current reference price
     * @param epochId id of the epoch to get the reference price
     * @return price18Digits the reference price in 18 digits
     */
    function getReferencePrice(
        uint256 epochId
    ) external view returns (uint256 price18Digits);

    /**
     * @notice Gets the position size (Long position) for a given collateral amount as a new position
     * @param epochId the epoch id
     * @param collateral the amount of collateral that would be used
     * @return positionSize the absolut position size in vgas token amount
     */
    function getLongSizeForCollateral(
        uint256 epochId,
        uint256 collateral
    ) external view returns (uint256 positionSize);

    /**
     * @notice Gets the position size (Short position) for a given collateral amount as a new position
     * @param epochId the epoch id
     * @param collateral the amount of collateral that would be used
     * @return positionSize the absolut position size in vgas token amount
     */
    function getShortSizeForCollateral(
        uint256 epochId,
        uint256 collateral
    ) external view returns (uint256 positionSize);
}
