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
            address uniswapPositionManager,
            address uniswapSwapRouter,
            address optimisticOracleV3,
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
}
