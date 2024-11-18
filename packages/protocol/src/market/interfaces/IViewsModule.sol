// SPDX-License-Identifier: MIT
pragma solidity >=0.8.2 <0.9.0;

import {IFoilStructs} from "./IFoilStructs.sol";
import {Position} from "../storage/Position.sol";

interface IViewsModule {
    function getMarket()
        external
        view
        returns (
            address owner,
            address collateralAsset,
            address feeCollectorNFT,
            address callbackRecipient,
            IFoilStructs.MarketParams memory marketParams
        );

    function getEpoch(
        uint256 id
    )
        external
        view
        returns (
            IFoilStructs.EpochData memory epochData,
            IFoilStructs.MarketParams memory marketParams
        );

    function getLatestEpoch()
        external
        view
        returns (
            IFoilStructs.EpochData memory epochData,
            IFoilStructs.MarketParams memory marketParams
        );

    function getPosition(
        uint256 positionId
    ) external returns (Position.Data memory);

    function getPositionSize(uint256 positionId) external returns (int256);

    /**
     * @notice Gets the current reference price
     * @param epochId id of the epoch to get the reference price
     * @return sqrtPriceX96 the pool's current sqrt price or zero if the epoch is settled
     */
    function getSqrtPriceX96(
        uint256 epochId
    ) external view returns (uint160 sqrtPriceX96);

    /**
     * @notice Gets the current reference price
     * @param epochId id of the epoch to get the reference price
     * @return price18Digits the reference price in 18 digits
     */
    function getReferencePrice(
        uint256 epochId
    ) external view returns (uint256 price18Digits);

    /**
     * @notice Gets the current value of a position
     * @param positionId id of the position
     * @return collateralValue value of the position, collateral denominated
     */
    function getPositionCollateralValue(
        uint256 positionId
    ) external view returns (uint256 collateralValue);
}
