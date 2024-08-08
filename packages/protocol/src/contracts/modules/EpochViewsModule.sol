// SPDX-License-Identifier: MIT
pragma solidity >=0.8.25 <0.9.0;

import "../storage/Epochs.sol";
import "../interfaces/IEpochViewsModule.sol";

contract EpochViewsModule is IEpochViewsModule {
    function getMarket()
        external
        view
        override
        returns (
            address owner,
            address collateralAsset,
            address uniswapPositionManager,
            address uniswapQuoter,
            address uniswapSwapRouter,
            address optimisticOracleV3,
            IFoilStructs.EpochParams memory epochParams
        )
    {
        Market.Data storage market = Market.load();
        return (
            market.owner,
            address(market.collateralAsset),
            address(market.uniswapPositionManager),
            address(market.uniswapQuoter),
            address(market.uniswapSwapRouter),
            address(market.optimisticOracleV3),
            market.epochParams
        );
    }

    function getEpoch(
        uint256 id
    )
        external
        view
        override
        returns (
            uint256 startTime,
            uint256 endTime,
            address pool,
            address ethToken,
            address gasToken
        )
    {
        Epoch.Data storage epoch = Epoch.load(id);
        return (
            epoch.startTime,
            epoch.endTime,
            address(epoch.pool),
            address(epoch.ethToken),
            address(epoch.gasToken)
        );
    }

    function getLatestEpoch()
        external
        view
        override
        returns (
            uint256 startTime,
            uint256 endTime,
            address pool,
            address ethToken,
            address gasToken
        )
    {
        Epoch.Data storage epoch = Epochs.getLatestEpoch();
        return (
            epoch.startTime,
            epoch.endTime,
            address(epoch.pool),
            address(epoch.ethToken),
            address(epoch.gasToken)
        );
    }

    function getPosition(
        uint256 positionId
    ) external pure override returns (Position.Data memory) {
        return Position.load(positionId);
    }
}
