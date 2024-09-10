// SPDX-License-Identifier: MIT
pragma solidity >=0.8.2 <0.9.0;

import {IFoilStructs} from "./IFoilStructs.sol";

interface IConfigurationModule {
    event MarketInitialized(
        address owner,
        address collateralAsset,
        address uniswapPositionManager,
        address uniswapSwapRouter,
        address optimisticOracleV3,
        IFoilStructs.EpochParams epochParams
    );

    event MarketUpdated(
        address uniswapPositionManager,
        address uniswapSwapRouter,
        address optimisticOracleV3,
        IFoilStructs.EpochParams epochParams
    );

    event EpochCreated(
        uint epochId,
        uint256 startTime,
        uint256 endTime,
        uint160 startingSqrtPriceX96
    );
    
    event OwnershipTransferStarted(
        address indexed previousOwner,
        address indexed newOwner
    );

    function initializeMarket(
        address owner,
        address collateralAsset,
        address uniswapPositionManager,
        address uniswapSwapRouter,
        address optimisticOracleV3,
        IFoilStructs.EpochParams memory epochParams
    ) external;

    function updateMarket(
        address uniswapPositionManager,
        address uniswapSwapRouter,
        address optimisticOracleV3,
        IFoilStructs.EpochParams memory epochParams
    ) external;

    function createEpoch(
        uint256 startTime,
        uint256 endTime,
        uint160 startingSqrtPriceX96
    ) external;
}
