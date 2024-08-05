// SPDX-License-Identifier: MIT
pragma solidity >=0.8.2 <0.9.0;

import {IFoilStructs} from "./IFoilStructs.sol";
import "../storage/Position.sol";
import "../storage/FAccount.sol";

interface IEpochConfigurationModule {
    function initializeMarket(
        address owner,
        address collateralAsset,
        address uniswapPositionManager,
        address uniswapQuoter,
        address uniswapSwapRouter,
        address optimisticOracleV3,
        IFoilStructs.EpochParams memory epochParams
    ) external;

    function updateMarket(
        address owner,
        address uniswapPositionManager,
        address uniswapQuoter,
        address uniswapSwapRouter,
        address optimisticOracleV3,
        IFoilStructs.EpochParams memory epochParms
    ) external;

    function createEpoch(
        uint256 startTime,
        uint256 endTime,
        uint160 startingSqrtPriceX96
    ) external;

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

    function getPositionData(
        uint256 accountId
    ) external returns (Position.Data memory);

    function getAccountData(
        uint256 accountId
    ) external returns (FAccount.Data memory);
}
