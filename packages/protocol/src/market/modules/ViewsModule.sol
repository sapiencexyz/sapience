// SPDX-License-Identifier: MIT
pragma solidity >=0.8.25 <0.9.0;

import "../storage/Epoch.sol";
import "../storage/Position.sol";
import "../storage/Trade.sol";
import "../interfaces/IViewsModule.sol";
import "../interfaces/IFoilStructs.sol";
import {SafeCastU256} from "@synthetixio/core-contracts/contracts/utils/SafeCast.sol";
import {DecimalMath} from "../libraries/DecimalMath.sol";
import "forge-std/console2.sol";
contract ViewsModule is IViewsModule {
    using Position for Position.Data;
    using Epoch for Epoch.Data;
    using SafeCastU256 for uint256;
    using DecimalMath for int256;

    function getMarket()
        external
        view
        override
        returns (
            address owner,
            address collateralAsset,
            address feeCollectorNFT,
            address callbackRecipient,
            IFoilStructs.MarketParams memory marketParams
        )
    {
        Market.Data storage market = Market.load();
        return (
            market.owner,
            address(market.collateralAsset),
            address(market.feeCollectorNFT),
            address(market.callbackRecipient),
            market.marketParams
        );
    }

    function getEpoch(
        uint256 id
    )
        external
        view
        override
        returns (
            IFoilStructs.EpochData memory epochData,
            IFoilStructs.MarketParams memory params
        )
    {
        Epoch.Data storage epoch = Epoch.load(id);
        epochData = IFoilStructs.EpochData({
            epochId: epoch.id,
            startTime: epoch.startTime,
            endTime: epoch.endTime,
            pool: address(epoch.pool),
            ethToken: address(epoch.ethToken),
            gasToken: address(epoch.gasToken),
            minPriceD18: epoch.minPriceD18,
            maxPriceD18: epoch.maxPriceD18,
            baseAssetMinPriceTick: epoch.baseAssetMinPriceTick,
            baseAssetMaxPriceTick: epoch.baseAssetMaxPriceTick,
            settled: epoch.settled,
            settlementPriceD18: epoch.settlementPriceD18,
            assertionId: epoch.assertionId
        });

        return (epochData, epoch.marketParams);
    }

    function getLatestEpoch()
        external
        view
        override
        returns (
            IFoilStructs.EpochData memory epochData,
            IFoilStructs.MarketParams memory params
        )
    {
        uint256 epochId = Market.load().lastEpochId;

        if (epochId == 0) {
            revert Errors.NoEpochsCreated();
        }
        Epoch.Data storage epoch = Epoch.load(epochId);
        epochData = IFoilStructs.EpochData({
            epochId: epochId,
            startTime: epoch.startTime,
            endTime: epoch.endTime,
            pool: address(epoch.pool),
            ethToken: address(epoch.ethToken),
            gasToken: address(epoch.gasToken),
            minPriceD18: epoch.minPriceD18,
            maxPriceD18: epoch.maxPriceD18,
            baseAssetMinPriceTick: epoch.baseAssetMinPriceTick,
            baseAssetMaxPriceTick: epoch.baseAssetMaxPriceTick,
            settled: epoch.settled,
            settlementPriceD18: epoch.settlementPriceD18,
            assertionId: epoch.assertionId
        });

        return (epochData, epoch.marketParams);
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
        return Epoch.load(epochId).getReferencePrice();
    }

    function getPositionPnl(
        uint256 positionId
    ) external view override returns (int256 pnl) {
        return Position.load(positionId).getPnl();
    }

    /**
     * @inheritdoc IViewsModule
     */
    function getPositionCollateralValue(
        uint256 positionId
    ) external view override returns (uint256 collateralValue) {
        // Load the position data and ensure it's valid
        Position.Data storage position = Position.loadValid(positionId);

        int256 totalNetValue = position.getPnl();

        // Get the deposited collateral amount as an integer
        int256 depositedCollateral = position.depositedCollateralAmount.toInt();

        collateralValue = (depositedCollateral + totalNetValue) > 0
            ? uint256(depositedCollateral + totalNetValue)
            : 0;

        return collateralValue;
    }

    function getMarketTickSpacing() external view override returns (int24) {
        return Epoch.getTickSpacingForFee(Market.load().marketParams.feeRate);
    }
}
