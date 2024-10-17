// SPDX-License-Identifier: MIT
pragma solidity >=0.8.25 <0.9.0;

import "../storage/Epoch.sol";
import "../storage/Position.sol";
import "../storage/Trade.sol";
import "../interfaces/IViewsModule.sol";
import "../interfaces/IFoilStructs.sol";

contract ViewsModule is IViewsModule {
    using Position for Position.Data;

    function getMarket()
        external
        view
        override
        returns (
            address owner,
            address collateralAsset,
            address feeCollectorNFT,
            IFoilStructs.EpochParams memory epochParams
        )
    {
        Market.Data storage market = Market.load();
        return (
            market.owner,
            address(market.collateralAsset),
            address(market.feeCollectorNFT),
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
            address gasToken,
            uint256 minPriceD18,
            uint256 maxPriceD18,
            bool settled,
            uint256 settlementPriceD18,
            IFoilStructs.EpochParams memory params
        )
    {
        Epoch.Data storage epoch = Epoch.load(id);
        return (
            epoch.startTime,
            epoch.endTime,
            address(epoch.pool),
            address(epoch.ethToken),
            address(epoch.gasToken),
            epoch.minPriceD18,
            epoch.maxPriceD18,
            epoch.settled,
            epoch.settlementPriceD18,
            epoch.params
        );
    }

    function getLatestEpoch()
        external
        view
        override
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
            IFoilStructs.EpochParams memory params
        )
    {
        epochId = Market.load().lastEpochId;

        if (epochId == 0) {
            revert Errors.NoEpochsCreated();
        }
        Epoch.Data storage epoch = Epoch.load(epochId);

        return (
            epochId,
            epoch.startTime,
            epoch.endTime,
            address(epoch.pool),
            address(epoch.ethToken),
            address(epoch.gasToken),
            epoch.minPriceD18,
            epoch.maxPriceD18,
            epoch.settled,
            epoch.settlementPriceD18,
            epoch.params
        );
    }

    function getPosition(
        uint256 positionId
    ) external pure override returns (Position.Data memory) {
        return Position.load(positionId);
    }

    function getPositionSize(
        uint256 positionId
    ) external view override returns (int256) {
        Position.Data storage position = Position.load(positionId);
        return position.positionSize();
    }

    /**
     * @inheritdoc IViewsModule
     */
    function getSqrtPriceX96(
        uint256 epochId
    ) external view override returns (uint160 sqrtPriceX96) {
        Epoch.Data storage epoch = Epoch.load(epochId);

        if (!epoch.settled) {
            (sqrtPriceX96, , , , , , ) = epoch.pool.slot0();
        }
    }

    /**
     * @inheritdoc IViewsModule
     */
    function getReferencePrice(
        uint256 epochId
    ) external view override returns (uint256 price18Digits) {
        return Trade.getReferencePrice(epochId);
    }
}
