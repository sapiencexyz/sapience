// SPDX-License-Identifier: MIT
pragma solidity >=0.8.2 <0.9.0;

import {IFoilStructs} from "./IFoilStructs.sol";
import {Position} from "../storage/Position.sol";

interface IEpochViewsModule {
    function getMarket()
        external
        view
        returns (
            address owner,
            address collateralAsset,
            address uniswapPositionManager,
            address uniswapQuoter,
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
            address gasToken
        );

    function getLatestEpoch()
        external
        view
        returns (
            uint256 startTime,
            uint256 endTime,
            address pool,
            address ethToken,
            address gasToken
        );

    function getPosition(
        uint256 positionId
    ) external returns (Position.Data memory);
}
