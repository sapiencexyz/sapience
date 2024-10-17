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
            IFoilStructs.EpochParams memory epochParams
        );

    function getEpoch(
        uint256 id
    )
        external
        view
        returns (
            uint256 startTime,
            uint256 endTime,
            address pool,
            address ethToken,
            address gasToken,
            uint256 minPriceD18,
            uint256 maxPriceD18,
            bool settled,
            uint256 settlementPriceD18,
            IFoilStructs.EpochParams memory epochParams
        );

    function getLatestEpoch()
        external
        view
        returns (
            uint256 epochId,
            uint256 startTime,
            uint256 endTime,
            address pool,
            address ethToken,
            address gasToken,
            uint256 minPriceD18,
            uint256 maxPriceD18,
            bool settled,
            uint256 settlementPriceD18,
            IFoilStructs.EpochParams memory epochParams
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

    function getPositionCollateralValue(uint256 positionId) external view returns (uint256 collateralValue);
}
