// SPDX-License-Identifier: MIT
pragma solidity >=0.8.2 <0.9.0;

import {IFoilStructs} from "./IFoilStructs.sol";

interface ITradeViewsModule {
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
     * @return modPositionSize the absolut position size in vgas token amount
     */
    function getShortSizeForCollateral(
        uint256 epochId,
        uint256 collateral
    ) external view returns (uint256 modPositionSize);

    /**
     * @notice Gets the required collateral for a Long position as a new position
     * @param epochId the epoch id
     * @param positionSize long position size
     * @return collateral the collateral required
     */
    function getCollateralForLongSize(
        uint256 epochId,
        uint256 positionSize
    ) external view returns (uint256 collateral);

    /**
     * @notice Gets the required collateral for a Short position as a new position
     * @param epochId the epoch id
     * @param modPositionSize modulus of the short position size
     * @return collateral the collateral required
     */
    function getCollateralForShortSize(
        uint256 epochId,
        uint256 modPositionSize
    ) external view returns (uint256 collateral);
}
